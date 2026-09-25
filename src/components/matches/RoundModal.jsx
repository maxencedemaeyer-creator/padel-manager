// ─────────────────────────────────────────────────────────────────────────
// Modale « Ajouter une manche » (ajoutée le 25/09/2026) : quand les équipes
// changent en cours de session, on encode la nouvelle composition et son
// score, sans jamais toucher à la composition de base du match (donc sans
// rien changer à la comptabilité).
//
// - Composition : 4 places vierges (2 équipes de 2, avec côté droite/gauche),
//   à remplir soi-même. Les joueurs de la session sont proposés en premier,
//   puis tous les autres joueurs.
// - Score : mêmes sets que l'encodage habituel (1, 2 ou 3 sets), ou
//   « Pas de score ».
// - Stockage : la manche est rangée dans le champ `rounds` du même document
//   `matches/{id}` (voir src/lib/rounds.js) — jamais dans `participants`.
// - Niveau : le bonus d'assiduité n'est versé qu'une fois par session ; le
//   résultat de la manche compte à 60 % (voir levelRating.js, v4).
//
// Le même composant sert à MODIFIER une manche existante (admin, depuis la
// roulette ⚙️ de la manche) : passer `roundIndex` (1 = première manche
// ajoutée). `deleteRoundAndRanking` (exporté) supprime une manche et annule
// son effet sur le niveau.
// ─────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from "react";
import { doc, writeBatch, deleteField } from "firebase/firestore";
import { db } from "../../firebase";
import { cn, getFirstName } from "../../lib/utils";
import { COURT_SLOT_DEFS } from "../../lib/constants";
import { computeWinnerFromSets, hasMatchScore } from "../../lib/matchLogic";
import {
  computeRankingUpdateForMatch,
  cancelRankingForMatch,
  UNRANK_PLAYER,
} from "../../lib/levelRating";
import { getRounds } from "../../lib/rounds";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal, Button } from "../ui";

// Objet "manche virtuelle" attendu par le moteur de niveau (même date, heure,
// club que le match ; identifiant et numéro de manche propres).
function virtualRoundOf(match, roundNumber) {
  return {
    id: `${match.id}#r${roundNumber}`,
    baseId: match.id,
    roundIndex: roundNumber,
    isExtraRound: true,
    date: match.date,
    time: match.time,
    clubId: match.clubId,
  };
}

// Reporte sur les documents joueurs les nouveaux niveaux calculés.
function applyPlayerUpdates(batch, rankingResult) {
  if (!rankingResult) return;
  Object.entries(rankingResult.playerUpdates).forEach(([playerId, update]) => {
    const playerRef = doc(db, "players", playerId);
    if (update === UNRANK_PLAYER) {
      batch.update(playerRef, {
        internalScore: deleteField(),
        internalScoreReliability: deleteField(),
      });
    } else {
      batch.update(playerRef, update);
    }
  });
}

// Écrit (ajout ou modification) une manche + met à jour le niveau des 4
// joueurs, en une seule écriture atomique.
async function saveRoundAndRanking({
  match,
  roundIndex, // null = nouvelle manche ; 1, 2… = modification
  participants,
  sets,
  matchType,
  players,
  matches,
  createdBy,
}) {
  const rounds = getRounds(match);
  const isEdit = roundIndex != null;
  const targetIdx = isEdit ? roundIndex - 1 : rounds.length;
  const previous = isEdit ? rounds[targetIdx] || {} : {};
  const previousLevelDeltas = previous.levelDeltas || null;

  const winningTeam = matchType === "Officiel" ? computeWinnerFromSets(sets) : null;
  const hasScore = hasMatchScore({ scores: sets });
  const bonusOnly = !hasScore && matchType === "Amical";
  const teamAIds = participants.filter((p) => p.team === "A").map((p) => p.playerId);
  const teamBIds = participants.filter((p) => p.team === "B").map((p) => p.playerId);
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]));

  let rankingResult = null;
  let levelDeltas = null;
  if (hasScore || bonusOnly) {
    rankingResult = computeRankingUpdateForMatch({
      teamAIds,
      teamBIds,
      playersById,
      sets,
      winningTeam,
      previousLevelDeltas,
      matches,
      match: virtualRoundOf(match, targetIdx + 1),
      bonusOnly,
    });
    if (rankingResult && Object.keys(rankingResult.levelDeltas).length > 0) {
      levelDeltas = rankingResult.levelDeltas;
    }
  }
  if (!rankingResult && previousLevelDeltas) {
    // Plus rien d'exploitable : on annule l'ancien ajustement sans en appliquer.
    rankingResult = cancelRankingForMatch({ previousLevelDeltas, playersById });
  }

  const newRound = {
    participants,
    scores: sets,
    winningTeam,
    matchType,
    createdAt: previous.createdAt || new Date().toISOString(),
    createdBy: previous.createdBy ?? createdBy ?? null,
  };
  if (levelDeltas) newRound.levelDeltas = levelDeltas;

  const newRounds = [...rounds];
  newRounds[targetIdx] = newRound;

  const batch = writeBatch(db);
  batch.update(doc(db, "matches", match.id), { rounds: newRounds });
  applyPlayerUpdates(batch, rankingResult);
  await batch.commit();
}

// Supprime une manche (admin) et annule son effet sur le niveau.
export async function deleteRoundAndRanking({ match, roundIndex, players }) {
  const rounds = getRounds(match);
  const target = rounds[roundIndex - 1];
  if (!target) return;
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]));
  const rankingResult = target.levelDeltas
    ? cancelRankingForMatch({ previousLevelDeltas: target.levelDeltas, playersById })
    : null;
  const newRounds = rounds.filter((_, i) => i !== roundIndex - 1);
  const batch = writeBatch(db);
  batch.update(doc(db, "matches", match.id), {
    rounds: newRounds.length > 0 ? newRounds : deleteField(),
  });
  applyPlayerUpdates(batch, rankingResult);
  await batch.commit();
}

const EMPTY_SLOTS = { topLeft: null, topRight: null, bottomLeft: null, bottomRight: null };

// Place chaque participant d'une manche existante dans sa case (équipe + côté).
function slotsFromParticipants(participants) {
  const slots = { ...EMPTY_SLOTS };
  (participants || []).forEach((p) => {
    const def =
      COURT_SLOT_DEFS.find((d) => d.team === p.team && d.side === p.courtSide && !slots[d.key]) ||
      COURT_SLOT_DEFS.find((d) => d.team === p.team && !slots[d.key]);
    if (def) slots[def.key] = p.playerId;
  });
  return slots;
}

function initSet(set) {
  if (set && typeof set === "object") return { a: set.a ?? "", b: set.b ?? "" };
  return { a: "", b: "" };
}

// Nom court d'un terrain pour le sélecteur (« Terrain 6 », sinon le lieu).
function courtLabelOf(m) {
  if (m.court != null && String(m.court).trim() !== "") return `Terrain ${m.court}`;
  return m.location || "Terrain";
}

// `match` : le match (terrain) qui reçoit la manche — obligatoire pour modifier.
// `courtChoices` : pour un ajout depuis le bouton « + » du bloc résultat, la
// liste des terrains possibles ; si elle en compte plusieurs, la fenêtre
// demande sur quel terrain se fait la manche (celui du joueur connecté est
// présélectionné).
export function RoundModal({
  match: matchProp,
  courtChoices = null,
  sessionMatches,
  roundIndex = null,
  onClose,
}) {
  const { players, matches, connectedPlayer } = useAppData();
  const choices = courtChoices && courtChoices.length > 0 ? courtChoices : [matchProp];
  const [courtId, setCourtId] = useState(() => {
    const mine = choices.find((m) =>
      (m.participants || []).some((p) => p.playerId === connectedPlayer?.id)
    );
    return (mine || choices[0]).id;
  });
  const match = choices.find((m) => m.id === courtId) || choices[0];
  const isEdit = roundIndex != null;
  const existing = isEdit ? getRounds(match)[roundIndex - 1] : null;

  const [slots, setSlots] = useState(() =>
    existing ? slotsFromParticipants(existing.participants) : { ...EMPTY_SLOTS }
  );
  const [sets, setSets] = useState(() => ({
    set1: initSet(existing?.scores?.set1),
    set2: initSet(existing?.scores?.set2),
    set3: initSet(existing?.scores?.set3),
  }));
  const [pickSlot, setPickSlot] = useState(null); // clé de case | null
  const [saving, setSaving] = useState(false);

  const playerById = (id) => players.find((p) => p.id === id);
  const nameOf = (id) => {
    const p = playerById(id);
    return p ? getFirstName(p.name) : "?";
  };
  const allFilled = COURT_SLOT_DEFS.every((d) => slots[d.key]);
  const noExploitableData = !hasMatchScore({ scores: sets });

  const updateSet = (key, side, value) => {
    const digits = value.replace(/\D/g, "").slice(0, 2);
    setSets((prev) => ({ ...prev, [key]: { ...prev[key], [side]: digits } }));
  };
  const isSuspicious = (v) => v !== "" && Number(v) > 7;
  const anySuspicious = ["set1", "set2", "set3"].some(
    (k) => isSuspicious(sets[k].a) || isSuspicious(sets[k].b)
  );

  const teamLabel = (team) => {
    const names = COURT_SLOT_DEFS.filter((d) => d.team === team && slots[d.key]).map((d) =>
      nameOf(slots[d.key])
    );
    return names.length ? names.join(" & ") : `Équipe ${team}`;
  };

  const buildParticipants = () =>
    COURT_SLOT_DEFS.map((d) => ({
      playerId: slots[d.key],
      name: playerById(slots[d.key])?.name || "",
      team: d.team,
      courtSide: d.side,
    }));

  const save = async (matchType, scoreSets) => {
    if (!allFilled) return;
    setSaving(true);
    try {
      await saveRoundAndRanking({
        match,
        roundIndex,
        participants: buildParticipants(),
        sets: scoreSets,
        matchType,
        players,
        matches,
        createdBy: connectedPlayer?.id,
      });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Joueurs proposés dans le sélecteur : ceux de la session en premier.
  const sessionIds = useMemo(() => {
    const ids = new Set();
    (sessionMatches || [match]).forEach((m) =>
      (m.participants || []).forEach((p) => p.playerId && ids.add(p.playerId))
    );
    return ids;
  }, [sessionMatches, match]);

  const rows = [
    { side: "a", team: "A", tone: true },
    { side: "b", team: "B", tone: false },
  ];

  return (
    <Modal
      title={isEdit ? `Modifier la manche ${roundIndex + 1}` : "Ajouter une manche"}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button
            onClick={() => save("Officiel", sets)}
            disabled={saving || !allFilled || noExploitableData}
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </>
      }
    >
      {!isEdit && choices.length > 1 && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] mb-2">
            Terrain
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {choices.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setCourtId(m.id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-bold border transition-all",
                  m.id === courtId
                    ? "border-sky-400 bg-sky-50 text-sky-800"
                    : "border-[var(--color-border)] bg-white text-[var(--color-text-dim)]"
                )}
              >
                {courtLabelOf(m)}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="text-xs text-[var(--color-text-dim)] mb-3">
        Placez les 4 joueurs de cette manche (équipes changées en cours de session), puis
        encodez son score. La composition de base du match et la comptabilité ne changent pas.
      </p>

      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] mb-2">
        Composition
      </p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {COURT_SLOT_DEFS.map((def) => {
          const playerId = slots[def.key];
          return (
            <button
              key={def.key}
              type="button"
              onClick={() => setPickSlot(def.key)}
              className={cn(
                "flex flex-col items-stretch p-3 rounded-2xl border-2 min-h-[76px] text-left transition-all",
                playerId
                  ? def.team === "A"
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-sky-200 bg-sky-50"
                  : "border-dashed border-[var(--color-border)] bg-white/25 text-[var(--color-text-faint)] hover:border-sky-300"
              )}
            >
              <span className="self-end px-1.5 py-0.5 rounded-full bg-white/85 border border-white/70 text-[8px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] whitespace-nowrap mb-1">
                Team {def.team} · {def.side}
              </span>
              <span className="flex-1 flex items-center justify-center gap-1 text-sm font-semibold text-center">
                {playerId ? (
                  nameOf(playerId)
                ) : (
                  <>
                    <Icon.Plus className="w-4 h-4" />
                    <span className="text-[11px] font-medium">Choisir un joueur</span>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="h-px bg-[var(--color-border)] mb-3" />

      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] mb-2">
        Score
      </p>
      <div className="grid grid-cols-[1fr_48px_48px_48px] gap-2 items-center mb-2">
        <span />
        {["Set 1", "Set 2", "Set 3"].map((label) => (
          <span
            key={label}
            className="text-center text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-faint)]"
          >
            {label}
          </span>
        ))}
      </div>
      {rows.map((row, i) => (
        <React.Fragment key={row.side}>
          <div className="grid grid-cols-[1fr_48px_48px_48px] gap-2 items-center mb-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold truncate pr-2">
              <span
                className={cn(
                  "w-2.5 h-2.5 rounded-full shrink-0",
                  row.tone ? "bg-emerald-400" : "bg-sky-400"
                )}
              />
              {teamLabel(row.team)}
            </span>
            {["set1", "set2", "set3"].map((k) => (
              <input
                key={k}
                type="text"
                inputMode="numeric"
                value={sets[k][row.side]}
                onChange={(e) => updateSet(k, row.side, e.target.value)}
                className={cn(
                  "w-12 h-12 rounded-xl border text-center text-lg font-bold pm-mono focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-300",
                  row.tone ? "border-emerald-200 bg-emerald-50" : "border-sky-200 bg-sky-50"
                )}
              />
            ))}
          </div>
          {i === 0 && <div className="h-px bg-[var(--color-border)] mb-2" />}
        </React.Fragment>
      ))}
      {anySuspicious && (
        <p className="text-[var(--color-danger)] text-[11px] font-semibold mb-2">
          ⚠️ Un score de set dépasse généralement 7 jeux — vérifiez la saisie.
        </p>
      )}
      {!allFilled && (
        <p className="text-[var(--color-text-faint)] text-[11px] mb-2">
          Placez les 4 joueurs pour pouvoir enregistrer.
        </p>
      )}

      <div className="flex flex-col gap-2 mt-3">
        <Button
          variant="secondary"
          className="w-full !text-xs"
          onClick={() => save("Amical", { set1: null, set2: null, set3: null })}
          disabled={saving || !allFilled}
        >
          Pas de score
        </Button>
        <p className="text-[var(--color-text-faint)] text-[11px] text-center">
          Le bonus de régularité n'est versé qu'une fois par session ; le résultat d'une manche
          supplémentaire compte un peu moins que celui du match de base.
        </p>
      </div>

      {pickSlot && (
        <PlayerPickerModal
          players={players}
          sessionIds={sessionIds}
          takenIds={COURT_SLOT_DEFS.filter((d) => d.key !== pickSlot)
            .map((d) => slots[d.key])
            .filter(Boolean)}
          currentId={slots[pickSlot]}
          onPick={(id) => {
            setSlots((prev) => ({ ...prev, [pickSlot]: id }));
            setPickSlot(null);
          }}
          onClear={() => {
            setSlots((prev) => ({ ...prev, [pickSlot]: null }));
            setPickSlot(null);
          }}
          onClose={() => setPickSlot(null)}
        />
      )}
    </Modal>
  );
}

// Sélecteur de joueur : les joueurs de la session d'abord, puis tous les
// autres joueurs actifs (remplaçants, réserve, autre terrain…).
function PlayerPickerModal({ players, sessionIds, takenIds, currentId, onPick, onClear, onClose }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const candidates = players
    .filter((p) => !p.isTest && !takenIds.includes(p.id))
    .filter((p) => !q || String(p.name || "").toLowerCase().includes(q))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr"));
  const inSession = candidates.filter((p) => sessionIds.has(p.id));
  const others = candidates.filter((p) => !sessionIds.has(p.id));

  const renderList = (list) =>
    list.map((p) => (
      <button
        key={p.id}
        type="button"
        onClick={() => onPick(p.id)}
        className={cn(
          "w-full text-left px-3 py-2.5 rounded-xl border text-sm font-medium transition-all",
          p.id === currentId
            ? "border-sky-400 bg-sky-50"
            : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-sky-300"
        )}
      >
        {p.name}
      </button>
    ));

  return (
    <Modal
      title="Choisir un joueur"
      onClose={onClose}
      footer={
        <>
          {currentId && (
            <Button variant="secondary" onClick={onClear}>
              Retirer
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </>
      }
    >
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un joueur"
        className="w-full mb-3 px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm focus:outline-none focus:border-sky-300"
      />
      {inSession.length > 0 && (
        <>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
            Joueurs de la session
          </p>
          <div className="flex flex-col gap-1.5 mb-3">{renderList(inSession)}</div>
        </>
      )}
      {others.length > 0 && (
        <>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
            Autres joueurs
          </p>
          <div className="flex flex-col gap-1.5">{renderList(others)}</div>
        </>
      )}
      {inSession.length === 0 && others.length === 0 && (
        <p className="text-sm text-[var(--color-text-faint)] italic">Aucun joueur trouvé.</p>
      )}
    </Modal>
  );
}
