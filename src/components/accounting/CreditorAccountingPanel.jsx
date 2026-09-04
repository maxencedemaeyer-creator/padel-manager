// ─────────────────────────────────────────────────────────────────────────
// Panneau partagé "comptabilité d'un créancier" — les 5-6 blocs (alerte,
// impayés nominatifs, créance de départ, consommation perso, remboursements,
// synthèse, hors abonnement). Extrait de AccountingView.jsx le 04/09/2026
// pour être réutilisé tel quel :
// - par AccountingView.jsx (le créancier connecté consulte SA comptabilité,
//   interactif : peut marquer payé, assigner une dette, éditer sa créance) ;
// - par CreditorAccountingModal.jsx (l'admin consulte, en LECTURE SEULE, la
//   comptabilité de N'IMPORTE QUEL créancier depuis "Administration" →
//   "Soldes des créanciers" → clic sur un nom) — même calcul, même rendu
//   visuel, aucune action possible.
//
// `creditorId` remplace `connectedPlayer.id` de l'ancienne version : c'est
// le créancier dont on affiche la comptabilité (peut être n'importe qui en
// mode admin, toujours soi-même en mode "Ma comptabilité").
// `viewerId` = la personne qui REGARDE cet écran, uniquement utilisé pour
// savoir si une dette assignée doit s'afficher "→ Doit payer à moi" (créance
// vue par le créancier concerné lui-même) ou par son nom (vue par un tiers,
// ex. l'admin). Par défaut égal à `creditorId` (comportement de "Ma
// comptabilité" : on est toujours son propre spectateur).
// `readOnly` masque toute action qui écrit dans Firestore (Marquer payé,
// Doit payer à…, modifier une créance) — n'affecte aucun calcul, uniquement
// l'affichage des boutons.
// ─────────────────────────────────────────────────────────────────────────
import { useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { cn, formatDateFR, formatClaimPeriodLabel } from "../../lib/utils";
import {
  getCreditorAccounting,
  getCreditorClaims,
  getUnpaidPastParticipations,
  participantsOf,
} from "../../lib/stats";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { ClaimSettingsModal } from "./ClaimSettingsModal";
import { CreditorPaymentsModal } from "./CreditorPaymentsModal";
import { AssignCreditorModal } from "./AssignCreditorModal";

export function CreditorAccountingPanel({ creditorId, readOnly = false, viewerId }) {
  const { players, matches, abonnements, clubs } = useAppData();
  const effectiveViewerId = viewerId || creditorId;

  // Créance en cours d'édition — l'objet "claim" (voir getCreditorClaims)
  // porte l'abonnementId nécessaire pour rouvrir ClaimSettingsModal dessus.
  const [editingClaim, setEditingClaim] = useState(null);
  // Détail des impayés : clé de la ligne en attente de confirmation (clic 1)
  // puis clé de la ligne en cours d'écriture Firestore (clic 2 confirmé).
  const [confirmingKey, setConfirmingKey] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  // Chantier "doit payer à" du 04/09/2026 (soir) : clé de la ligne pour
  // laquelle AssignCreditorModal est ouverte (assignation ou réassignation
  // d'un impayé à un créancier précis, sans le marquer payé).
  const [assigningKey, setAssigningKey] = useState(null);
  // Modale de détail des remboursements (bloc 4) : "past" | "upcoming" | null.
  const [paymentsModalTab, setPaymentsModalTab] = useState(null);
  const {
    totalPaidPastMatches,
    totalPaidUpcomingMatches,
    selfReimbursed,
    selfPastCoveredCount,
    selfUpcomingCoveredValue,
    selfUpcomingCoveredCount,
    paymentsReceived,
    paymentsReceivedUpcoming,
    selfPayableMatches,
    selfPayablePastCount,
    selfPayableUpcomingCount,
    selfPayableTotal,
  } = getCreditorAccounting(creditorId, matches, players);

  // Créance(s) de départ — un créancier peut cumuler plusieurs abonnements
  // (une créance par abonnement où il figure), au lieu d'un seul montant
  // global sur sa fiche joueur.
  const { claims, total: advanced } = getCreditorClaims(creditorId, abonnements, matches);

  // Bloc 3 — auto-remboursement : ses propres matchs COUVERTS par sa
  // créance (il finance un terrain de la session, voir getSessionCreditorIds
  // dans getCreditorAccounting), joués + à venir.
  const selfSeasonTotal = selfReimbursed + selfUpcomingCoveredValue;
  const selfSeasonCount = selfPastCoveredCount + selfUpcomingCoveredCount;

  // Bloc 3bis — ses matchs HORS abonnement : parmi les matchs qu'il joue,
  // ceux où il n'est créancier d'AUCUN terrain de la session — à régler
  // comme n'importe quel joueur.
  const selfPayablePastTotal = selfPayableMatches
    .filter((m) => m.finished)
    .reduce((s, m) => s + m.fee, 0);
  const selfPayableUpcomingTotal = selfPayableTotal - selfPayablePastTotal;
  const hasPayableMatches = selfPayableMatches.length > 0;

  // Bloc 1 — alerte : impayés sur les matchs déjà joués. Calcul GLOBAL, non
  // filtré par créancier (voir getUnpaidPastParticipations, lib/stats.js) —
  // c'est exactement ce que ce créancier voit lui-même dans "Ma comptabilité",
  // donc exactement ce que cette copie doit reproduire.
  const unpaidPast = getUnpaidPastParticipations(matches, players);
  const unpaidAmount = unpaidPast.reduce((s, p) => s + p.fee, 0);
  const unpaidCount = unpaidPast.length;
  const allSettled = unpaidCount === 0;
  // Ancre de défilement pour la pastille "impayés" ajoutée dans l'en-tête du
  // bloc "Remboursements" plus bas.
  const unpaidListRef = useRef(null);

  // Bloc 4 — remboursements par les autres joueurs.
  const totalReceivedAll = totalPaidPastMatches + totalPaidUpcomingMatches;
  const pastSessionsReceivedCount = new Set(paymentsReceived.map((p) => p.sessionKey)).size;
  const upcomingSessionsReceivedCount = new Set(
    paymentsReceivedUpcoming.map((p) => p.sessionKey)
  ).size;
  const totalSessionsReceivedCount = pastSessionsReceivedCount + upcomingSessionsReceivedCount;

  // Bloc 5 — synthèse.
  const remainingNet = advanced - selfSeasonTotal - totalReceivedAll;

  // Marque le joueur concerné comme ayant payé sa part de ce match. Si la
  // dette a déjà été assignée à un créancier précis via "Doit payer à..."
  // (item.owedTo), le paiement lui est crédité directement. Sinon, crédité
  // au créancier dont on affiche la comptabilité (celui-ci ne peut être
  // modifié que depuis SA PROPRE vue, jamais en mode lecture seule).
  const markAsPaid = async (item) => {
    setSavingKey(item.key);
    try {
      const match = matches.find((m) => m.id === item.matchId);
      if (!match) return;
      const updatedParticipants = participantsOf(match).map((p) =>
        p.playerId === item.playerId
          ? { ...p, paidStatus: "paid", creditorId: item.owedTo || creditorId }
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

  // Item actuellement ouvert dans AssignCreditorModal (ou null).
  const assigningItem = unpaidPast.find((i) => i.key === assigningKey) || null;

  return (
    <>
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

      {/* 1bis. Détail nominatif des impayés — qui doit quoi, pour quel match.
          Boutons d'action masqués en lecture seule (mode admin). */}
      {!allSettled && (
        <div ref={unpaidListRef} className="flex flex-col gap-2 mb-5">
          {unpaidPast.map((item) => {
            const isConfirming = confirmingKey === item.key;
            const isSaving = savingKey === item.key;
            const owedToPlayer = item.owedTo
              ? players.find((p) => p.id === item.owedTo) || null
              : null;
            return (
              <div
                key={item.key}
                className="bg-white border border-orange-200/70 rounded-2xl p-3.5 flex flex-col gap-2"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                    <Icon.AlertCircle className="w-4 h-4 text-orange-500" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">{item.name}</span>
                    <span className="block text-xs text-slate-400 truncate">
                      {formatDateFR(item.date)} · {item.location}
                    </span>
                    {owedToPlayer && (
                      <span className="block text-[11px] font-medium text-sky-700 mt-0.5 truncate">
                        → Doit payer à{" "}
                        {owedToPlayer.id === effectiveViewerId ? "moi" : owedToPlayer.name}
                      </span>
                    )}
                  </span>
                  <span className="pm-mono font-bold text-orange-600 text-sm shrink-0">
                    {item.fee.toLocaleString("fr-FR")} €
                  </span>
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-1.5 flex-wrap pl-12">
                    {isConfirming ? (
                      <>
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
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setConfirmingKey(item.key)}
                          className="shrink-0 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                        >
                          Marquer payé
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssigningKey(item.key)}
                          className="shrink-0 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-sky-300 hover:text-sky-700 hover:bg-sky-50 transition-colors"
                        >
                          {owedToPlayer ? "Changer de créancier" : "Doit payer à…"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!readOnly && assigningItem && (
        <AssignCreditorModal
          matchId={assigningItem.matchId}
          playerId={assigningItem.playerId}
          playerName={assigningItem.name}
          fee={assigningItem.fee}
          currentOwedTo={assigningItem.owedTo}
          onClose={() => setAssigningKey(null)}
        />
      )}

      {/* 2. Créance(s) de départ — une carte par abonnement où il figure
          comme créancier. Roulette de réglages masquée en lecture seule. */}
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
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => setEditingClaim(claim)}
                      className="p-1.5 -m-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                      title="Modifier cette créance"
                    >
                      <Icon.Settings className="w-4 h-4" />
                    </button>
                  )}
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

      {!readOnly && editingClaim && (
        <ClaimSettingsModal
          creditorId={creditorId}
          creditorName={players.find((p) => p.id === creditorId)?.name || ""}
          abonnement={abonnements.find((a) => a.id === editingClaim.abonnementId)}
          onClose={() => setEditingClaim(null)}
        />
      )}

      {/* 3. Consommation personnelle (auto-remboursement). */}
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Consommation personnelle
      </p>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-5 overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <div className="p-2 sm:p-4" style={{ backgroundColor: "#1F2937" }}>
            <Icon.Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/70 mb-1 sm:mb-2" />
            <p className="pm-display text-sm sm:text-2xl font-extrabold text-white leading-tight">
              {selfSeasonTotal.toLocaleString("fr-FR")} €
            </p>
            <p className="text-[9px] sm:text-xs text-white/70 mt-0.5 leading-tight">
              Coût total estimé de la saison
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
              Matchs déjà joués
            </p>
            <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1">
              {selfPastCoveredCount} match{selfPastCoveredCount > 1 ? "s" : ""}
            </p>
          </div>
          <div className="p-2 sm:p-4">
            <Icon.Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-600 mb-1 sm:mb-2" />
            <p
              className="pm-display text-sm sm:text-xl font-extrabold leading-tight"
              style={{ color: "#1F2937" }}
            >
              {selfUpcomingCoveredValue.toLocaleString("fr-FR")} €
            </p>
            <p className="text-[9px] sm:text-xs text-slate-500 mt-0.5 leading-tight">
              Matchs à venir
            </p>
            <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1">
              {selfUpcomingCoveredCount} match{selfUpcomingCoveredCount > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Remboursements par les autres joueurs. */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Remboursements par les autres joueurs
        </p>
        {!allSettled && (
          <button
            type="button"
            onClick={() =>
              unpaidListRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-[11px] font-semibold hover:bg-orange-100 transition-colors shrink-0"
            title="Voir le détail des impayés plus haut"
          >
            <Icon.AlertCircle className="w-3 h-3" />
            {unpaidCount} impayé{unpaidCount > 1 ? "s" : ""} ·{" "}
            {unpaidAmount.toLocaleString("fr-FR")} €
          </button>
        )}
      </div>
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
              {totalSessionsReceivedCount} session{totalSessionsReceivedCount > 1 ? "s" : ""}
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
              {pastSessionsReceivedCount} session{pastSessionsReceivedCount > 1 ? "s" : ""}
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
              {upcomingSessionsReceivedCount} session{upcomingSessionsReceivedCount > 1 ? "s" : ""}
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
          subtitle={`${pastSessionsReceivedCount} session${pastSessionsReceivedCount > 1 ? "s" : ""} · ${totalPaidPastMatches.toLocaleString("fr-FR")} € au total`}
          payments={paymentsReceived}
          players={players}
          matches={matches}
          accent="emerald"
          sortDir="desc"
          onClose={() => setPaymentsModalTab(null)}
        />
      )}
      {paymentsModalTab === "upcoming" && (
        <CreditorPaymentsModal
          title="Remboursements reçus — matchs à venir"
          subtitle={`${upcomingSessionsReceivedCount} session${upcomingSessionsReceivedCount > 1 ? "s" : ""} · ${totalPaidUpcomingMatches.toLocaleString("fr-FR")} € au total`}
          payments={paymentsReceivedUpcoming}
          players={players}
          matches={matches}
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
          Ce montant représente la somme brute qu'il reste encore à recevoir en liquide/virement
          pour clôturer la créance tout en couvrant sa propre saison.
        </p>
        <p className="text-[11px] text-white/70 mt-3 pt-3 border-t border-white/20 leading-relaxed">
          Créance {advanced.toLocaleString("fr-FR")} € − Sa saison{" "}
          {selfSeasonTotal.toLocaleString("fr-FR")} € − Total perçu des autres{" "}
          {totalReceivedAll.toLocaleString("fr-FR")} €
        </p>
      </div>

      {/* 6. Consommation personnelle hors abonnement — matchs joués mais non
          financés par lui-même (aucun terrain de la session n'est le sien) :
          à régler comme n'importe quel joueur. */}
      {hasPayableMatches && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-500 mb-2">
            Consommation personnelle hors abonnement
          </p>
          <p className="text-xs text-rose-600/80 mb-2">
            N'est créancier d'aucun terrain ces jours-là — ces matchs ne sont pas couverts par sa
            créance, à régler comme n'importe quel joueur.
          </p>
          <div className="bg-rose-50 border border-rose-200 rounded-2xl shadow-sm mb-3 overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-rose-200/70">
              <div className="p-2 sm:p-4 bg-rose-100/70">
                <Icon.AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 mb-1 sm:mb-2" />
                <p className="pm-display text-sm sm:text-2xl font-extrabold text-rose-800 leading-tight">
                  {selfPayableTotal.toLocaleString("fr-FR")} €
                </p>
                <p className="text-[9px] sm:text-xs text-rose-700/80 mt-0.5 leading-tight">
                  Total hors abonnement
                </p>
                <p className="text-[8px] sm:text-[10px] text-rose-600/60 mt-1">
                  {selfPayableMatches.length} match{selfPayableMatches.length > 1 ? "s" : ""}
                </p>
              </div>
              <div className="p-2 sm:p-4">
                <Icon.CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 mb-1 sm:mb-2" />
                <p className="pm-display text-sm sm:text-xl font-extrabold leading-tight text-rose-800">
                  {selfPayablePastTotal.toLocaleString("fr-FR")} €
                </p>
                <p className="text-[9px] sm:text-xs text-rose-700/70 mt-0.5 leading-tight">
                  Déjà joués
                </p>
                <p className="text-[8px] sm:text-[10px] text-rose-600/50 mt-1">
                  {selfPayablePastCount} match{selfPayablePastCount > 1 ? "s" : ""}
                </p>
              </div>
              <div className="p-2 sm:p-4">
                <Icon.Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 mb-1 sm:mb-2" />
                <p className="pm-display text-sm sm:text-xl font-extrabold leading-tight text-rose-800">
                  {selfPayableUpcomingTotal.toLocaleString("fr-FR")} €
                </p>
                <p className="text-[9px] sm:text-xs text-rose-700/70 mt-0.5 leading-tight">
                  À venir
                </p>
                <p className="text-[8px] sm:text-[10px] text-rose-600/50 mt-1">
                  {selfPayableUpcomingCount} match{selfPayableUpcomingCount > 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {selfPayableMatches.map((item) => {
              const statusLabel = !item.finished ? "À venir" : item.paid ? "Réglé" : "À régler";
              const statusTone = !item.finished
                ? "text-sky-700 bg-sky-50 border-sky-200"
                : item.paid
                ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                : "text-rose-700 bg-rose-100 border-rose-200";
              return (
                <div
                  key={item.key}
                  className="bg-rose-50/60 border border-rose-200 rounded-2xl p-3 flex items-center gap-3"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">
                      {formatDateFR(item.date)} · {item.location}
                    </span>
                    <span
                      className={cn(
                        "inline-block mt-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold",
                        statusTone
                      )}
                    >
                      {statusLabel}
                    </span>
                  </span>
                  <span className="pm-mono font-bold text-sm text-rose-800 shrink-0">
                    {item.fee.toLocaleString("fr-FR")} €
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
