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
import { useMemo, useRef, useState } from "react";
import { doc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import { cn, formatDateFR, formatClaimPeriodLabel } from "../../lib/utils";
import {
  getCreditorAccounting,
  getCreditorClaims,
  getCreditorTransfers,
  getUnpaidPastParticipations,
  groupDebtsByDebtor,
  participantsOf,
  round2,
} from "../../lib/stats";
import { getSavedBilans } from "../../lib/settlement";
import { SubscriptionBilanModal, abonnementDisplayName } from "./SubscriptionBilanModal";
import { useAppData } from "../../context/AppContext";
import { logActivity, matchLabel, playerName } from "../../lib/activityLog";
import Icon from "../icons/Icon";
import { PlayerAvatar } from "../players/PlayerAvatar";
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
  // Chantier "recap cumulé" du 18/09/2026 : clés des cartes de groupe
  // (paire joueur/créancier assigné) actuellement dépliées, puis le même
  // pattern de confirmation en 2 clics que "Marquer payé" mais au niveau du
  // groupe entier ("Marquer tout payé").
  const [openGroupKeys, setOpenGroupKeys] = useState(() => new Set());
  const [confirmingGroupKey, setConfirmingGroupKey] = useState(null);
  const [savingGroupKey, setSavingGroupKey] = useState(null);
  // Modale de détail des remboursements (bloc 4) : "past" | "upcoming" | null.
  const [paymentsModalTab, setPaymentsModalTab] = useState(null);
  // Volet "Consommation personnelle hors abonnement" (bloc 6) : replié par
  // défaut (19/10/2026), état non mémorisé — aucune écriture Firebase.
  const [showOffSubscription, setShowOffSubscription] = useState(false);
  // Mémoïsé (04/09/2026) : ces 3 fonctions reparcourent TOUS les matchs de
  // l'app (`getUnpaidPastParticipations` n'est même pas filtrée par
  // créancier). Ce panneau est ouvert par CHAQUE créancier dans "Ma
  // comptabilité", et par l'admin pour CHAQUE créancier depuis
  // "Administration" — sans mémoïsation, ces calculs étaient refaits à
  // chaque rendu, y compris pour un rendu sans rapport (ouvrir une modale
  // de détail, par exemple). Ne sont refaits que si les matchs/joueurs/
  // abonnements ou le créancier affiché changent réellement.
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
  } = useMemo(
    () => getCreditorAccounting(creditorId, matches, players),
    [creditorId, matches, players]
  );

  // Créance(s) de départ — un créancier peut cumuler plusieurs abonnements
  // (une créance par abonnement où il figure), au lieu d'un seul montant
  // global sur sa fiche joueur.
  const { claims, total: advanced } = useMemo(
    () => getCreditorClaims(creditorId, abonnements, matches),
    [creditorId, abonnements, matches]
  );

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
  const unpaidPast = useMemo(
    () => getUnpaidPastParticipations(matches, players),
    [matches, players]
  );
  const unpaidAmount = unpaidPast.reduce((s, p) => s + p.fee, 0);
  const unpaidCount = unpaidPast.length;
  const allSettled = unpaidCount === 0;
  // Ancre de défilement pour la pastille "impayés" ajoutée dans l'en-tête du
  // bloc "Remboursements" plus bas.
  const unpaidListRef = useRef(null);

  // Recap cumulé (18/09/2026) : parmi TOUS les impayés de l'app (calcul
  // global, non filtré par créancier — voir commentaire ci-dessus), on
  // regroupe ceux déjà explicitement assignés ("Doit payer à…") par paire
  // (joueur, créancier) — voir groupDebtsByDebtor, lib/stats.js. Les impayés
  // pas encore assignés restent dans `ungroupedDebts`, affichés à l'unité
  // exactement comme avant ce chantier.
  const { groups: debtGroups, ungrouped: ungroupedDebts } = useMemo(
    () => groupDebtsByDebtor(unpaidPast),
    [unpaidPast]
  );

  // Chantier "impayés dépliables" (30/10/2026) — uniquement de l'affichage,
  // aucun calcul ni aucune écriture Firebase en plus. Le bandeau "Attention…"
  // n'apparaît que s'il existe au moins un impayé dans le club ; il devient
  // dépliable. Un créancier est "concerné" s'il a au moins une dette
  // attribuée À LUI, ou s'il reste au moins une dette À ATTRIBUER (un impayé
  // non attribué peut être réglé à n'importe quel créancier, il concerne donc
  // tout le monde). Concerné → déplié par défaut ; sinon replié par défaut.
  // L'état choisi n'est pas mémorisé (revient au défaut à chaque ouverture).
  // Une fois déplié : "Doit me payer" → "À attribuer" → "Chez les autres
  // créanciers".
  const myDebtGroups = debtGroups.filter((g) => g.creditorId === creditorId);
  const otherDebtGroups = debtGroups.filter((g) => g.creditorId !== creditorId);
  const myOwedCount = myDebtGroups.reduce((s, g) => s + g.count, 0);
  const toAssignCount = ungroupedDebts.length;
  const isConcerned = myOwedCount > 0 || toAssignCount > 0;
  // null = pas encore touché → suit le défaut (concerné ou non).
  const [unpaidOpenChoice, setUnpaidOpenChoice] = useState(null);
  const isUnpaidOpen = unpaidOpenChoice ?? isConcerned;
  // "Sessions impayées" : un joueur pour un jeudi = une session impayée.
  const unpaidSessionsCount = new Set(unpaidPast.map((p) => `${p.playerId}|${p.date}`)).size;
  // Dans la vue admin (lecture seule), on parle du créancier consulté.
  const creditorFirstName =
    (players.find((p) => p.id === creditorId)?.name || "").split(" ")[0] || "ce créancier";
  const unpaidSummary = (() => {
    if (!isConcerned) return readOnly ? `Rien ne concerne ${creditorFirstName}.` : "Rien ne vous concerne.";
    const parts = [];
    if (myOwedCount > 0)
      parts.push(`${myOwedCount} à percevoir par ${readOnly ? creditorFirstName : "vous"}`);
    if (toAssignCount > 0) parts.push(`${toAssignCount} à attribuer`);
    return `Dont ${parts.join(" · ")}.`;
  })();

  // Bloc 4 — remboursements par les autres joueurs.
  const totalReceivedAll = totalPaidPastMatches + totalPaidUpcomingMatches;
  const pastSessionsReceivedCount = new Set(paymentsReceived.map((p) => p.sessionKey)).size;
  const upcomingSessionsReceivedCount = new Set(
    paymentsReceivedUpcoming.map((p) => p.sessionKey)
  ).size;
  const totalSessionsReceivedCount = pastSessionsReceivedCount + upcomingSessionsReceivedCount;

  // Versements entre créanciers (30/10/2026) : argent réellement remis à un
  // autre créancier (« versé ») ou reçu d'un autre créancier (« reçu »)
  // pour remettre les comptes à l'équilibre — voir TransferModal.jsx.
  const {
    inTotal: transfersIn,
    outTotal: transfersOut,
    list: transfers,
  } = useMemo(() => getCreditorTransfers(creditorId, abonnements), [creditorId, abonnements]);

  // Bilans enregistrés des abonnements dont il est créancier (clôture).
  const closedBilans = useMemo(
    () =>
      (abonnements || []).filter(
        (a) =>
          (a.creditors || []).some((c) => c.playerId === creditorId) &&
          getSavedBilans(a).length > 0
      ),
    [abonnements, creditorId]
  );
  const [bilanAbonnementId, setBilanAbonnementId] = useState(null);

  // Bloc 5 — synthèse.
  const remainingNet = round2(
    advanced - selfSeasonTotal - totalReceivedAll + transfersOut - transfersIn
  );

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
      logActivity(
        "payment",
        `${playerName(players, item.playerId)} marqué payé à ${playerName(players, item.owedTo || creditorId)} — ${matchLabel(match)}`
      );
      setConfirmingKey(null);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSavingKey(null);
    }
  };

  // Item actuellement ouvert dans AssignCreditorModal (ou null).
  const assigningItem = unpaidPast.find((i) => i.key === assigningKey) || null;

  const toggleGroup = (groupKey) => {
    setOpenGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  // "Marquer tout payé" au niveau d'un groupe (18/09/2026) : règle en une
  // seule écriture Firestore tous les matchs cumulés d'une paire (joueur,
  // créancier assigné) — évite de cliquer "Marquer payé" une fois par match
  // quand un joueur règle tout d'un coup (ex. plusieurs semaines en liquide
  // le même jour). Un groupe peut couvrir plusieurs matchs différents (donc
  // plusieurs documents Firestore) : on utilise un writeBatch pour que tout
  // parte en une seule opération atomique, et on regroupe d'abord par
  // matchId pour n'écrire qu'une fois par match même si, cas limite, deux
  // participants de la même dette concernaient le même document.
  const markGroupAsPaid = async (group) => {
    setSavingGroupKey(group.groupKey);
    try {
      const matchIds = [...new Set(group.items.map((item) => item.matchId))];
      const batch = writeBatch(db);
      matchIds.forEach((matchId) => {
        const match = matches.find((m) => m.id === matchId);
        if (!match) return;
        const playerIdsSettled = new Set(
          group.items.filter((item) => item.matchId === matchId).map((item) => item.playerId)
        );
        const updatedParticipants = participantsOf(match).map((p) =>
          playerIdsSettled.has(p.playerId)
            ? { ...p, paidStatus: "paid", creditorId: group.creditorId }
            : p
        );
        batch.update(doc(db, "matches", matchId), { participants: updatedParticipants });
      });
      await batch.commit();
      logActivity(
        "payment",
        `${playerName(players, group.playerId)} marqué payé à ${playerName(players, group.creditorId)} pour ${group.items.length} match${group.items.length > 1 ? "s" : ""} (${group.total.toLocaleString("fr-FR")} €)`
      );
      setConfirmingGroupKey(null);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSavingGroupKey(null);
    }
  };

  // Carte cumulée d'une paire (joueur, créancier attribué).
  const renderDebtGroup = (group) => {
            const isGroupOpen = openGroupKeys.has(group.groupKey);
            const isConfirmingGroup = confirmingGroupKey === group.groupKey;
            const isSavingGroup = savingGroupKey === group.groupKey;
            const debtor = players.find((p) => p.id === group.playerId) || null;
            const creditorName =
              group.creditorId === effectiveViewerId
                ? "moi"
                : players.find((p) => p.id === group.creditorId)?.name || "quelqu'un";
            return (
              <div
                key={group.groupKey}
                className="bg-white border border-orange-200/70 rounded-2xl overflow-hidden"
              >
                <div className="flex items-center gap-3 p-3.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.groupKey)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    {debtor ? (
                      <PlayerAvatar player={debtor} size={36} />
                    ) : (
                      <span className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                        <Icon.AlertCircle className="w-4 h-4 text-orange-500" />
                      </span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold truncate">
                        {group.playerName}
                      </span>
                      <span className="block text-[11px] font-medium text-sky-700 truncate">
                        → Doit payer à {creditorName}
                      </span>
                      <span className="block text-xs text-slate-400 mt-0.5">
                        {group.count} session{group.count > 1 ? "s" : ""} non réglée
                        {group.count > 1 ? "s" : ""}
                      </span>
                    </span>
                  </button>
                  <span className="pm-mono font-bold text-orange-600 text-sm shrink-0">
                    {group.total.toLocaleString("fr-FR")} €
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.groupKey)}
                    className="shrink-0 p-1 -m-1 text-slate-300 hover:text-slate-500"
                    title={isGroupOpen ? "Replier" : "Voir le détail des matchs"}
                  >
                    <Icon.Chevron
                      className={cn("w-4 h-4 transition-transform", isGroupOpen && "rotate-90")}
                    />
                  </button>
                </div>
                {isGroupOpen && (
                  <div className="border-t border-orange-100 bg-orange-50/40">
                    {/* 25/10/2026 : jamais d'action sur ses PROPRES dettes
                        (un autre créancier ou l'admin les règle). */}
                    {!readOnly && group.playerId !== creditorId && (
                      <div className="flex items-center gap-1.5 flex-wrap px-3.5 py-2.5 border-b border-orange-100/70">
                        {isConfirmingGroup ? (
                          <>
                            <span className="text-xs text-slate-500 mr-1">
                              Confirmer le règlement des {group.count} matchs ?
                            </span>
                            <button
                              type="button"
                              disabled={isSavingGroup}
                              onClick={() => markGroupAsPaid(group)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                            >
                              {isSavingGroup ? "…" : "Confirmer"}
                            </button>
                            <button
                              type="button"
                              disabled={isSavingGroup}
                              onClick={() => setConfirmingGroupKey(null)}
                              className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 text-xs font-medium disabled:opacity-50"
                            >
                              Annuler
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmingGroupKey(group.groupKey)}
                            className="shrink-0 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                          >
                            Marquer tout payé ({group.count} match{group.count > 1 ? "s" : ""})
                          </button>
                        )}
                      </div>
                    )}
                    <div className="divide-y divide-orange-100/70">
                      {group.items.map((item) => (
                        <DebtItemRow
                          key={item.key}
                          item={item}
                          players={players}
                          effectiveViewerId={effectiveViewerId}
                          readOnly={readOnly || item.playerId === creditorId}
                          isConfirming={confirmingKey === item.key}
                          isSaving={savingKey === item.key}
                          onConfirmStart={() => setConfirmingKey(item.key)}
                          onConfirmCancel={() => setConfirmingKey(null)}
                          onMarkAsPaid={() => markAsPaid(item)}
                          onAssign={() => setAssigningKey(item.key)}
                          compact
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
  };

  return (
    <>
      {/* 1. Bandeau "Attention…" dépliable (30/10/2026) — masqué s'il n'y a
          aucun impayé dans le club. Voir le commentaire du chantier plus haut. */}
      {!allSettled && (
        <div ref={unpaidListRef} className="mb-5 scroll-mt-4">
          <button
            type="button"
            onClick={() => setUnpaidOpenChoice(!isUnpaidOpen)}
            aria-expanded={isUnpaidOpen}
            className="w-full flex items-start gap-3 p-4 rounded-2xl border bg-orange-50 border-orange-200 text-left hover:bg-orange-100/60 transition-colors"
          >
            <Icon.AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-orange-800">
                {`Attention : ${unpaidAmount.toLocaleString("fr-FR")} € sont actuellement en attente de paiement pour des matchs déjà joués (${unpaidSessionsCount} session${unpaidSessionsCount > 1 ? "s" : ""} impayée${unpaidSessionsCount > 1 ? "s" : ""}).`}
              </span>
              <span className="block text-xs font-medium text-orange-700/80 mt-1">
                {unpaidSummary}
              </span>
            </span>
            <Icon.Chevron
              className={cn(
                "w-4 h-4 text-orange-600 shrink-0 mt-1 transition-transform",
                isUnpaidOpen ? "-rotate-90" : "rotate-90"
              )}
            />
          </button>

          {isUnpaidOpen && (
            <div className="flex flex-col gap-2 mt-3">
              {myDebtGroups.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5 px-1">
                    {readOnly ? `Doit payer à ${creditorFirstName}` : "Doit me payer"}
                  </p>
                  {myDebtGroups.map(renderDebtGroup)}
                </>
              )}

              {ungroupedDebts.length > 0 && (
                <>
                  <p
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5 px-1",
                      myDebtGroups.length > 0 && "mt-2"
                    )}
                  >
                    À attribuer
                  </p>
                  {ungroupedDebts.map((item) => (
                    <DebtItemRow
                      key={item.key}
                      item={item}
                      players={players}
                      effectiveViewerId={effectiveViewerId}
                      readOnly={readOnly || item.playerId === creditorId}
                      isConfirming={confirmingKey === item.key}
                      isSaving={savingKey === item.key}
                      onConfirmStart={() => setConfirmingKey(item.key)}
                      onConfirmCancel={() => setConfirmingKey(null)}
                      onMarkAsPaid={() => markAsPaid(item)}
                      onAssign={() => setAssigningKey(item.key)}
                    />
                  ))}
                </>
              )}

              {otherDebtGroups.length > 0 && (
                <>
                  <p
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5 px-1",
                      (myDebtGroups.length > 0 || ungroupedDebts.length > 0) && "mt-2"
                    )}
                  >
                    Chez les autres créanciers
                  </p>
                  {otherDebtGroups.map(renderDebtGroup)}
                </>
              )}
            </div>
          )}
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
            onClick={() => {
              setUnpaidOpenChoice(true);
              setTimeout(
                () => unpaidListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
                0
              );
            }}
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

      {/* 2. Créance(s) de départ — une ligne compacte par abonnement où il
          figure comme créancier. Placée juste avant la synthèse (19/10/2026)
          car elle ne change jamais et sert surtout au calcul du reste net. Roulette de réglages masquée en lecture seule. */}
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Créance de départ
      </p>
      {claims.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-4 py-3 mb-5">
          <p className="pm-display text-lg font-extrabold" style={{ color: "#1F2937" }}>
            0 €
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Aucune créance enregistrée pour l'instant — elle est définie lors de la génération
            d'un abonnement, depuis l'onglet Administration.
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
                className="bg-white border border-slate-200 rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-700 leading-tight">
                    {claim.label || club?.name || "Abonnement"}
                  </span>
                  <span className="block text-[10px] text-slate-400 mt-0.5 leading-snug">
                    {[
                      club?.name,
                      periodLabel,
                      `${claim.coveredMatches} match${claim.coveredMatches > 1 ? "s" : ""} couvert${claim.coveredMatches > 1 ? "s" : ""}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span
                  className="pm-display text-lg font-extrabold shrink-0"
                  style={{ color: "#1F2937" }}
                >
                  {claim.amount.toLocaleString("fr-FR")} €
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setEditingClaim(claim)}
                    className="p-1.5 -mr-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors shrink-0"
                    title="Modifier cette créance"
                  >
                    <Icon.Settings className="w-4 h-4" />
                  </button>
                )}
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

      {/* 4bis. Versements entre créanciers (30/10/2026) — visible seulement
          s'il y en a. */}
      {transfers.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
            Versements entre créanciers
          </p>
          <div className="flex flex-col gap-2 mb-5">
            {transfers.map((t) => {
              const otherId = t.direction === "out" ? t.toId : t.fromId;
              const otherName = players.find((p) => p.id === otherId)?.name || "un créancier";
              return (
                <div
                  key={t.id || `${t.fromId}-${t.toId}-${t.at}`}
                  className="bg-white border border-slate-200 rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-700 leading-tight">
                      {t.direction === "out" ? `Versé à ${otherName}` : `Reçu de ${otherName}`}
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-0.5 leading-snug">
                      {[
                        t.at ? formatDateFR(String(t.at).slice(0, 10)) : null,
                        t.note,
                        t.abonnementLabel,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "pm-mono font-bold text-sm shrink-0",
                      t.direction === "out" ? "text-orange-600" : "text-emerald-600"
                    )}
                  >
                    {t.direction === "out" ? "−" : "+"}
                    {t.amount.toLocaleString("fr-FR")} €
                  </span>
                </div>
              );
            })}
          </div>
        </>
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
          {transfersOut > 0 && ` + Versé ${transfersOut.toLocaleString("fr-FR")} €`}
          {transfersIn > 0 && ` − Reçu ${transfersIn.toLocaleString("fr-FR")} €`}
        </p>
        {remainingNet < 0 && (
          <p className="text-[11px] text-white/90 mt-2 font-semibold">
            Montant négatif : il a encaissé plus que sa créance — la différence revient à un autre
            créancier (voir le bilan de l'abonnement).
          </p>
        )}
      </div>

      {/* 6. Consommation personnelle hors abonnement — matchs joués mais non
          financés par lui-même (aucun terrain de la session n'est le sien) :
          à régler comme n'importe quel joueur. */}
      {hasPayableMatches && (
        <>
          <button
            type="button"
            onClick={() => setShowOffSubscription((v) => !v)}
            aria-expanded={showOffSubscription}
            className="w-full flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-2xl shadow-sm px-4 py-3 mb-3 text-left hover:bg-rose-100/70 active:bg-rose-100 transition-colors"
          >
            <Icon.AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-wide text-rose-600 leading-tight">
                Hors abonnement
              </span>
              <span className="block text-[11px] text-rose-600/70 mt-0.5">
                {selfPayableMatches.length} match{selfPayableMatches.length > 1 ? "s" : ""}
              </span>
            </span>
            <span className="pm-mono font-bold text-sm text-rose-800 shrink-0">
              {selfPayableTotal.toLocaleString("fr-FR")} €
            </span>
            <Icon.Chevron
              className={cn(
                "w-4 h-4 text-rose-400 shrink-0 transition-transform",
                showOffSubscription && "rotate-90"
              )}
            />
          </button>
        </>
      )}
      {hasPayableMatches && showOffSubscription && (
        <>
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

      {/* 7. Bilans des abonnements clôturés (30/10/2026) — consultables et
          enregistrables en PDF, uniquement ceux dont il est créancier. */}
      {closedBilans.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mt-5 mb-2">
            Bilans des abonnements clôturés
          </p>
          <div className="flex flex-col gap-2">
            {closedBilans.map((a) => {
              const versions = getSavedBilans(a);
              const last = versions[versions.length - 1];
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setBilanAbonnementId(a.id)}
                  className="w-full bg-white border border-slate-200 rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3 text-left hover:border-sky-300 transition-colors"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-700 leading-tight">
                      {abonnementDisplayName(a, clubs)}
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      {versions.length} version{versions.length > 1 ? "s" : ""} · dernière le{" "}
                      {last?.createdAt ? formatDateFR(String(last.createdAt).slice(0, 10)) : "?"}
                    </span>
                  </span>
                  <Icon.Chevron className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              );
            })}
          </div>
        </>
      )}
      {bilanAbonnementId && (
        <SubscriptionBilanModal
          abonnementId={bilanAbonnementId}
          onClose={() => setBilanAbonnementId(null)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Une ligne "un impayé, un match" — extraite le 18/09/2026 pour être
// réutilisée à la fois par les impayés pas encore assignés (rendu complet :
// avatar, nom du joueur, date/lieu, et la ligne "→ Doit payer à…" si jamais
// assigné) et par le détail déplié d'une carte de groupe (`compact` :
// avatar/nom/owedTo déjà affichés une fois dans l'en-tête du groupe, cette
// ligne ne montre alors que la date/lieu/montant + les mêmes actions).
// ─────────────────────────────────────────────────────────────────────────
function DebtItemRow({
  item,
  players,
  effectiveViewerId,
  readOnly,
  isConfirming,
  isSaving,
  onConfirmStart,
  onConfirmCancel,
  onMarkAsPaid,
  onAssign,
  compact = false,
}) {
  const owedToPlayer = item.owedTo
    ? (players || []).find((p) => p.id === item.owedTo) || null
    : null;

  return (
    <div
      className={
        compact
          ? "px-3.5 py-2.5 flex flex-col gap-1.5"
          : "bg-white border border-orange-200/70 rounded-2xl p-3.5 flex flex-col gap-2"
      }
    >
      <div className="flex items-center gap-3">
        {!compact && (
          <span className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
            <Icon.AlertCircle className="w-4 h-4 text-orange-500" />
          </span>
        )}
        <span className="flex-1 min-w-0">
          {!compact && <span className="block text-sm font-semibold truncate">{item.name}</span>}
          <span
            className={cn(
              "block truncate",
              compact ? "text-xs font-semibold text-slate-600" : "text-xs text-slate-400"
            )}
          >
            {formatDateFR(item.date)}
            {item.time ? ` · ${item.time}` : ""} · {item.location}
          </span>
          {!compact && owedToPlayer && (
            <span className="block text-[11px] font-medium text-sky-700 mt-0.5 truncate">
              → Doit payer à {owedToPlayer.id === effectiveViewerId ? "moi" : owedToPlayer.name}
            </span>
          )}
        </span>
        <span className="pm-mono font-bold text-orange-600 text-sm shrink-0">
          {item.fee.toLocaleString("fr-FR")} €
        </span>
      </div>
      {!readOnly && (
        <div className={cn("flex items-center gap-1.5 flex-wrap", !compact && "pl-12")}>
          {isConfirming ? (
            <>
              <button
                type="button"
                disabled={isSaving}
                onClick={onMarkAsPaid}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {isSaving ? "…" : "Confirmer"}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={onConfirmCancel}
                className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 text-xs font-medium disabled:opacity-50"
              >
                Annuler
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onConfirmStart}
                className="shrink-0 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
              >
                Marquer payé
              </button>
              <button
                type="button"
                onClick={onAssign}
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
}
