// ─────────────────────────────────────────────────────────────────────────
// Modale admin "assigner / remplacer un joueur" sur une place de terrain,
// avec détection des conflits (déjà engagé ce jour-là ailleurs, ou ayant
// répondu absent à cette session).
// ─────────────────────────────────────────────────────────────────────────
import { useState, useMemo } from "react";
import { doc, updateDoc, writeBatch, deleteField } from "firebase/firestore";
import { db } from "../../firebase";
import { cn, formatDateFR } from "../../lib/utils";
import { useAppData } from "../../context/AppContext";
import { hasMatchScore, getCourtSlots } from "../../lib/matchLogic";
import { COURT_SLOT_DEFS } from "../../lib/constants";
import { getRounds } from "../../lib/rounds";
import { PlayerSlotCard } from "./PlayerSlotCard";
import {
  computeRankingUpdateForMatch,
  cancelRankingForMatch,
  UNRANK_PLAYER,
} from "../../lib/levelRating";
import { Modal, Button, Badge } from "../ui";

// Visuel de présence par joueur — mêmes couleurs que le panneau "Réponses
// des joueurs" (Availability.jsx), pour repérer d'un coup d'œil qui a
// répondu "présent" à cette session. Un joueur ayant répondu "absent" ne
// peut pas être assigné (voir isAbsent plus bas).
const PRESENCE_META = {
  present: { dot: "bg-emerald-500", text: "text-emerald-700", label: "Présent" },
  unknown: { dot: "bg-amber-500", text: "text-amber-700", label: "Incertain" },
  absent: { dot: "bg-rose-500", text: "text-rose-500", label: "Absent" },
};
const NO_RESPONSE_META = { dot: "bg-stone-300", text: "text-[var(--color-text-faint)]", label: "Pas répondu" };
// Ordre d'affichage : présents d'abord, puis incertains, puis ceux qui n'ont
// pas répondu, puis absents en dernier (non assignables).
const PRESENCE_RANK = { present: 0, unknown: 1, absent: 3 };

// ── Remplacement d'un joueur APRÈS qu'un score (ou « Pas de score ») ait été
// encodé (ajouté le 25/09/2026) ─────────────────────────────────────────────
// Le Niveau des 4 joueurs a alors déjà été calculé avec le joueur qu'on
// retire (`match.levelDeltas`). Sans correction, il garderait ces points pour
// un match qu'il n'a pas joué — et ré-enregistrer le score n'y changerait
// rien, puisque l'annulation ne concerne que les 4 joueurs ACTUELS du match.
// Cette fonction (pure, aucune écriture) : 1) annule l'ancien ajustement pour
// TOUS les joueurs qui l'avaient reçu (donc aussi le joueur retiré) ;
// 2) recalcule le match avec la nouvelle composition. Retourne
// `{ levelDeltas, playerUpdates }` (levelDeltas peut être vide) ou `null` si
// le recalcul est impossible (composition incohérente) — l'appelant abandonne
// alors sans rien écrire.
export function recomputeLevelsAfterReplacement({ match, newParticipants, players, matches }) {
  const previous = match.levelDeltas;
  if (!previous || Object.keys(previous).length === 0) return { levelDeltas: null, playerUpdates: {} };
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]));

  const cancelled = cancelRankingForMatch({ previousLevelDeltas: previous, playersById });
  const cancelUpdates = cancelled ? cancelled.playerUpdates : {};

  // États des joueurs APRÈS annulation, pour que le recalcul parte de là.
  const afterCancel = { ...playersById };
  Object.entries(cancelUpdates).forEach(([id, u]) => {
    const base = { ...afterCancel[id] };
    if (u === UNRANK_PLAYER) {
      delete base.internalScore;
      delete base.internalScoreReliability;
    } else {
      Object.assign(base, u);
    }
    afterCancel[id] = base;
  });

  const teamAIds = newParticipants.filter((p) => p.team === "A").map((p) => p.playerId);
  const teamBIds = newParticipants.filter((p) => p.team === "B").map((p) => p.playerId);
  const hasScore = hasMatchScore(match);
  const bonusOnly = !hasScore && match.matchType === "Amical";
  if (!hasScore && !bonusOnly) return { levelDeltas: null, playerUpdates: cancelUpdates };

  const fresh = computeRankingUpdateForMatch({
    teamAIds,
    teamBIds,
    playersById: afterCancel,
    sets: match.scores,
    winningTeam: match.winningTeam ?? null,
    previousLevelDeltas: null,
    matches,
    match: { ...match, participants: newParticipants },
    bonusOnly,
  });
  if (!fresh) return null;
  return {
    levelDeltas: Object.keys(fresh.levelDeltas).length > 0 ? fresh.levelDeltas : null,
    playerUpdates: { ...cancelUpdates, ...fresh.playerUpdates },
  };
}

export function PickPlayerModal({ match, team, courtSide, currentParticipant, onClose }) {
  const { players, matches } = useAppData();
  const [saving, setSaving] = useState(false);
  // Joueur choisi en attente de confirmation (remplacement d'un joueur dont
  // le paiement est déjà marqué, ou dont le Niveau a déjà été calculé).
  const [pendingPlayer, setPendingPlayer] = useState(null);

  // Réponses de présence pour cette session — écrites sur chaque terrain de
  // la session (voir setSessionAvailability dans lib/availability.js), donc
  // déjà disponibles directement sur ce match.
  const availability = match.availability || {};

  // Joueurs déjà engagés sur un AUTRE match le même jour (double terrain, etc.).
  const conflictByPlayerId = useMemo(() => {
    const map = new Map();
    matches.forEach((m) => {
      if (m.id === match.id || m.date !== match.date) return;
      (m.participants || []).forEach((p) => {
        if (!map.has(p.playerId)) map.set(p.playerId, m);
      });
    });
    return map;
  }, [matches, match.id, match.date]);

  // Joueurs déjà présents sur CE match, sur une autre place.
  const takenElsewhereIds = new Set(
    (match.participants || [])
      .filter((p) => p.playerId !== currentParticipant?.playerId)
      .map((p) => p.playerId)
  );

  const filteredPlayers = players
    .slice()
    .sort((a, b) => {
      const ra = PRESENCE_RANK[availability[a.id]] ?? 2;
      const rb = PRESENCE_RANK[availability[b.id]] ?? 2;
      return ra - rb || a.name.localeCompare(b.name);
    });

  const currentPaid =
    currentParticipant &&
    (currentParticipant.paidStatus === "paid" || currentParticipant.paidStatus === "owed");
  const hasLevelImpact = Boolean(match.levelDeltas && Object.keys(match.levelDeltas).length > 0);

  // Écrit le remplacement. `inheritPayment` : le remplaçant reprend le statut
  // de paiement ET le créancier du joueur remplacé (la compta ne bouge pas).
  const apply = async (player, inheritPayment) => {
    // Corrigé le 02/09/2026 (audit paiements) : un joueur qui change de place
    // sur le MÊME match garde son statut de paiement existant.
    const existingEntryForPlayer = (match.participants || []).find(
      (p) => p.playerId === player.id
    );
    setSaving(true);
    try {
      const remaining = (match.participants || []).filter(
        (p) => p.playerId !== currentParticipant?.playerId && p.playerId !== player.id
      );
      const newParticipant = {
        playerId: player.id,
        name: player.name,
        paidStatus: inheritPayment
          ? currentParticipant.paidStatus
          : existingEntryForPlayer?.paidStatus || "unpaid",
        creditorId: inheritPayment
          ? currentParticipant.creditorId ?? null
          : existingEntryForPlayer?.creditorId ?? null,
        team,
        courtSide,
      };
      const newParticipants = [...remaining, newParticipant];
      const matchUpdate = { participants: newParticipants };
      let playerUpdates = {};

      const isReplacement = currentParticipant && currentParticipant.playerId !== player.id;
      // Manches supplémentaires (voir lib/rounds.js) : elles ont leur propre
      // composition, jamais modifiée ici. Si le joueur remplacé y figure, un
      // remplacement dans la seule manche 1 laisserait des données
      // incohérentes (bonus d'assiduité, niveau) : on refuse, sans rien écrire.
      if (
        isReplacement &&
        getRounds(match).some((r) =>
          (Array.isArray(r.participants) ? r.participants : []).some(
            (p) => p.playerId === currentParticipant.playerId
          )
        )
      ) {
        alert(
          `${currentParticipant.name} figure aussi dans une manche supplémentaire de ce match : le remplacement n'est pas possible ici. Rien n'a été modifié.`
        );
        return;
      }
      if (isReplacement && hasLevelImpact) {
        const result = recomputeLevelsAfterReplacement({
          match,
          newParticipants,
          players,
          matches,
        });
        if (!result) {
          alert(
            "Impossible de recalculer le Niveau de ce match avec cette composition. Rien n'a été modifié."
          );
          return;
        }
        matchUpdate.levelDeltas = result.levelDeltas || deleteField();
        playerUpdates = result.playerUpdates;
      }

      const batch = writeBatch(db);
      batch.update(doc(db, "matches", match.id), matchUpdate);
      Object.entries(playerUpdates).forEach(([playerId, update]) => {
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
      await batch.commit();
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Choisir un joueur assigne immédiatement cette place et referme la fenêtre,
  // sauf si le joueur remplacé a un paiement marqué ou un Niveau déjà calculé :
  // on demande alors d'abord quoi faire (voir le panneau de confirmation).
  const pick = async (player) => {
    if (player.id === currentParticipant?.playerId) {
      onClose();
      return;
    }
    if (currentParticipant && (currentPaid || hasLevelImpact)) {
      setPendingPlayer(player);
      return;
    }
    await apply(player, false);
  };

  const remove = async () => {
    if (!currentParticipant) return;
    // Corrigé le 02/09/2026 (audit paiements) : retirer un joueur déjà marqué
    // payé efface définitivement cette information (le statut ne vit que
    // dans cette entrée `participants[]`, pas ailleurs) — on prévient avant
    // d'agir plutôt que de le faire disparaître silencieusement. Étendu le
    // 04/09/2026 au statut "owed" (dette assignée à un créancier précis).
    if (currentParticipant.paidStatus === "paid" || currentParticipant.paidStatus === "owed") {
      const message =
        currentParticipant.paidStatus === "paid"
          ? `${currentParticipant.name} avait déjà été marqué comme ayant payé sa part de ce match. Le retirer effacera cette information de paiement. Continuer ?`
          : `${currentParticipant.name} avait une dette assignée à un créancier pour ce match. Le retirer effacera cette assignation. Continuer ?`;
      const sure = window.confirm(message);
      if (!sure) return;
    }
    setSaving(true);
    try {
      const remaining = (match.participants || []).filter(
        (p) => p.playerId !== currentParticipant.playerId
      );
      await updateDoc(doc(db, "matches", match.id), { participants: remaining });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={currentParticipant ? "Remplacer ce joueur" : "Assigner un joueur"}
      onClose={onClose}
      footer={
        <>
          {currentParticipant && (
            <Button variant="danger" onClick={remove} disabled={saving}>
              Retirer
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
        </>
      }
    >
      {pendingPlayer && currentParticipant ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            Remplacer <strong>{currentParticipant.name}</strong> par{" "}
            <strong>{pendingPlayer.name}</strong> ?
          </p>
          {currentPaid && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-[var(--color-text-dim)]">
                {currentParticipant.name}{" "}
                {currentParticipant.paidStatus === "paid"
                  ? "est marqué comme ayant payé sa part"
                  : "a une dette assignée à un créancier"}{" "}
                pour ce match. Que doit devenir ce paiement ?
              </p>
              <Button onClick={() => apply(pendingPlayer, true)} disabled={saving}>
                {pendingPlayer.name} reprend le même paiement (compta inchangée)
              </Button>
              <Button
                variant="secondary"
                onClick={() => apply(pendingPlayer, false)}
                disabled={saving}
              >
                Repartir à zéro (efface le paiement de {currentParticipant.name})
              </Button>
            </div>
          )}
          {hasLevelImpact && (
            <p className="text-xs text-[var(--color-text-dim)]">
              Le Niveau de ce match sera recalculé : {currentParticipant.name} perd les points de
              ce match, {pendingPlayer.name} les reçoit.
            </p>
          )}
          {!currentPaid && (
            <Button onClick={() => apply(pendingPlayer, false)} disabled={saving}>
              Confirmer le remplacement
            </Button>
          )}
          <Button variant="secondary" onClick={() => setPendingPlayer(null)} disabled={saving}>
            Retour à la liste
          </Button>
        </div>
      ) : (
      <>
      <p className="text-xs text-[var(--color-text-dim)] mb-2">
        Choisissez un joueur pour cette place — {formatDateFR(match.date)}
        {match.time ? ` à ${match.time}` : ""}. La fenêtre se referme dès votre choix.
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
        {Object.entries(PRESENCE_META).map(([key, meta]) => (
          <span key={key} className="flex items-center gap-1 text-[10px] text-[var(--color-text-faint)]">
            <span className={cn("w-2 h-2 rounded-full shrink-0", meta.dot)} />
            {meta.label}
          </span>
        ))}
        <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-faint)]">
          <span className={cn("w-2 h-2 rounded-full shrink-0", NO_RESPONSE_META.dot)} />
          {NO_RESPONSE_META.label}
        </span>
      </div>

      <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pm-scroll-visible pr-1">
        {filteredPlayers.length === 0 ? (
          <p className="text-xs text-[var(--color-text-faint)] italic py-2">
            Aucun joueur enregistré.
          </p>
        ) : (
          filteredPlayers.map((p) => {
            const isCurrent = p.id === currentParticipant?.playerId;
            const dayConflict = !isCurrent ? conflictByPlayerId.get(p.id) : null;
            const inThisMatch = !isCurrent && takenElsewhereIds.has(p.id);
            const isAbsent = !isCurrent && availability[p.id] === "absent";
            const disabled = saving || Boolean(dayConflict) || inThisMatch || isAbsent;
            const presenceMeta = PRESENCE_META[availability[p.id]] || NO_RESPONSE_META;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => pick(p)}
                className={cn(
                  "flex items-center gap-2.5 p-2.5 rounded-xl border text-left text-sm transition-colors",
                  isCurrent
                    ? "border-[var(--color-lime)]/60 bg-[var(--color-lime)]/10"
                    : disabled
                    ? "border-[var(--color-border)] bg-[var(--color-surface-2)]/50 opacity-50 cursor-not-allowed"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-sky-300"
                )}
              >
                <span
                  className={cn("w-2 h-2 rounded-full shrink-0", presenceMeta.dot)}
                  title={presenceMeta.label}
                />
                <span className="flex-1 min-w-0 truncate">
                  {p.emoji} {p.name}
                </span>
                {isCurrent && (
                  <Badge tone="lime" className="!text-[10px] shrink-0">
                    Actuel
                  </Badge>
                )}
                {dayConflict && (
                  <span className="text-[10px] text-[var(--color-text-faint)] shrink-0 text-right">
                    Déjà sur {dayConflict.location || "un autre terrain"}
                    {dayConflict.time ? ` · ${dayConflict.time}` : ""}
                  </span>
                )}
                {!dayConflict && inThisMatch && (
                  <span className="text-[10px] text-[var(--color-text-faint)] shrink-0">
                    Déjà sur ce terrain
                  </span>
                )}
                {!dayConflict && !inThisMatch && !isCurrent && (
                  <span className={cn("text-[10px] font-semibold shrink-0", presenceMeta.text)}>
                    {presenceMeta.label}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
      </>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Ajouté le 25/09/2026 — « Remplacer un joueur » sur un match DÉJÀ TERMINÉ
// (admin uniquement). Ouvert depuis l'engrenage d'un match dans « Dernier
// résultat » / « Reste de la saison » (SessionCard → CompactMatchResult), où
// les places ne sont pas cliquables. Montre les 4 places ; un clic sur l'une
// d'elles ouvre PickPlayerModal, qui gère paiement et Niveau.
// ─────────────────────────────────────────────────────────────────────────
export function ReplacePlayerModal({ match, onClose }) {
  const { players, isAdmin } = useAppData();
  const [pickSlot, setPickSlot] = useState(null); // définition de place (COURT_SLOT_DEFS) | null
  const slots = getCourtSlots(match);
  const playerById = (id) => players.find((p) => p.id === id);

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
        matchStarted
        slotTeam={def.team}
        slotSide={def.side}
        isWinningTeam={Boolean(match.winningTeam) && match.winningTeam === def.team}
        isAdmin={isAdmin}
        onAssignClick={() => setPickSlot(def)}
        onSelfClick={() => {}}
        onPayClick={() => {}}
      />
    );
  };

  const pickedParticipant = pickSlot ? slots[pickSlot.key] || null : null;

  return (
    <Modal
      title="Remplacer un joueur"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      <p className="text-xs text-[var(--color-text-dim)] mb-3">
        {formatDateFR(match.date)}
        {match.time ? ` à ${match.time}` : ""}. Touchez la place du joueur à remplacer (par
        exemple un joueur absent remplacé par un invité).
      </p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        {renderSlot(COURT_SLOT_DEFS[0])}
        {renderSlot(COURT_SLOT_DEFS[1])}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {renderSlot(COURT_SLOT_DEFS[2])}
        {renderSlot(COURT_SLOT_DEFS[3])}
      </div>
      {pickSlot && (
        <PickPlayerModal
          match={match}
          team={pickSlot.team}
          courtSide={pickSlot.side}
          currentParticipant={pickedParticipant}
          onClose={() => setPickSlot(null)}
        />
      )}
    </Modal>
  );
}
