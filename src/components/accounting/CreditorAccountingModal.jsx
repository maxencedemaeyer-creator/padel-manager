// ─────────────────────────────────────────────────────────────────────────
// Modale admin — "Comptabilité de {nom}" (04/09/2026). Ouverte depuis
// "Administration" → "Soldes des créanciers" en cliquant sur un créancier :
// affiche, en LECTURE SEULE, exactement le même panneau que ce créancier
// voit lui-même dans "Ma comptabilité" (composant partagé
// CreditorAccountingPanel — mêmes calculs, même rendu, aucune action
// possible depuis ici : pas de "Marquer payé", pas de "Doit payer à…", pas
// de modification de créance). Une copie visuelle en direct, rien de plus.
// ─────────────────────────────────────────────────────────────────────────
import { getCreditorRemainingMatchesCount } from "../../lib/stats";
import { useAppData } from "../../context/AppContext";
import { Modal } from "../ui";
import { PlayerAvatar } from "../players/PlayerAvatar";
import { CreditorAccountingPanel } from "./CreditorAccountingPanel";

export function CreditorAccountingModal({ creditor, onClose }) {
  const { abonnements, matches } = useAppData();

  const remainingMatchesCount = getCreditorRemainingMatchesCount(
    creditor.id,
    abonnements,
    matches
  );

  return (
    <Modal title={`Comptabilité de ${creditor.name}`} onClose={onClose} wide>
      <div className="rounded-2xl p-3" style={{ backgroundColor: "#F8FAFC" }}>
        <div className="flex items-center gap-2.5 mb-4">
          <PlayerAvatar player={creditor} size={32} />
          <p className="text-xs text-slate-500">
            Il reste {remainingMatchesCount} match{remainingMatchesCount > 1 ? "s" : ""} à jouer
            dans son abonnement. Vue en lecture seule — identique à ce que {creditor.name} voit
            dans « Ma comptabilité ».
          </p>
        </div>

        <CreditorAccountingPanel creditorId={creditor.id} readOnly />
      </div>
    </Modal>
  );
}
