// ─────────────────────────────────────────────────────────────────────────
// Modale "Ajouter un score" : grille de sets par équipe, vainqueur déduit
// automatiquement, ou "pas de score" pour un match amical / équipes changées.
//
// Depuis le 18/09/2026 (voir claude/feature-ranking-padel-manager.md) : toute
// écriture d'un score exploitable (premier encodage OU correction d'un score
// déjà traité) met aussi à jour le Ranking des 4 joueurs concernés, via le
// moteur partagé src/lib/levelRating.js — voir applyMatchAndRanking() plus
// bas, dupliquée à l'identique dans PostMatchModal.jsx (même principe que le
// reste de la logique de saisie de score, déjà dupliquée entre ces deux
// fichiers avant ce projet).
// ─────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { doc, writeBatch, deleteField } from "firebase/firestore";
import { db } from "../../firebase";
import { cn } from "../../lib/utils";
import { computeWinnerFromSets, hasMatchScore } from "../../lib/matchLogic";
import { computeRankingUpdateForMatch, cancelRankingForMatch, UNRANK_PLAYER } from "../../lib/levelRating";
import { useAppData } from "../../context/AppContext";
import { Modal, Button } from "../ui";

// Applique en une seule écriture atomique (writeBatch) le score du match ET,
// s'il y a un score exploitable (ou s'il y en avait un avant cette
// correction), la mise à jour du Ranking des 4 joueurs — voir
// src/lib/levelRating.js (§4.1-§4.9 de la spec). Le Ranking reste
// "best-effort" : si les 4 participants ne forment pas exactement 2 équipes
// de 2 joueurs identifiables (cas qui ne devrait jamais arriver en usage
// réel, voir §5 de la spec), `computeRankingUpdateForMatch` renvoie `null`
// et seul le score est enregistré, sans bloquer l'enregistrement.
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
    // Le score exploitable a disparu (correction) : on annule l'ancien
    // ajustement sans en appliquer de nouveau — voir §4.8.B de la spec.
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

export function EndMatchModal({ match, onClose }) {
  const { players } = useAppData();

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

  const teamAParticipants = (match.participants || []).filter((p) => p.team === "A");
  const teamBParticipants = (match.participants || []).filter((p) => p.team === "B");
  const teamLabel = (list, fallback) =>
    list.length
      ? list
          .map((p) => players.find((pl) => pl.id === p.playerId)?.name || p.name)
          .join(" & ")
      : fallback;

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

  // Un score saisi ici correspond toujours à un match officiel — les deux
  // boutons "Pas de score" ci-dessous couvrent déjà les autres cas.
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

  // Les deux cas "pas de score" enregistrent et referment immédiatement,
  // sans passer par le bouton principal.
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
    { side: "a", label: teamLabel(teamAParticipants, "Équipe A"), tone: true },
    { side: "b", label: teamLabel(teamBParticipants, "Équipe B"), tone: false },
  ];

  return (
    <Modal
      title="Ajouter un score"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </>
      }
    >
      <p className="text-xs text-[var(--color-text-dim)] mb-4">
        Le vainqueur est déterminé automatiquement à partir des sets encodés
        ci-dessous.
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
    </Modal>
  );
}
