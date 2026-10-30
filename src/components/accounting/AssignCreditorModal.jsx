// ─────────────────────────────────────────────────────────────────────────
// Modale "ce joueur doit payer à quel créancier ?" — chantier du 04/09/2026
// (soir), suite à la demande de Max : avant, un impayé restait "libre"
// (n'importe quel créancier de la session pouvait potentiellement le
// récupérer) jusqu'à ce que "Marquer payé" soit cliqué. Cette modale permet
// à un créancier d'assigner explicitement la dette à quelqu'un — sans la
// marquer réglée — pour que le créancier sache "qui me doit" et que le
// joueur sache "à qui je dois", au lieu de deux vues ambiguës.
//
// Reprend EXACTEMENT la même logique de suggestion que PaymentModal.jsx
// (créanciers de la session en premier via `getSessionCreditorIds`, puis
// tous les autres créanciers de l'app en dessous ; non-admin restreint à
// lui-même dans les deux groupes, même règle que pour "Marquer payé") —
// seule la donnée écrite change : `paidStatus: "owed"` au lieu de "paid".
// `creditorId` est le même champ qu'avant, juste utilisé aussi hors du cas
// "payé" (voir lib/stats.js → getUnpaidPastParticipations, champ `owedTo`).
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { getCreditorRemainingNet, getAllCreditorPlayerIds } from "../../lib/stats";
import { getSessionCreditorIds } from "../../lib/matchLogic";
import { useAppData } from "../../context/AppContext";
import { logActivity, matchLabel, playerName as playerNameOf } from "../../lib/activityLog";
import Icon from "../icons/Icon";
import { Modal, EmptyState } from "../ui";
import { PlayerAvatar } from "../players/PlayerAvatar";

export function AssignCreditorModal({ matchId, playerId, playerName, fee, currentOwedTo, onClose }) {
  const { players, matches, abonnements, perms, connectedPlayer } = useAppData();
  const match = matches.find((m) => m.id === matchId);

  const sessionCreditorIds = match ? getSessionCreditorIds(match, matches) : null;
  const hasAnyCreditorIds = sessionCreditorIds !== null;

  const allCreditors = players.filter((p) =>
    getAllCreditorPlayerIds(players, abonnements).has(p.id)
  );
  const suggested = hasAnyCreditorIds
    ? allCreditors.filter((c) => sessionCreditorIds.has(c.id))
    : allCreditors;
  const others = hasAnyCreditorIds
    ? allCreditors.filter((c) => !sessionCreditorIds.has(c.id))
    : [];

  // Même règle que PaymentModal.jsx : un créancier non-admin ne peut
  // assigner une dette qu'à lui-même, pas au nom d'un autre créancier.
  const visibleSuggested = perms.payToAnyCreditor
    ? suggested
    : suggested.filter((c) => c.id === connectedPlayer.id);
  const visibleOthers = perms.payToAnyCreditor ? others : others.filter((c) => c.id === connectedPlayer.id);

  const [saving, setSaving] = useState(false);

  const writeParticipants = async (updater) => {
    if (!match) return;
    setSaving(true);
    try {
      const updatedParticipants = (
        Array.isArray(match.participants) ? match.participants : []
      ).map((p) => (p.playerId === playerId ? updater(p) : p));
      await updateDoc(doc(db, "matches", matchId), { participants: updatedParticipants });
      const after = updatedParticipants.find((p) => p.playerId === playerId);
      logActivity(
        "payment",
        after && after.paidStatus === "owed"
          ? `Dette de ${playerName} attribuée à ${playerNameOf(players, after.creditorId)} — ${matchLabel(match)}`
          : `Attribution de la dette de ${playerName} retirée — ${matchLabel(match)}`
      );
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const assign = (creditor) =>
    writeParticipants((p) => ({ ...p, paidStatus: "owed", creditorId: creditor.id }));

  const unassign = () => writeParticipants((p) => ({ ...p, paidStatus: "unpaid", creditorId: null }));

  const renderCreditorButton = (c) => {
    const isCurrent = currentOwedTo === c.id;
    // Corrigé le 30/10/2026 (remarque de Max) : on affichait ici le total
    // des paiements DÉJÀ reçus (« Solde actuel »), trompeur pour choisir à
    // qui attribuer une dette. On affiche désormais ce qu'il RESTE à ce
    // créancier à percevoir pour clôturer sa saison — exactement le chiffre
    // du bloc bleu « Reste net à récupérer » de sa comptabilité.
    const remaining = getCreditorRemainingNet(c.id, matches, players, abonnements);
    return (
      <button
        key={c.id}
        disabled={saving}
        onClick={() => assign(c)}
        className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)] hover:border-[var(--color-lime)]/50 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        <PlayerAvatar player={c} size={40} />
        <span className="flex-1 text-left">
          <span className="block text-sm font-semibold">
            {c.name}
            {isCurrent && (
              <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-lime)]">
                actuel
              </span>
            )}
          </span>
          <span className="block text-xs text-[var(--color-text-dim)]">
            {remaining > 0
              ? `Reste à percevoir : ${remaining.toLocaleString("fr-FR")} €`
              : remaining === 0
              ? "Créance entièrement récupérée"
              : `A encaissé ${(-remaining).toLocaleString("fr-FR")} € de trop`}
          </span>
        </span>
        <Icon.Chevron className="w-4 h-4 text-[var(--color-text-faint)]" />
      </button>
    );
  };

  const nothingToShow = visibleSuggested.length === 0 && visibleOthers.length === 0;

  return (
    <Modal title="Ce joueur doit payer à quel créancier ?" onClose={onClose}>
      <p className="text-sm text-[var(--color-text-dim)] mb-4">
        Dette de <span className="font-semibold text-[var(--color-text)]">{playerName}</span> —{" "}
        {(fee || 0).toLocaleString("fr-FR")} € — reste "à percevoir", cette assignation ne marque
        rien comme payé.
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
              {hasAnyCreditorIds && perms.payToAnyCreditor && (
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
      {currentOwedTo && (
        <button
          type="button"
          disabled={saving}
          onClick={unassign}
          className="w-full mt-4 pt-4 border-t border-[var(--color-border)] text-center text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
        >
          Retirer l'attribution (repasse en non assigné)
        </button>
      )}
    </Modal>
  );
}
