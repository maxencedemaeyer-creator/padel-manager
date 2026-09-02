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
import { getMatchTiming, groupMatchesBySession, getSessionCreditorIds } from "../lib/matchLogic";
import { getCreditorAccounting, getCreditorClaims, participantsOf } from "../lib/stats";
import { useAppData } from "../context/AppContext";
import Icon from "../components/icons/Icon";
import { ClaimSettingsModal } from "../components/accounting/ClaimSettingsModal";
import { CreditorPaymentsModal } from "../components/accounting/CreditorPaymentsModal";

export function AccountingView() {
  const { connectedPlayer, players, matches, abonnements, clubs } = useAppData();
  // Créance en cours d'édition — l'objet "claim" (voir getCreditorClaims)
  // porte l'abonnementId nécessaire pour rouvrir ClaimSettingsModal dessus.
  const [editingClaim, setEditingClaim] = useState(null);
  // Détail des impayés : clé de la ligne en attente de confirmation (clic 1)
  // puis clé de la ligne en cours d'écriture Firestore (clic 2 confirmé).
  const [confirmingKey, setConfirmingKey] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  // Modale de détail des remboursements (bloc 4) : "past" | "upcoming" | null.
  const [paymentsModalTab, setPaymentsModalTab] = useState(null);
  const {
    totalPaidPastMatches,
    totalPaidUpcomingMatches,
    selfReimbursed,
    paymentsReceived,
    paymentsReceivedUpcoming,
  } = getCreditorAccounting(connectedPlayer.id, matches);

  // Créance(s) de départ — chantier du 02/09/2026 : un créancier peut
  // désormais cumuler plusieurs abonnements (une créance par abonnement où
  // il figure), au lieu d'un seul montant global sur sa fiche joueur.
  const { claims, total: advanced } = getCreditorClaims(connectedPlayer.id, abonnements, matches);

  // Repli pour un match sans `creditorIds` (généré avant le chantier du
  // 02/09/2026) : liste globale des créanciers, comme avant.
  const fallbackCreditorIds = new Set(players.filter((p) => p.isCreditor).map((p) => p.id));
  const seasonMatches = matches.filter((m) => m.type === "Saison");

  // Bloc 3 — auto-remboursement : mes propres matchs, joués + à venir. On
  // garde aussi le nombre de matchs (pas seulement le montant) pour
  // l'afficher en petit sous chaque montant, sans que le créancier ait à
  // les recompter lui-même.
  const selfPastMatchesCount = seasonMatches.filter(
    (m) =>
      getMatchTiming(m) === "finished" &&
      participantsOf(m).some((p) => p.playerId === connectedPlayer.id)
  ).length;
  const selfUpcomingMatches = seasonMatches.filter(
    (m) =>
      getMatchTiming(m) !== "finished" &&
      participantsOf(m).some((p) => p.playerId === connectedPlayer.id)
  );
  const selfUpcomingValue = selfUpcomingMatches.reduce(
    (sum, m) => sum + (m.matchFeePerPlayer || 0),
    0
  );
  const selfUpcomingCount = selfUpcomingMatches.length;
  const selfSeasonTotal = selfReimbursed + selfUpcomingValue;
  const selfSeasonCount = selfPastMatchesCount + selfUpcomingCount;

  // Bloc 1 — alerte : impayés sur les matchs déjà joués (hors créanciers de
  // LA SESSION de ce match, exemptés — voir `getSessionCreditorIds` : un
  // créancier qui a financé un autre terrain de la même session, ex. Donald
  // sur le Terrain 6, n'est pas un débiteur ordinaire s'il joue ce jour-là
  // sur un terrain financé par quelqu'un d'autre. On garde ici le détail
  // complet (match + joueur) et pas seulement le total, pour pouvoir
  // afficher la liste nominative ci-dessous et marquer un paiement
  // directement depuis "Ma comptabilité", sans devoir rouvrir chaque match
  // dans l'onglet Matchs.
  const sessionGroups = groupMatchesBySession(matches);
  const unpaidPast = seasonMatches
    .filter((m) => getMatchTiming(m) === "finished")
    .flatMap((m) => {
      const sessionCreditorIds =
        getSessionCreditorIds(m, matches, sessionGroups) || fallbackCreditorIds;
      return participantsOf(m)
        .filter((p) => !sessionCreditorIds.has(p.playerId) && p.paidStatus !== "paid")
        .map((p) => ({
          key: `${m.id}-${p.playerId}`,
          matchId: m.id,
          playerId: p.playerId,
          name: p.name,
          fee: m.matchFeePerPlayer || 0,
          date: m.date,
          location: m.location || "Terrain",
        }));
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const unpaidAmount = unpaidPast.reduce((s, p) => s + p.fee, 0);
  const unpaidCount = unpaidPast.length;
  const allSettled = unpaidCount === 0;

  // Bloc 4 — remboursements par les autres joueurs, même découpage à 3
  // colonnes que le bloc 3 : total à gauche = somme des deux colonnes de
  // détail. Le nombre de matchs de chaque colonne compte les matchs
  // DISTINCTS concernés (et non le nombre de paiements) — cohérent avec le
  // "nombre de matchs" affiché dans "Ma consommation personnelle".
  const totalReceivedAll = totalPaidPastMatches + totalPaidUpcomingMatches;
  const pastMatchesReceivedCount = new Set(paymentsReceived.map((p) => p.matchId)).size;
  const upcomingMatchesReceivedCount = new Set(paymentsReceivedUpcoming.map((p) => p.matchId)).size;
  const totalMatchesReceivedCount = pastMatchesReceivedCount + upcomingMatchesReceivedCount;

  // Bloc 5 — synthèse : créance − (ma saison) − (total des remboursements
  // perçus des autres, passés ET à venir payés d'avance — cet argent est
  // déjà réellement encaissé, il doit donc réduire ce qu'il reste à
  // récupérer, même si le match correspondant n'a pas encore eu lieu).
  const remainingNet = advanced - selfSeasonTotal - totalReceivedAll;

  // Marque le joueur concerné comme ayant payé sa part de ce match, avec
  // "moi" (le créancier connecté) comme créancier destinataire — pas besoin
  // de demander "à quel créancier ?" ici puisque cette vue est déjà celle
  // d'un seul créancier sur sa propre créance.
  const markAsPaid = async (item) => {
    setSavingKey(item.key);
    try {
      const match = matches.find((m) => m.id === item.matchId);
      if (!match) return;
      const updatedParticipants = participantsOf(match).map((p) =>
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

      {/* 2. Créance(s) de départ — une carte par abonnement où je figure
          comme créancier (chantier du 02/09/2026 : je peux désormais en
          cumuler plusieurs). Chaque carte reste modifiable via sa roulette
          de réglages, par moi-même ou par un administrateur. */}
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Créance de départ
      </p>
      {claims.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-5">
          <p className="pm-display text-3xl font-extrabold" style={{ color: "#1F2937" }}>
            0 €
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Aucune créance enregistrée pour l'instant — elle est désormais définie lors de la
            génération d'un abonnement, depuis l'onglet Administration.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-5">
          {claims.map((claim) => {
            const club = clubs.find((c) => c.id === claim.clubId);
            const periodLabel = formatClaimPeriodLabel(claim.startDate, claim.endDate);
            return (
              <div
                key={claim.abonnementId}
                className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500 truncate">
                    {claim.label || club?.name || "Abonnement"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingClaim(claim)}
                    className="p-1.5 -m-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                    title="Modifier cette créance"
                  >
                    <Icon.Settings className="w-4 h-4" />
                  </button>
                </div>
                <p className="pm-display text-2xl font-extrabold" style={{ color: "#1F2937" }}>
                  {claim.amount.toLocaleString("fr-FR")} €
                </p>
                <p className="text-[10px] text-slate-400 mt-2.5 pt-2.5 border-t border-slate-100">
                  {[
                    club?.name,
                    (claim.courts || []).length > 0 &&
                      `Terrain${claim.courts.length > 1 ? "s" : ""} ${claim.courts.join(", ")}`,
                    periodLabel,
                    `${claim.coveredMatches} match${claim.coveredMatches > 1 ? "s" : ""} couvert${claim.coveredMatches > 1 ? "s" : ""}`,
                  ]
                    .filter(Boolean)
                    .join("  ·  ")}
                </p>
              </div>
            );
          })}
          {claims.length > 1 && (
            <p className="text-xs text-slate-500 px-1">
              Total : <span className="font-bold">{advanced.toLocaleString("fr-FR")} €</span>
            </p>
          )}
        </div>
      )}

      {editingClaim && (
        <ClaimSettingsModal
          creditorId={connectedPlayer.id}
          creditorName={connectedPlayer.name}
          abonnement={abonnements.find((a) => a.id === editingClaim.abonnementId)}
          onClose={() => setEditingClaim(null)}
        />
      )}

      {/* 3. Consommation personnelle (auto-remboursement) — un seul bloc,
          divisé en trois colonnes : le coût total de la saison mis en
          évidence à gauche, puis le détail matchs déjà joués / à venir.
          Toujours 3 colonnes côte à côte, y compris sur mobile (grid-cols-3
          sans variante sm:) — polices et paddings réduits en dessous du
          point de rupture sm: pour que ça tienne sans passer à la ligne. */}
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Ma consommation personnelle
      </p>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-5 overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <div className="p-2 sm:p-4" style={{ backgroundColor: "#1F2937" }}>
            <Icon.Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/70 mb-1 sm:mb-2" />
            <p className="pm-display text-sm sm:text-2xl font-extrabold text-white leading-tight">
              {selfSeasonTotal.toLocaleString("fr-FR")} €
            </p>
            <p className="text-[9px] sm:text-xs text-white/70 mt-0.5 leading-tight">
              Coût total estimé de ma saison
            </p>
            <p className="text-[8px] sm:text-[10px] text-white/40 mt-1">
              {selfSeasonCount} match{selfSeasonCount > 1 ? "s" : ""}
            </p>
          </div>
          <div className="p-2 sm:p-4">
            <Icon.CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 mb-1 sm:mb-2" />
            <p
              className="pm-display text-sm sm:text-xl font-extrabold leading-tight"
              style={{ color: "#1F2937" }}
            >
              {selfReimbursed.toLocaleString("fr-FR")} €
            </p>
            <p className="text-[9px] sm:text-xs text-slate-500 mt-0.5 leading-tight">
              Mes matchs déjà joués
            </p>
            <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1">
              {selfPastMatchesCount} match{selfPastMatchesCount > 1 ? "s" : ""}
            </p>
          </div>
          <div className="p-2 sm:p-4">
            <Icon.Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-600 mb-1 sm:mb-2" />
            <p
              className="pm-display text-sm sm:text-xl font-extrabold leading-tight"
              style={{ color: "#1F2937" }}
            >
              {selfUpcomingValue.toLocaleString("fr-FR")} €
            </p>
            <p className="text-[9px] sm:text-xs text-slate-500 mt-0.5 leading-tight">
              Mes matchs à venir
            </p>
            <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1">
              {selfUpcomingCount} match{selfUpcomingCount > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Remboursements par les autres joueurs — même présentation à 3
          colonnes que "Ma consommation personnelle" : total perçu mis en
          évidence à gauche (= somme des 2 colonnes suivantes), puis déjà
          perçu (matchs passés) / perçu d'avance (matchs à venir). Ces 2
          dernières colonnes sont cliquables et ouvrent le détail nominatif
          (CreditorPaymentsModal), groupé par joueur pour rester lisible même
          avec des dizaines de remboursements. */}
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Remboursements par les autres joueurs
      </p>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-5 overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <div className="p-2 sm:p-4" style={{ backgroundColor: "#1F2937" }}>
            <Icon.Coin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/70 mb-1 sm:mb-2" />
            <p className="pm-display text-sm sm:text-2xl font-extrabold text-white leading-tight">
              {totalReceivedAll.toLocaleString("fr-FR")} €
            </p>
            <p className="text-[9px] sm:text-xs text-white/70 mt-0.5 leading-tight">
              Total des remboursements perçus
            </p>
            <p className="text-[8px] sm:text-[10px] text-white/40 mt-1">
              {totalMatchesReceivedCount} match{totalMatchesReceivedCount > 1 ? "s" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => paymentsReceived.length > 0 && setPaymentsModalTab("past")}
            disabled={paymentsReceived.length === 0}
            className="p-2 sm:p-4 text-left hover:bg-emerald-50/60 active:bg-emerald-50 transition-colors disabled:hover:bg-transparent disabled:cursor-default"
          >
            <Icon.CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 mb-1 sm:mb-2" />
            <p
              className="pm-display text-sm sm:text-xl font-extrabold leading-tight"
              style={{ color: "#1F2937" }}
            >
              {totalPaidPastMatches.toLocaleString("fr-FR")} €
            </p>
            <p className="text-[9px] sm:text-xs text-slate-500 mt-0.5 leading-tight">
              Déjà perçu (matchs passés)
            </p>
            <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1 flex items-center gap-0.5">
              {pastMatchesReceivedCount} match{pastMatchesReceivedCount > 1 ? "s" : ""}
              {paymentsReceived.length > 0 && <Icon.Chevron className="w-2.5 h-2.5 text-slate-300" />}
            </p>
          </button>
          <button
            type="button"
            onClick={() => paymentsReceivedUpcoming.length > 0 && setPaymentsModalTab("upcoming")}
            disabled={paymentsReceivedUpcoming.length === 0}
            className="p-2 sm:p-4 text-left hover:bg-sky-50/60 active:bg-sky-50 transition-colors disabled:hover:bg-transparent disabled:cursor-default"
          >
            <Icon.Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-600 mb-1 sm:mb-2" />
            <p
              className="pm-display text-sm sm:text-xl font-extrabold leading-tight"
              style={{ color: "#1F2937" }}
            >
              {totalPaidUpcomingMatches.toLocaleString("fr-FR")} €
            </p>
            <p className="text-[9px] sm:text-xs text-slate-500 mt-0.5 leading-tight">
              Perçu d'avance (matchs à venir)
            </p>
            <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1 flex items-center gap-0.5">
              {upcomingMatchesReceivedCount} match{upcomingMatchesReceivedCount > 1 ? "s" : ""}
              {paymentsReceivedUpcoming.length > 0 && (
                <Icon.Chevron className="w-2.5 h-2.5 text-slate-300" />
              )}
            </p>
          </button>
        </div>
      </div>

      {paymentsModalTab === "past" && (
        <CreditorPaymentsModal
          title="Remboursements reçus — matchs passés"
          subtitle={`${pastMatchesReceivedCount} match${pastMatchesReceivedCount > 1 ? "s" : ""} · ${totalPaidPastMatches.toLocaleString("fr-FR")} € au total`}
          payments={paymentsReceived}
          players={players}
          accent="emerald"
          sortDir="desc"
          onClose={() => setPaymentsModalTab(null)}
        />
      )}
      {paymentsModalTab === "upcoming" && (
        <CreditorPaymentsModal
          title="Remboursements reçus — matchs à venir"
          subtitle={`${upcomingMatchesReceivedCount} match${upcomingMatchesReceivedCount > 1 ? "s" : ""} · ${totalPaidUpcomingMatches.toLocaleString("fr-FR")} € au total`}
          payments={paymentsReceivedUpcoming}
          players={players}
          accent="sky"
          sortDir="asc"
          onClose={() => setPaymentsModalTab(null)}
        />
      )}

      {/* 5. Synthèse — reste net à récupérer. */}
      <div
        className="rounded-2xl shadow-md p-5 mb-6 text-white"
        style={{ background: "linear-gradient(135deg, #0284C7, #4338CA)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Icon.Wallet className="w-5 h-5" />
          <span className="text-xs font-semibold uppercase tracking-wide text-white/70">
            Reste net à récupérer
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
        <p className="text-[11px] text-white/70 mt-3 pt-3 border-t border-white/20 leading-relaxed">
          Créance {advanced.toLocaleString("fr-FR")} € − Ma saison{" "}
          {selfSeasonTotal.toLocaleString("fr-FR")} € − Total perçu des autres{" "}
          {totalReceivedAll.toLocaleString("fr-FR")} €
        </p>
      </div>
    </div>
  );
}
