// ─────────────────────────────────────────────────────────────────────────
// Onglet "Compta" (créanciers uniquement) — dashboard 5 blocs : alerte,
// créance de départ, consommation perso, remboursements, synthèse.
// Volontairement sur fond clair (au lieu du bleu du reste de l'app) pour
// un meilleur contraste sur ces montants financiers.
// ─────────────────────────────────────────────────────────────────────────
import { cn, formatDateFR } from "../lib/utils";
import { getMatchTiming } from "../lib/matchLogic";
import { getCreditorAccounting } from "../lib/stats";
import { useAppData } from "../context/AppContext";
import Icon from "../components/icons/Icon";
import { Card, EmptyState } from "../components/ui";

export function AccountingView() {
  const { connectedPlayer, players, matches } = useAppData();
  const { totalPaidPastMatches, selfReimbursed, paymentsReceived } = getCreditorAccounting(
    connectedPlayer.id,
    matches
  );
  const advanced = connectedPlayer.advancedAmount || 0;

  const creditorIds = new Set(players.filter((p) => p.isCreditor).map((p) => p.id));
  const seasonMatches = matches.filter((m) => m.type === "Saison");

  // Bloc 3 — auto-remboursement : mes propres matchs, joués + à venir.
  const selfUpcomingValue = seasonMatches
    .filter(
      (m) =>
        getMatchTiming(m) !== "finished" &&
        (m.participants || []).some((p) => p.playerId === connectedPlayer.id)
    )
    .reduce((sum, m) => sum + (m.matchFeePerPlayer || 0), 0);
  const selfSeasonTotal = selfReimbursed + selfUpcomingValue;

  // Bloc 4 — ce que les autres joueurs (hors créanciers) doivent/ont payé.
  const engagedUpcoming = seasonMatches
    .filter((m) => getMatchTiming(m) !== "finished")
    .reduce((sum, m) => {
      const owing = (m.participants || []).filter(
        (p) => p.playerId !== connectedPlayer.id && !creditorIds.has(p.playerId)
      );
      return sum + owing.length * (m.matchFeePerPlayer || 0);
    }, 0);

  // Bloc 1 — alerte : impayés sur les matchs déjà joués (hors créanciers, exemptés).
  const unpaidPast = seasonMatches
    .filter((m) => getMatchTiming(m) === "finished")
    .flatMap((m) =>
      (m.participants || [])
        .filter((p) => !creditorIds.has(p.playerId) && p.paidStatus !== "paid")
        .map((p) => ({ name: p.name, fee: m.matchFeePerPlayer || 0 }))
    );
  const unpaidAmount = unpaidPast.reduce((s, p) => s + p.fee, 0);
  const unpaidCount = unpaidPast.length;
  const allSettled = unpaidCount === 0;

  // Bloc 5 — synthèse : créance − (ma saison) − (déjà perçu des autres).
  const remainingNet = advanced - selfSeasonTotal - totalPaidPastMatches;

  return (
    <div className="min-h-screen px-4 pt-4 pb-28" style={{ backgroundColor: "#F8FAFC" }}>
      <h2 className="pm-display font-bold text-xl mb-1" style={{ color: "#1F2937" }}>
        Ma comptabilité
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        Calculé automatiquement à partir des matchs et paiements enregistrés — aucun
        moyen de paiement externe n'est utilisé.
      </p>

      {/* 1. Bannière d'alerte / suivi des paiements */}
      <div
        className={cn(
          "flex items-start gap-3 p-4 rounded-2xl border mb-5",
          allSettled ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"
        )}
      >
        {allSettled ? (
          <Icon.CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <Icon.AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
        )}
        <p className={cn("text-sm font-medium", allSettled ? "text-emerald-800" : "text-orange-800")}>
          {allSettled
            ? "Tout est à jour ! Tous les matchs passés ont été réglés."
            : `Attention : ${unpaidAmount.toLocaleString("fr-FR")} € sont actuellement en attente de paiement pour des matchs déjà joués (${unpaidCount} joueur${unpaidCount > 1 ? "s" : ""} n'${unpaidCount > 1 ? "ont" : "a"} pas encore réglé).`}
        </p>
      </div>

      {/* 2. Créance de départ */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-5">
        <div className="flex items-center gap-2 mb-2">
          <Icon.Wallet className="w-5 h-5 text-sky-600" />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Créance de départ
          </span>
        </div>
        <p className="pm-display text-3xl font-extrabold" style={{ color: "#1F2937" }}>
          {advanced.toLocaleString("fr-FR")} €
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Votre investissement initial pour la réservation du terrain annuel.
        </p>
      </div>

      {/* 3. Consommation personnelle (auto-remboursement) */}
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Ma consommation personnelle
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
          <Icon.CheckCircle className="w-4 h-4 text-emerald-600 mb-2" />
          <p className="pm-display text-xl font-extrabold" style={{ color: "#1F2937" }}>
            {selfReimbursed.toLocaleString("fr-FR")} €
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Mes matchs déjà joués</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
          <Icon.Calendar className="w-4 h-4 text-sky-600 mb-2" />
          <p className="pm-display text-xl font-extrabold" style={{ color: "#1F2937" }}>
            {selfUpcomingValue.toLocaleString("fr-FR")} €
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Mes matchs à venir</p>
        </div>
        <div className="rounded-2xl shadow-sm p-4" style={{ backgroundColor: "#1F2937" }}>
          <Icon.Wallet className="w-4 h-4 text-white/70 mb-2" />
          <p className="pm-display text-xl font-extrabold text-white">
            {selfSeasonTotal.toLocaleString("fr-FR")} €
          </p>
          <p className="text-xs text-white/70 mt-0.5">Coût total estimé de ma saison</p>
        </div>
      </div>

      {/* 4. Remboursements par les tiers */}
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Remboursements par les autres joueurs
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
          <Icon.CheckCircle className="w-4 h-4 text-emerald-600 mb-2" />
          <p className="pm-display text-xl font-extrabold" style={{ color: "#1F2937" }}>
            {totalPaidPastMatches.toLocaleString("fr-FR")} €
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Déjà perçu (matchs passés)</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
          <Icon.ArrowDownRight className="w-4 h-4 text-sky-600 mb-2" />
          <p className="pm-display text-xl font-extrabold" style={{ color: "#1F2937" }}>
            {engagedUpcoming.toLocaleString("fr-FR")} €
          </p>
          <p className="text-xs text-slate-500 mt-0.5">À percevoir (engagé, matchs à venir)</p>
        </div>
      </div>

      {/* 5. Synthèse — reste net à récupérer */}
      <div
        className="rounded-2xl shadow-md p-5 mb-6 text-white"
        style={{ background: "linear-gradient(135deg, #0284C7, #4338CA)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Icon.Wallet className="w-5 h-5" />
          <span className="text-xs font-semibold uppercase tracking-wide text-white/70">
            Reste net à récupérer en cash
          </span>
        </div>
        <p className="pm-display text-3xl font-extrabold">
          {remainingNet.toLocaleString("fr-FR")} €
        </p>
        <p className="text-xs text-white/80 mt-2">
          Ce montant représente la somme brute que vous devez encore recevoir en
          liquide/virement pour clôturer votre créance tout en couvrant votre propre
          saison.
        </p>
      </div>

      <h3 className="font-semibold text-sm text-slate-500 mb-3">
        Paiements reçus (matchs passés)
      </h3>
      {paymentsReceived.length === 0 ? (
        <EmptyState
          icon={<Icon.Coin className="w-6 h-6" />}
          title="Aucun paiement enregistré pour l'instant"
          subtitle="Les paiements que vous confirmez depuis l'onglet Matchs apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {paymentsReceived.map((p, i) => (
            <Card key={i} className="p-3.5 flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate">{p.name}</span>
                <span className="block text-xs text-[var(--color-text-faint)]">
                  {formatDateFR(p.date)}
                </span>
              </span>
              <span className="pm-mono font-bold text-emerald-600 text-sm shrink-0">
                +{p.fee.toLocaleString("fr-FR")} €
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
