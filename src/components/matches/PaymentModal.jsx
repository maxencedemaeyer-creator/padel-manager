// ─────────────────────────────────────────────────────────────────────────
// Modale "à quel créancier ce joueur a-t-il payé ?" — admin voit tous les
// créanciers, un créancier ne voit que lui-même.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { getCreditorAccounting } from "../../lib/stats";
import { getSessionCreditorIds } from "../../lib/matchLogic";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal, EmptyState } from "../ui";
import { PlayerAvatar } from "../players/PlayerAvatar";

export function PaymentModal({ match, participant, onClose }) {
  const { players, matches, isAdmin, connectedPlayer } = useAppData();

  // Chantier du 02/09/2026 (attribution figée) + ajustement du même jour :
  // un joueur peut légitimement avoir à rembourser un créancier qui n'est
  // pas celui de SON terrain précis — ex. son créancier est absent ce
  // jour-là, ou il préfère régler avec quelqu'un d'autre. On propose donc
  // en priorité les créanciers de LA SESSION de ce match (même date + heure
  // + club, tous terrains confondus — voir `getSessionCreditorIds`, même
  // regroupement que celui utilisé pour l'affichage des cartes de match),
  // puis TOUS les autres créanciers de l'app en dessous sous "Autres
  // créanciers", pour couvrir tous les cas de figure sans jamais bloquer.
  // Repli pour un match plus ancien (généré avant le chantier du 02/09,
  // donc sans creditorIds, `getSessionCreditorIds` renvoie alors `null`) :
  // aucune suggestion prioritaire, comportement identique à avant (tous les
  // créanciers proposés d'un coup).
  const sessionCreditorIds = getSessionCreditorIds(match, matches);
  const hasAnyCreditorIds = sessionCreditorIds !== null;

  const allCreditors = players.filter((p) => p.isCreditor === true);
  const suggested = hasAnyCreditorIds
    ? allCreditors.filter((c) => sessionCreditorIds.has(c.id))
    : allCreditors;
  const others = hasAnyCreditorIds
    ? allCreditors.filter((c) => !sessionCreditorIds.has(c.id))
    : [];

  // Un créancier non-admin ne peut confirmer un paiement que vers lui-même
  // (il ne peut pas attester à la place d'un autre créancier) — seul
  // l'admin voit l'ensemble des deux listes.
  const visibleSuggested = isAdmin
    ? suggested
    : suggested.filter((c) => c.id === connectedPlayer.id);
  const visibleOthers = isAdmin ? others : others.filter((c) => c.id === connectedPlayer.id);

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

  const renderCreditorButton = (c) => {
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
  };

  const nothingToShow = visibleSuggested.length === 0 && visibleOthers.length === 0;

  return (
    <Modal title="À quel créancier ce joueur a-t-il payé ?" onClose={onClose}>
      <p className="text-sm text-[var(--color-text-dim)] mb-4">
        Paiement de <span className="font-semibold text-[var(--color-text)]">{participant.name}</span> —{" "}
        {(match.matchFeePerPlayer || 0).toLocaleString("fr-FR")} €
      </p>
      {nothingToShow ? (
        <EmptyState
          icon={<Icon.Coin className="w-6 h-6" />}
          title="Aucun créancier disponible"
          subtitle="Activez l'option « Créancier » sur au moins un joueur, depuis l'onglet Joueurs."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {visibleSuggested.length > 0 && (
            <div className="flex flex-col gap-2">
              {hasAnyCreditorIds && isAdmin && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
                  Créanciers du jour
                </p>
              )}
              {visibleSuggested.map(renderCreditorButton)}
            </div>
          )}
          {visibleOthers.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
                Autres créanciers
              </p>
              {visibleOthers.map(renderCreditorButton)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
