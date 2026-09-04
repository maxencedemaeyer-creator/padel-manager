// ─────────────────────────────────────────────────────────────────────────
// Onglet "Compta" (créanciers uniquement) — page du créancier connecté sur
// sa propre créance. Depuis le 04/09/2026, les 5-6 blocs (alerte, créance,
// consommation perso, remboursements, synthèse, hors abonnement) vivent
// dans le composant partagé CreditorAccountingPanel (voir
// components/accounting/CreditorAccountingPanel.jsx), réutilisé tel quel
// par l'admin pour consulter en lecture seule la comptabilité de N'IMPORTE
// QUEL créancier depuis "Administration" → "Soldes des créanciers" (voir
// CreditorAccountingModal.jsx). Cette page ne garde plus que l'en-tête et le
// fond de page ; le contenu interactif (Marquer payé, Doit payer à…,
// modifier une créance) reste actif ici car c'est SA PROPRE comptabilité.
// Volontairement sur fond clair (au lieu du bleu du reste de l'app) pour un
// meilleur contraste sur ces montants financiers.
// ─────────────────────────────────────────────────────────────────────────
import { getCreditorRemainingMatchesCount } from "../lib/stats";
import { useAppData } from "../context/AppContext";
import { CreditorAccountingPanel } from "../components/accounting/CreditorAccountingPanel";

export function AccountingView() {
  const { connectedPlayer, abonnements, matches } = useAppData();

  // Sous-titre en haut de page : nombre de matchs à venir (pas de sessions)
  // pour lesquels je suis créancier d'un abonnement, indépendamment de ma
  // présence à ces matchs — voir getCreditorRemainingMatchesCount
  // (lib/stats.js).
  const remainingMatchesCount = getCreditorRemainingMatchesCount(
    connectedPlayer.id,
    abonnements,
    matches
  );

  return (
    <div className="min-h-screen px-4 pt-4 pb-28" style={{ backgroundColor: "#F8FAFC" }}>
      <h2 className="pm-display font-bold text-xl mb-1" style={{ color: "#1F2937" }}>
        Ma comptabilité
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        Il vous reste {remainingMatchesCount} match{remainingMatchesCount > 1 ? "s" : ""} à jouer
        dans votre abonnement.
      </p>

      <CreditorAccountingPanel creditorId={connectedPlayer.id} />
    </div>
  );
}
