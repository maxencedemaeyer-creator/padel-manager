// ─────────────────────────────────────────────────────────────────────────
// Modale "à quel créancier ce joueur a-t-il payé ?" — admin voit tous les
// créanciers, un créancier ne voit que lui-même.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { getCreditorAccounting } from "../../lib/stats";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal, EmptyState } from "../ui";
import { PlayerAvatar } from "../players/PlayerAvatar";

export function PaymentModal({ match, participant, onClose }) {
  const { players, matches, isAdmin, connectedPlayer } = useAppData();
  const allCreditors = players.filter((p) => p.isCreditor === true);
  const creditors = isAdmin
    ? allCreditors
    : allCreditors.filter((c) => c.id === connectedPlayer.id);
  const [saving, setSaving] = useState(false);

  const confirmPayment = async (creditor) => {
    setSaving(true);
    try {
      const updatedParticipants = match.participants.map((p) =>
        p.playerId === participant.playerId
          ? { ...p, paidStatus: "paid", creditorId: creditor.id }
          : p
      );
      await updateDoc(doc(db, "matches", match.id), {
        participants: updatedParticipants,
      });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="À quel créancier ce joueur a-t-il payé ?" onClose={onClose}>
      <p className="text-sm text-[var(--color-text-dim)] mb-4">
        Paiement de <span className="font-semibold text-[var(--color-text)]">{participant.name}</span> —{" "}
        {(match.matchFeePerPlayer || 0).toLocaleString("fr-FR")} €
      </p>
      {creditors.length === 0 ? (
        <EmptyState
          icon={<Icon.Coin className="w-6 h-6" />}
          title="Aucun créancier disponible"
          subtitle="Activez l'option « Créancier » sur au moins un joueur, depuis l'onglet Joueurs."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {creditors.map((c) => {
            const adjustedBalance = getCreditorAccounting(c.id, matches).totalPaidAllTime;
            return (
              <button
                key={c.id}
                disabled={saving}
                onClick={() => confirmPayment(c)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)] hover:border-[var(--color-lime)]/50 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <PlayerAvatar player={c} size={40} />
                <span className="flex-1 text-left">
                  <span className="block text-sm font-semibold">{c.name}</span>
                  <span className="block text-xs text-[var(--color-text-dim)]">
                    Solde actuel : {adjustedBalance.toLocaleString("fr-FR")} €
                  </span>
                </span>
                <Icon.Chevron className="w-4 h-4 text-[var(--color-text-faint)]" />
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
