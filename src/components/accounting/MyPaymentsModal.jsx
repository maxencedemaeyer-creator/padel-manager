// ─────────────────────────────────────────────────────────────────────────
// Détail nominatif de "Mes paiements" — le miroir côté payeur de
// CreditorPaymentsModal (côté créancier). Affichée depuis "Mon profil"
// (StatsView.jsx), visible pour TOUT joueur connecté (normal, créancier ou
// admin) : un créancier peut lui aussi avoir payé un AUTRE créancier pour un
// match donné, ce bloc lui montre cette dépense-là même si elle fait
// doublon avec sa propre comptabilité créancier.
//
// Contrairement à CreditorPaymentsModal (groupée par joueur, car un
// créancier peut recevoir de dizaines de payeurs différents), ici il n'y a
// qu'UN SEUL payeur (le joueur connecté) : liste chronologique plate,
// chaque ligne montrant la référence du match (date/heure/lieu), le montant,
// et le nom du créancier remboursé.
// ─────────────────────────────────────────────────────────────────────────
import { formatDateFR } from "../../lib/utils";
import { Modal, EmptyState } from "../ui";
import Icon from "../icons/Icon";
import { PlayerAvatar } from "../players/PlayerAvatar";

export function MyPaymentsModal({ payments, players, onClose }) {
  return (
    <Modal title="Mes paiements" onClose={onClose} wide>
      {payments.length === 0 ? (
        <EmptyState
          icon={<Icon.Coin className="w-6 h-6" />}
          title="Aucun paiement enregistré"
          subtitle="Les paiements que vous confirmez depuis l'onglet Matchs apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {payments.map((item) => {
            const creditor = (players || []).find((p) => p.id === item.creditorId) || null;
            return (
              <div
                key={item.key}
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-[var(--color-border)]"
              >
                {creditor ? (
                  <PlayerAvatar player={creditor} size={36} />
                ) : (
                  <span className="w-9 h-9 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-text-faint)] shrink-0">
                    <Icon.Users className="w-4 h-4" />
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate">
                    {creditor?.name || "Créancier non précisé"}
                  </span>
                  <span className="block text-xs text-[var(--color-text-faint)] truncate">
                    {formatDateFR(item.date)}
                    {item.time ? ` · ${item.time}` : ""} · {item.location}
                  </span>
                </span>
                <span className="pm-mono font-bold text-sky-600 text-sm shrink-0">
                  {item.fee.toLocaleString("fr-FR")} €
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
