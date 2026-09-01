// ─────────────────────────────────────────────────────────────────────────
// Carte d'un terrain : 4 places, filet/score au centre, engrenage
// paramètres (admin), auto-inscription des joueurs, paiements.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { collection, addDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { cn } from "../../lib/utils";
import { COURT_SLOT_DEFS, SELF_REGISTRATION_WINDOW_DAYS, WITHDRAWAL_RESOLVE_DELAY_MINUTES } from "../../lib/constants";
import { getMatchTiming, hasMatchScore, getSetDisplay, getCourtSlots, daysUntilMatch } from "../../lib/matchLogic";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Card, Badge, Button } from "../ui";
import { PlayerSlotCard } from "./PlayerSlotCard";
import { EndMatchModal } from "./EndMatchModal";
import { PickPlayerModal } from "./PickPlayerModal";
import { EditMatchDateTimeModal, CourtSettingsMenu, DeleteMatchConfirmModal } from "./MatchSettingsModals";
import { PaymentModal } from "./PaymentModal";

function StatusBadge({ match, now }) {
  const timing = getMatchTiming(match, now);
  if (timing === "ongoing")
    return (
      <Badge tone="lime" className="pm-pulse">
        ● En cours
      </Badge>
    );
  if (timing === "finished") return <Badge tone="neutral">Terminé</Badge>;
  // Matchs à venir : plus de pastille "À venir" (retiré à la demande de Max).
  return null;
}

export function CourtPanel({ match, now }) {
  const { isAdmin, connectedPlayer, players, matches } = useAppData();
  const [showEnd, setShowEnd] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showDateTime, setShowDateTime] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pickSlot, setPickSlot] = useState(null); // { team, courtSide, participant } | null
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [selfBusy, setSelfBusy] = useState(false);

  const participants = match.participants || [];
  const isParticipant = participants.some((p) => p.playerId === connectedPlayer.id);
  const timing = getMatchTiming(match, now);
  const finished = timing === "finished";
  const scoreEntered = hasMatchScore(match);
  // Seuls les matchs de la saison en cours ("Saison") ont un système de
  // paiement/créances ; les matchs ponctuels ajoutés en plus n'en ont pas.
  const trackPayments = match.type === "Saison";
  const canManagePayments = trackPayments && (isAdmin || connectedPlayer.isCreditor === true);
  // L'assignation reste possible même après la fin du match (ex. match créé
  // rétroactivement) — seul un admin peut le faire.
  const canAssign = isAdmin;

  // Auto-inscription : un joueur non-admin peut s'ajouter lui-même sur une
  // place libre d'un match PAS ENCORE commencé, et se désinscrire ensuite —
  // avec la même protection anti-double-réservation que pour l'admin.
  // L'admin garde la main en premier : l'auto-inscription ne s'ouvre que
  // dans les SELF_REGISTRATION_WINDOW_DAYS jours précédant le match.
  const alreadyElsewhereToday = matches.some(
    (m) =>
      m.id !== match.id &&
      m.date === match.date &&
      (m.participants || []).some((p) => p.playerId === connectedPlayer.id)
  );
  const withinSelfRegWindow = daysUntilMatch(match, now) <= SELF_REGISTRATION_WINDOW_DAYS;
  const canSelfJoin =
    !isAdmin && timing === "upcoming" && !isParticipant && !alreadyElsewhereToday;
  const canSelfLeave = !isAdmin && timing === "upcoming" && isParticipant;

  const selfJoin = async (def) => {
    if (!withinSelfRegWindow) {
      alert(
        "Vous ne pouvez pas encore vous inscrire à ce match. Veuillez contacter Maxence ou un administrateur pour vous inscrire à ce match."
      );
      return;
    }
    setSelfBusy(true);
    try {
      const newParticipant = {
        playerId: connectedPlayer.id,
        name: connectedPlayer.name,
        paidStatus: "unpaid",
        creditorId: null,
        team: def.team,
        courtSide: def.side,
      };
      await updateDoc(doc(db, "matches", match.id), {
        participants: [...participants, newParticipant],
      });
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSelfBusy(false);
    }
  };

  const selfLeave = async () => {
    setSelfBusy(true);
    try {
      const remaining = participants.filter((p) => p.playerId !== connectedPlayer.id);
      await updateDoc(doc(db, "matches", match.id), { participants: remaining });
      // Dossier de désinscription en attente — résolu 3 minutes plus tard
      // (voir resolvePendingWithdrawals) pour ignorer les
