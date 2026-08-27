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
import { Card, Button } from "../ui";
import { PlayerSlotCard } from "./PlayerSlotCard";
import { EndMatchModal } from "./EndMatchModal";
import { PickPlayerModal } from "./PickPlayerModal";
import { EditMatchDateTimeModal, CourtSettingsMenu, DeleteMatchConfirmModal } from "./MatchSettingsModals";
import { PaymentModal } from "./PaymentModal";

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
  // Un joueur ne peut s'auto-inscrire sur une place que s'il a explicitement
  // répondu "présent" à la session — un joueur "absent" ou qui n'a "pas
  // encore répondu"/"je ne sais pas encore" ne doit pas pouvoir cliquer sur
  // une place, même s'il voit la disposition du terrain.
  const myAvailabilityStatus = match.availability ? match.availability[connectedPlayer.id] : undefined;
  const hasConfirmedPresence = myAvailabilityStatus === "present";
  const canSelfJoin =
    !isAdmin &&
    timing === "upcoming" &&
    !isParticipant &&
    !alreadyElsewhereToday &&
    hasConfirmedPresence;
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
        // Marque cette place comme une auto-inscription (par opposition à un
        // placement admin) — voir lib/availability.js : si ce joueur répond
        // ensuite "absent"/"je ne sais pas encore" à cette session, il est
        // automatiquement retiré de cette place. Un placement admin, lui,
        // n'a jamais ce marqueur et n'est donc jamais retiré automatiquement.
        selfJoined: true,
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
      // (voir resolvePendingWithdrawals) pour ignorer les simples permutations
      // de terrain/équipe le même jour.
      await addDoc(collection(db, "withdrawals"), {
        playerId: connectedPlayer.id,
        playerName: connectedPlayer.name,
        matchId: match.id,
        matchDate: match.date,
        matchTime: match.time,
        matchLocation: match.location || "",
        leftAt: new Date().toISOString(),
        resolveAt: new Date(
          Date.now() + WITHDRAWAL_RESOLVE_DELAY_MINUTES * 60000
        ).toISOString(),
        resolved: false,
      });
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSelfBusy(false);
    }
  };

  const creditorPlayerIds = new Set(
    players.filter((p) => p.isCreditor === true).map((p) => p.id)
  );
  const playerById = (id) => players.find((p) => p.id === id);
  const slots = getCourtSlots(match);

  const renderSlot = (def) => {
    const participant = slots[def.key];
    const isMe = Boolean(participant) && participant.playerId === connectedPlayer.id;
    const isEmpty = !participant;
    const selfClickable = (isEmpty && canSelfJoin) || (isMe && canSelfLeave);
    return (
      <PlayerSlotCard
        key={def.key}
        participant={participant}
        playerRecord={participant ? playerById(participant.playerId) : null}
        canAssign={canAssign}
        canSelfManage={selfClickable}
        isSelfSlot={isMe}
        canPay={canManagePayments}
        isCreditorParticipant={participant ? creditorPlayerIds.has(participant.playerId) : false}
        trackPayments={trackPayments}
        slotTeam={def.team}
        slotSide={def.side}
        isWinningTeam={Boolean(match.winningTeam) && match.winningTeam === def.team}
        isAdmin={isAdmin}
        onAssignClick={() => setPickSlot({ team: def.team, courtSide: def.side, participant })}
        onSelfClick={() => (isEmpty ? selfJoin(def) : selfLeave())}
        onPayClick={() => setPaymentTarget(participant)}
      />
    );
  };

  return (
    <Card
      className={cn(
        "p-4 pm-rise",
        isParticipant && "border-[var(--color-lime)]/40"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{match.location || "Terrain"}</p>
          <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
            {trackPayments
              ? match.matchFeePerPlayer != null
                ? `${match.matchFeePerPlayer.toLocaleString("fr-FR")} € / joueur`
                : "Tarif non renseigné"
              : "Match ponctuel — hors comptabilité"}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowSettingsMenu(true)}
            aria-label="Paramètres du terrain"
            className="p-1.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-sky-700 hover:border-sky-300 shrink-0"
          >
            <Icon.Settings className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {renderSlot(COURT_SLOT_DEFS[0])}
        {renderSlot(COURT_SLOT_DEFS[1])}
      </div>

      {scoreEntered ? (
        <div className="my-2.5 py-2.5 px-2 rounded-xl bg-[var(--color-surface-2)]">
          {(() => {
            const setPairs = ["set1", "set2", "set3"]
              .map((k) => getSetDisplay(match.scores[k]))
              .filter(Boolean)
              .map((disp) => {
                const [a, b] = disp.split("-");
                return { a, b };
              });
            return ["A", "B"].map((teamKey) => {
              const isWinner = match.winningTeam === teamKey;
              return (
                <div
                  key={teamKey}
                  className={cn(
                    "flex items-center justify-center gap-1.5",
                    teamKey === "A" && "mb-1.5"
                  )}
                >
                  <span className="w-4 text-xs text-center shrink-0">{isWinner ? "🏆" : ""}</span>
                  <div className="flex gap-1">
                    {setPairs.map((pair, i) => {
                      const mine = Number(teamKey === "A" ? pair.a : pair.b);
                      const other = Number(teamKey === "A" ? pair.b : pair.a);
                      const wonSet = Number.isFinite(mine) && Number.isFinite(other) && mine > other;
                      const lostSet = Number.isFinite(mine) && Number.isFinite(other) && mine < other;
                      return (
                        <span
                          key={i}
                          className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold pm-mono border",
                            wonSet
                              ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                              : lostSet
                              ? "bg-rose-100 text-rose-700 border-rose-300"
                              : "bg-white text-[var(--color-text-dim)] border-[var(--color-border)]"
                          )}
                        >
                          {teamKey === "A" ? pair.a : pair.b}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
          {match.matchType && (
            <p className="text-center text-[10px] text-[var(--color-text-faint)] mt-1.5">
              {match.matchType}
            </p>
          )}
        </div>
      ) : (
        <div className="relative flex items-center my-2.5">
          <div className="flex-1 h-px bg-[var(--color-border)]" />
          <span className="mx-2 px-2.5 py-1 rounded-full bg-slate-800 text-white text-[10px] font-bold tracking-wide shrink-0">
            FILET • NET
          </span>
          <div className="flex-1 h-px bg-[var(--color-border)]" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3">
        {renderSlot(COURT_SLOT_DEFS[2])}
        {renderSlot(COURT_SLOT_DEFS[3])}
      </div>

      {isAdmin && finished && (
        <Button
          variant="secondary"
          className="w-full !py-2 !text-xs"
          onClick={() => setShowEnd(true)}
        >
          {scoreEntered ? "Modifier le score" : "Encoder le score"}
        </Button>
      )}

      {showEnd && <EndMatchModal match={match} onClose={() => setShowEnd(false)} />}
      {showSettingsMenu && (
        <CourtSettingsMenu
          onClose={() => setShowSettingsMenu(false)}
          onPickDateTime={() => {
            setShowSettingsMenu(false);
            setShowDateTime(true);
          }}
          onPickScore={() => {
            setShowSettingsMenu(false);
            setShowEnd(true);
          }}
          onPickDelete={() => {
            setShowSettingsMenu(false);
            setShowDeleteConfirm(true);
          }}
        />
      )}
      {showDateTime && (
        <EditMatchDateTimeModal match={match} onClose={() => setShowDateTime(false)} />
      )}
      {showDeleteConfirm && (
        <DeleteMatchConfirmModal match={match} onClose={() => setShowDeleteConfirm(false)} />
      )}
      {pickSlot && (
        <PickPlayerModal
          match={match}
          team={pickSlot.team}
          courtSide={pickSlot.courtSide}
          currentParticipant={pickSlot.participant}
          onClose={() => setPickSlot(null)}
        />
      )}
      {paymentTarget && (
        <PaymentModal
          match={match}
          participant={paymentTarget}
          onClose={() => setPaymentTarget(null)}
        />
      )}
    </Card>
  );
}
