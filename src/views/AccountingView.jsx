// ─────────────────────────────────────────────────────────────────────────
// Onglet "Compta" (créanciers uniquement) — dashboard 5 blocs : alerte,
// créance de départ, consommation perso, remboursements, synthèse.
// Volontairement sur fond clair (au lieu du bleu du reste de l'app) pour
// un meilleur contraste sur ces montants financiers.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { cn, formatDateFR, formatClaimPeriodLabel } from "../lib/utils";
import { getMatchTiming } from "../lib/matchLogic";
import { getCreditorAccounting, getCoveredMatchesEstimate } from "../lib/stats";
import { useAppData } from "../context/AppContext";
import Icon from "../components/icons/Icon";
import { Card, EmptyState } from "../components/ui";
import { ClaimSettingsModal } from "../components/accounting/ClaimSettingsModal";

export function AccountingView() {
  const { connectedPlayer, players, matches } = useAppData();
  const [showClaimSettings, setShowClaimSettings] = useState(false);
  // Détail des impayés : clé de la ligne en attente de confirmation (clic 1)
  // puis clé de la ligne en cours d'écriture Firestore (clic 2 confirmé).
  const [confirmingKey, setConfirmingKey] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  const { totalPaidPastMatches, selfReimbursed, paymentsReceived } = getCreditorAccounting(
    connectedPlayer.id,
    matches
  );
  const advanced = connectedPlayer.advancedAmount || 0;
  // Correction manuelle éventuellement appliquée par l'administrateur (onglet
  // Administration, champ "Solde"). Avant ce correctif, ce montant n'était
  // visible que côté admin : le créancier voyait un "reste à récupérer" qui
  // ne correspondait pas à ce que l'admin avait corrigé de son côté.
  const manualAdjustment = connectedPlayer.manualAdjustment || 0;

  // Informations indicatives de la créance de départ : période couverte,
  // nombre de terrains, et nombre de matchs couverts calculé automatiquement
  // à partir des séances réellement enregistrées sur cette période.
  const claimPeriodLabel = formatClaimPeriodLabel(
    connectedPlayer.advancedAmountPeriodStart,
    connectedPlayer.advancedAmountPeriodEnd
  );
  const claimCourts = connectedPlayer.advancedAmountCourts;
  const coveredMatches = getCoveredMatchesEstimate(connectedPlayer, matches);
  const hasClaimDetails = Boolean(claimPeriodLabel) || claimCourts != null;

  const creditorIds = new Set(players.filter((p) => p.isCreditor).map((p) => p.id));
  const seasonMatches = matches.filter((m) => m.type === "Saison");

  // Bloc 3 — auto-remboursement : mes propres matchs, joués + à venir. On
  // garde aussi le nombre de matchs (pas seulement le montant) pour
  // l'afficher en petit sous chaque montant, sans que le créancier ait à
  // les recompter lui-même.
  const selfPastMatchesCount = seasonMatches.filter(
    (m) =>
      getMatchTiming(m) === "finished" &&
      (m.participants || []).some((p) => p.playerId === connectedPlayer.id)
  ).length;
  const selfUpcomingMatches = seasonMatches.filter(
    (m) =>
      getMatchTiming(m) !== "finished" &&
      (m.participants || []).some((p) => p.playerId === connectedPlayer.id)
  );
  const selfUpcomingValue = selfUpcomingMatches.reduce(
    (sum, m) => sum + (m.matchFeePerPlayer || 0),
    0
  );
  const selfUpcomingCount = selfUpcomingMatches.length;
  const selfSeasonTotal = selfReimbursed + selfUpcomingValue;
  const selfSeasonCount = selfPastMatchesCount + selfUpcomingCount;

  // Bloc 4 — ce que les autres joueurs (hors créanciers) doivent/ont payé.
  const engagedUpcoming = seasonMatches
    .filter((m) => getMatchTiming(m) !== "finished")
    .reduce((sum, m) => {
      const owing = (m.participants || []).filter(
        (p) => p.playerId !== connectedPlayer.id && !creditorIds.has(p.playerId)
      );
      return sum + owing.length * (m.matchFeePerPlayer || 0);
    }, 0);

  // Bloc 1 — alerte : impayés sur les matchs déjà joués (hors créanciers,
  // exemptés). On garde ici le détail complet (match + joueur) et pas
  // seulement le total, pour pouvoir afficher la liste nominative ci-dessous
  // et marquer un paiement directement depuis "Ma comptabilité", sans devoir
  // rouvrir chaque match dans l'onglet Matchs.
  const unpaidPast = seasonMatches
    .filter((m) => getMatchTiming(m) === "finished")
    .flatMap((m) =>
      (m.participants || [])
        .filter((p) => !creditorIds.has(p.playerId) && p.paidStatus !== "paid")
        .map((p) => ({
          key: `${m.id}-${p.playerId}`,
          matchId: m.id,
          playerId: p.playerId,
          name: p.name,
          fee: m.matchFeePerPlayer || 0,
          date: m.date,
          location: m.location || "Terrain",
        }))
    )
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const unpaidAmount = unpaidPast.reduce((s, p) => s + p.fee, 0);
  const unpaidCount = unpaidPast.length;
  const allSettled = unpaidCount === 0;

  // Bloc 5 — synthèse : créance − (ma saison) − (déjà perçu des autres) −
  // (correction manuelle de l'admin, positive ou négative).
  const remainingNet = advanced - selfSeasonTotal - totalPaidPastMatches - manualAdjustment;

  // Marque le joueur concerné comme ayant payé sa part de ce match, avec
  // "moi" (le créancier connecté) comme créancier destinataire — pas besoin
  // de demander "à quel créancier ?" ici puisque cette vue est déjà celle
  // d'un seul créancier sur sa propre créance.
  const markAsPaid = async (item) => {
    setSavingKey(item.key);
    try {
      const match = matches.find((m) => m.id === item.matchId);
      if (!match) return;
      const updatedParticipants = (match.participants || []).map((p) =>
        p.playerId === item.playerId
          ? { ...p, paidStatus: "paid", creditorId: connectedPlayer.id }
          : p
      );
      await updateDoc(doc(db, "matches", item.matchId), {
        participants: updatedParticipants,
      });
      setConfirmingKey(null);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSavingKey(null);
    }
  };

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
          "flex items-start gap-3 p-4 rounded-2xl border",
          allSettled ? "bg-emerald-50 border-emerald-200 mb-5" : "bg-orange-50 border-orange-200 mb-3"
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

      {/* 1bis. Détail nominatif des impayés — qui doit quoi, pour quel match,
          avec confirmation de paiement en 2 clics directement depuis cette
          liste (pas besoin de rouvrir le match dans l'onglet Matchs). */}
      {!allSettled && (
        <div className="flex flex-col gap-2 mb-5">
          {unpaidPast.map((item) => {
            const isConfirming = confirmingKey === item.key;
            const isSaving = savingKey === item.key;
            return (
              <div
                key={item.key}
                className="bg-white border border-orange-200/70 rounded-2xl p-3.5 flex items-center gap-3"
              >
                <span className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                  <Icon.AlertCircle className="w-4 h-4 text-orange-500" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate">{item.name}</span>
                  <span className="block text-xs text-slate-400 truncate">
                    {formatDateFR(item.date)} · {item.location}
                  </span>
                </span>
                <span className="pm-mono font-bold text-orange-600 text-sm shrink-0">
                  {item.fee.toLocaleString("fr-FR")} €
                </span>
                {isConfirming ? (
                  <span className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => markAsPaid(item)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {isSaving ? "…" : "Confirmer"}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => setConfirmingKey(null)}
                      className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 text-xs font-medium disabled:opacity-50"
                    >
                      Annuler
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingKey(item.key)}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                  >
                    Marquer payé
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 2. Créance de départ — modifiable par le créancier lui-même ou par
          un administrateur, via la roulette de réglages. */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon.Wallet className="w-5 h-5 text-sky-600" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Créance de départ
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowClaimSettings(true)}
            className="p-1.5 -m-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
            title="Modifier la créance de départ"
          >
            <Icon.Settings className="w-4 h-4" />
          </button>
        </div>
        <p className="pm-display text-3xl font-extrabold" style={{ color: "#1F2937" }}>
          {advanced.toLocaleString("fr-FR")} €
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Votre investissement initial pour la réservation du terrain annuel.
        </p>

        {hasClaimDetails && (
          <p className="text-[10px] text-slate-400 mt-2.5 pt-2.5 border-t border-slate-100">
            {[
              claimPeriodLabel,
              claimCourts != null &&
                `${claimCourts} terrain${claimCourts > 1 ? "s" : ""} couvert${claimCourts > 1 ? "s" : ""}`,
              coveredMatches != null &&
                `≈ ${coveredMatches} match${coveredMatches > 1 ? "s" : ""} couvert${coveredMatches > 1 ? "s" : ""}`,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        )}
      </div>

      {showClaimSettings && (
        <ClaimSettingsModal
          creditor={connectedPlayer}
          onClose={() => setShowClaimSettings(false)}
        />
      )}

      {/* 3. Consommation personnelle (auto-remboursement) — un seul bloc,
          divisé en trois colonnes : le coût total de la saison mis en
          évidence à gauche, puis le détail matchs déjà joués / à venir. */}
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Ma consommation personnelle
      </p>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-5 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="p-4" style={{ backgroundColor: "#1F2937" }}>
            <Icon.Wallet className="w-4 h-4 text-white/70 mb-2" />
            <p className="pm-display text-2xl font-extrabold text-white">
              {selfSeasonTotal.toLocaleString("fr-FR")} €
            </p>
            <p className="text-xs text-white/70 mt-0.5">Coût total estimé de ma saison</p>
            <p className="text-[10px] text-white/40 mt-1">
              {selfSeasonCount} match{selfSeasonCount > 1 ? "s" : ""}
            </p>
          </div>
          <div className="p-4">
            <Icon.CheckCircle className="w-4 h-4 text-emerald-600 mb-2" />
            <p className="pm-display text-xl font-extrabold" style={{ color: "#1F2937" }}>
              {selfReimbursed.toLocaleString("fr-FR")} €
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Mes matchs déjà joués</p>
            <p className="text-[10px] text-slate-400 mt-1">
              {selfPastMatchesCount} match{selfPastMatchesCount > 1 ? "s" : ""}
            </p>
          </div>
          <div className="p-4">
            <Icon.Calendar className="w-4 h-4 text-sky-600 mb-2" />
            <p className="pm-display text-xl font-extrabold" style={{ color: "#1F2937" }}>
              {selfUpcomingValue.toLocaleString("fr-FR")} €
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Mes matchs à venir</p>
            <p className="text-[10px] text-slate-400 mt-1">
              {selfUpcomingCount} match{selfUpcomingCount > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Remboursements par les tiers — regroupés dans un seul bloc,
          comme la consommation personnelle ci-dessus. */}
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Remboursements par les autres joueurs
      </p>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-5 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="p-4">
            <Icon.CheckCircle className="w-4 h-4 text-emerald-600 mb-2" />
            <p className="pm-display text-xl font-extrabold" style={{ color: "#1F2937" }}>
              {totalPaidPastMatches.toLocaleString("fr-FR")} €
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Déjà perçu (matchs passés)</p>
          </div>
          <div className="p-4">
            <Icon.ArrowDownRight className="w-4 h-4 text-sky-600 mb-2" />
            <p className="pm-display text-xl font-extrabold" style={{ color: "#1F2937" }}>
              {engagedUpcoming.toLocaleString("fr-FR")} €
            </p>
            <p className="text-xs text-slate-500 mt-0.5">À percevoir (engagé, matchs à venir)</p>
          </div>
        </div>
      </div>

      {/* 4bis. Correction manuelle de l'admin — visible seulement si non nulle,
          pour que "Ma comptabilité" et l'onglet Administration racontent
          toujours exactement la même histoire. */}
      {manualAdjustment !== 0 && (
        <div
          className={cn(
            "rounded-2xl border p-4 mb-5",
            manualAdjustment > 0
              ? "bg-emerald-50 border-emerald-200"
              : "bg-orange-50 border-orange-200"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Ajustement manuel (administration)
            </span>
            <span
              className={cn(
                "pm-mono text-base font-extrabold",
                manualAdjustment > 0 ? "text-emerald-700" : "text-orange-700"
              )}
            >
              {manualAdjustment > 0 ? "+" : ""}
              {manualAdjustment.toLocaleString("fr-FR")} €
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Correction appliquée par l'administrateur (ex. paiement reçu hors
            application) — déjà pris en compte dans le total ci-dessous.
          </p>
        </div>
      )}

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
