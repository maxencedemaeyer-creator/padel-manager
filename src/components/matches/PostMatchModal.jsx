// ─────────────────────────────────────────────────────────────────────────
// Modale "portier" affichée automatiquement (voir PostMatchPrompt.jsx) quand
// un match vient de se terminer sans score : permet au joueur concerné (ou à
// un créancier / admin) de corriger la composition si besoin, puis d'encoder
// le score lui-même — sans attendre que l'admin s'en charge.
// ─────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { doc, writeBatch, deleteField } from "firebase/firestore";
import { db } from "../../firebase";
import { cn, formatDateFR, formatTimeFR } from "../../lib/utils";
import { COURT_SLOT_DEFS } from "../../lib/constants";
import { getCourtSlots, computeWinnerFromSets, hasMatchScore } from "../../lib/matchLogic";
import { computeRankingUpdateForMatch, cancelRankingForMatch, UNRANK_PLAYER } from "../../lib/levelRating";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal, Button } from "../ui";
import { PlayerSlotCard } from "./PlayerSlotCard";
import { PickPlayerModal } from "./PickPlayerModal";

// Voir le commentaire détaillé dans EndMatchModal.jsx (même fonction,
// dupliquée à l'identique — même principe que le reste de la logique de
// saisie de score, déjà dupliquée entre ces deux fichiers avant ce projet) :
// applique en une seule écriture atomique le score du match ET, s'il y a un
// score exploitable (ou s'il y en avait un avant cette correction), la mise
// à jour du Ranking des 4 joueurs — voir src/lib/levelRating.js.
async function applyMatchAndRanking({ match, players, sets, matchType, winningTeam, teamsUnreliable }) {
  const batch = writeBatch(db);
  const matchUpdate = { scores: sets, matchType, winningTeam, teamsUnreliable };

  const teamAIds = (match.participants || [])
    .filter((p) => p.team === "A")
    .map((p) => p.playerId);
  const teamBIds = (match.participants || [])
    .filter((p) => p.team === "B")
    .map((p) => p.playerId);
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]));
  const previousLevelDeltas = match.levelDeltas || null;
  const hasScore = hasMatchScore({ scores: sets });

  let rankingResult = null;
  if (hasScore) {
    rankingResult = computeRankingUpdateForMatch({
      teamAIds,
      teamBIds,
      playersById,
      sets,
      winningTeam,
      previousLevelDeltas,
    });
    if (rankingResult) matchUpdate.levelDeltas = rankingResult.levelDeltas;
  } else if (previousLevelDeltas) {
    rankingResult = cancelRankingForMatch({ previousLevelDeltas, playersById });
    matchUpdate.levelDeltas = deleteField();
  }

  batch.update(doc(db, "matches", match.id), matchUpdate);

  if (rankingResult) {
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

  await batch.commit();
}

export function PostMatchModal({ match, onClose }) {
  const { isAdmin, players } = useAppData();
  const [pickSlot, setPickSlot] = useState(null); // { team, courtSide, participant } | null

  const initSet = (set) => {
    if (set && typeof set === "object") return { a: set.a ?? "", b: set.b ?? "" };
    if (typeof set === "string" && set.includes("-")) {
      const [a, b] = set.split("-");
      return { a: (a || "").trim(), b: (b || "").trim() };
    }
    return { a: "", b: "" };
  };
  const [sets, setSets] = useState(() => ({
    set1: initSet(match.scores?.set1),
    set2: initSet(match.scores?.set2),
    set3: initSet(match.scores?.set3),
  }));
  const [saving, setSaving] = useState(false);

  const playerById = (id) => players.find((p) => p.id === id);
  const slots = getCourtSlots(match);

  const renderSlot = (def) => {
    const participant = slots[def.key];
    return (
      <PlayerSlotCard
        key={def.key}
        participant={participant}
        playerRecord={participant ? playerById(participant.playerId) : null}
        canAssign
        canSelfManage={false}
        isSelfSlot={false}
        canPay={false}
        isCreditorParticipant={false}
        trackPayments={false}
        slotTeam={def.team}
        slotSide={def.side}
        isWinningTeam={false}
        isAdmin={isAdmin}
        onAssignClick={() => setPickSlot({ team: def.team, courtSide: def.side, participant })}
        onSelfClick={() => {}}
        onPayClick={() => {}}
      />
    );
  };

  const updateSet = (key, side, value) => {
    const digits = value.replace(/\D/g, "").slice(0, 2);
    setSets((prev) => ({ ...prev, [key]: { ...prev[key], [side]: digits } }));
  };
  const isSuspicious = (v) => v !== "" && Number(v) > 7;
  const anySuspicious = ["set1", "set2", "set3"].some(
    (k) => isSuspicious(sets[k].a) || isSuspicious(sets[k].b)
  );
  // Avertissement discret (voir §5 de la spec) : si rien d'exploitable n'est
  // saisi, le score s'enregistre normalement mais le Ranking ne bouge pas.
  const noExploitableData = !hasMatchScore({ scores: sets });

  const submit = async () => {
    setSaving(true);
    try {
      await applyMatchAndRanking({
        match,
        players,
        sets,
        matchType: "Officiel",
        winningTeam: computeWinnerFromSets(sets),
        teamsUnreliable: false,
      });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const noScore = async (teamsChanged) => {
    setSaving(true);
    try {
      await applyMatchAndRanking({
        match,
        players,
        sets: { set1: null, set2: null, set3: null },
        matchType: "Amical",
        winningTeam: null,
        teamsUnreliable: teamsChanged,
      });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    { side: "a", label: "Équipe A", tone: true },
    { side: "b", label: "Équipe B", tone: false },
  ];

  return (
    <Modal
      title="Match terminé"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Plus tard
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer le score"}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--color-surface-2)] mb-1">
        <Icon.Bell className="w-4 h-4 text-[var(--color-lime)] shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--color-text-dim)]">
          Le match du <span className="font-semibold text-[var(--color-text)]">
            {formatDateFR(match.date)}{match.time ? ` à ${formatTimeFR(match.time)}` : ""}
          </span>
          {match.location ? ` (${match.location})` : ""} est terminé et n'a pas encore de
          score. Vérifiez la composition si besoin, puis encodez le résultat.
        </p>
      </div>

      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] mt-3 mb-2">
        Composition
      </p>
      <div className="grid grid-cols-2 gap-2 mb-1">
        {renderSlot(COURT_SLOT_DEFS[0])}
        {renderSlot(COURT_SLOT_DEFS[1])}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {renderSlot(COURT_SLOT_DEFS[2])}
        {renderSlot(COURT_SLOT_DEFS[3])}
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
              {row.label}
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
                  row.tone
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-sky-200 bg-sky-50"
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
      {noExploitableData && (
        <p className="text-[var(--color-text-faint)] text-[11px] mb-2">
          Aucun score exploitable saisi pour l'instant — le Ranking ne sera pas mis à jour.
        </p>
      )}

      <div className="flex flex-col gap-2 mt-3">
        <Button
          variant="secondary"
          className="w-full !text-xs"
          onClick={() => noScore(true)}
          disabled={saving}
        >
          Pas de score — Les équipes ont changé au cours du match
        </Button>
        <Button
          variant="secondary"
          className="w-full !text-xs"
          onClick={() => noScore(false)}
          disabled={saving}
        >
          Pas de score — Match amical
        </Button>
      </div>

      {pickSlot && (
        <PickPlayerModal
          match={match}
          team={pickSlot.team}
          courtSide={pickSlot.courtSide}
          currentParticipant={pickSlot.participant}
          onClose={() => setPickSlot(null)}
        />
      )}
    </Modal>
  );
}
