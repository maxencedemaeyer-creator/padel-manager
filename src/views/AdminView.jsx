// ─────────────────────────────────────────────────────────────────────────
// Onglet "Administration" — KPIs du club, soldes des créanciers (éditables),
// gestion des clubs, génération d'abonnements.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { doc, deleteDoc, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { cn, formatClaimPeriodLabel } from "../lib/utils";
import { getMatchTiming, groupMatchesBySession, getSessionCreditorIds } from "../lib/matchLogic";
import {
  getCreditorAccounting,
  getCreditorClaims,
  getAllCreditorPlayerIds,
  participantsOf,
} from "../lib/stats";
import { useAppData } from "../context/AppContext";
import Icon from "../components/icons/Icon";
import { Card, Button, EmptyState, Switch, Modal } from "../components/ui";
import { CreateSeasonModal } from "../components/matches/CreateSeasonModal";
import { ClaimSettingsModal } from "../components/accounting/ClaimSettingsModal";
import { ManageClubsModal } from "../components/clubs/ManageClubsModal";
import { PlayerAvatar } from "../components/players/PlayerAvatar";

// Carte "Game Center" — interrupteur pour rendre l'onglet accessible à tous
// les joueurs (par défaut, réservé à l'admin). Écrit directement dans
// settings/appConfig ; le changement est répercuté partout en temps réel
// via useAppSettings (voir src/hooks/useFirestoreData.js).
function GameCenterSettingCard({ enabled }) {
  const [saving, setSaving] = useState(false);

  const toggle = async (next) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "appConfig"), { gameCenterEnabled: next }, { merge: true });
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 flex items-center gap-3 mb-6">
      <span className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--color-lime)]/15 text-[var(--color-lime)] shrink-0">
        <Icon.Gamepad className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Game Center</p>
        <p className="text-[11px] text-[var(--color-text-dim)] mt-0.5">
          {enabled
            ? "Visible par tous les joueurs."
            : "Réservé à l'administrateur pour le moment."}
        </p>
      </div>
      <Switch checked={enabled} onChange={toggle} disabled={saving} />
    </Card>
  );
}

// Carte "Mode Maintenance" — interrupteur pour couper l'accès au site à
// tous les joueurs (l'administrateur, lui, garde toujours l'accès complet,
// justement pour pouvoir désactiver la maintenance depuis ce même écran).
// Même mécanique que le Game Center ci-dessus : écrit dans
// settings/appConfig, répercuté en temps réel partout via useAppSettings.
function MaintenanceSettingCard({ enabled }) {
  const [saving, setSaving] = useState(false);

  const toggle = async (next) => {
    if (next) {
      const sure = window.confirm(
        "Activer le mode maintenance ? Tous les joueurs (sauf vous, l'administrateur) seront bloqués sur un écran d'attente jusqu'à ce que vous le désactiviez."
      );
      if (!sure) return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "appConfig"), { maintenanceEnabled: next }, { merge: true });
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      className={`p-4 flex items-center gap-3 mb-6 ${
        enabled ? "border-rose-300 bg-rose-50/70" : ""
      }`}
    >
      <span
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          enabled
            ? "bg-rose-500/15 text-rose-600"
            : "bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]"
        }`}
      >
        <Icon.AlertCircle className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Mode maintenance</p>
        <p className="text-[11px] text-[var(--color-text-dim)] mt-0.5">
          {enabled
            ? "Site bloqué pour tous les joueurs, sauf vous (admin)."
            : "Site accessible normalement à tous."}
        </p>
      </div>
      <Switch checked={enabled} onChange={toggle} disabled={saving} />
    </Card>
  );
}

// Ajout du 02/09/2026 (soir) — gestion des abonnements créés par erreur (ex.
// tests de limites) ou arrivés à leur terme. Deux actions distinctes, bien
// séparées pour ne jamais les confondre :
// - "Clôturer" / "Réactiver" : archive l'abonnement (champ `archived` sur le
//   document) — masque UNIQUEMENT ses matchs dans l'onglet Matchs (voir
//   excludeArchivedSeasonMatches, lib/matchLogic.js). Rien n'est supprimé :
//   Stats, Comptabilité et cette page continuent de tout calculer
//   normalement dessus, et réactiver fait immédiatement réapparaître les
//   matchs. Bloqué tant qu'il reste un match NON terminé dans l'abonnement
//   (sinon un match à venir déjà payé d'avance disparaîtrait de "Prochains
//   matchs" pour les joueurs) — pas de garde-fou sur les impayés en
//   revanche : un message d'avertissement s'affiche mais n'empêche pas de
//   clôturer quand même (choix de Max, cas du joueur qui ne réglera jamais).
// - "Supprimer" : suppression DÉFINITIVE et en cascade de l'abonnement ET de
//   TOUS ses matchs (joueurs assignés, scores, présences, paiements
//   compris) — pour corriger un abonnement généré par erreur. Avertit
//   explicitement et exige une confirmation supplémentaire si de l'argent
//   réel (paiements déjà confirmés) est en jeu.
function AbonnementManagementSection({ abonnements, matches, players, clubs }) {
  const [tab, setTab] = useState("active"); // "active" | "archived"
  const [deleteTarget, setDeleteTarget] = useState(null); // info d'un abonnement, ou null
  const [busyId, setBusyId] = useState(null);

  const sessionGroups = groupMatchesBySession(matches);
  const fallbackCreditorIds = new Set(players.filter((p) => p.isCreditor).map((p) => p.id));

  const withInfo = (abonnements || []).map((a) => {
    const related = matches.filter((m) => m.abonnementId === a.id);
    const finishedMatches = related.filter((m) => getMatchTiming(m) === "finished");
    const unfinishedCount = related.length - finishedMatches.length;
    const unpaidAmount = finishedMatches.reduce((sum, m) => {
      const sessionCreditorIds =
        getSessionCreditorIds(m, matches, sessionGroups) || fallbackCreditorIds;
      const unpaidCount = participantsOf(m).filter(
        (p) => !sessionCreditorIds.has(p.playerId) && p.paidStatus !== "paid"
      ).length;
      return sum + unpaidCount * (m.matchFeePerPlayer || 0);
    }, 0);
    const paidAmount = related.reduce((sum, m) => {
      const paidCount = participantsOf(m).filter((p) => p.paidStatus === "paid").length;
      return sum + paidCount * (m.matchFeePerPlayer || 0);
    }, 0);
    const club = clubs.find((c) => c.id === a.clubId);
    const creditorNames = (a.creditors || [])
      .map((c) => players.find((p) => p.id === c.playerId)?.name)
      .filter(Boolean);
    return {
      abonnement: a,
      relatedMatchIds: related.map((m) => m.id),
      matchCount: related.length,
      unfinishedCount,
      unpaidAmount,
      paidAmount,
      club,
      creditorNames,
    };
  });

  const activeList = withInfo.filter((x) => !x.abonnement.archived);
  const archivedList = withInfo.filter((x) => x.abonnement.archived);
  const visibleList = tab === "active" ? activeList : archivedList;

  const toggleArchive = async (info) => {
    const willArchive = !info.abonnement.archived;
    if (willArchive && info.unfinishedCount > 0) return; // bouton normalement désactivé, garde-fou
    const sure = window.confirm(
      willArchive
        ? `Clôturer cet abonnement ? Ses ${info.matchCount} match${info.matchCount > 1 ? "s" : ""} seront masqués de l'onglet Matchs pour tout le monde. Rien n'est supprimé — vous pourrez réactiver l'abonnement à tout moment.`
        : `Réactiver cet abonnement ? Ses ${info.matchCount} match${info.matchCount > 1 ? "s" : ""} redeviendront visibles dans l'onglet Matchs.`
    );
    if (!sure) return;
    setBusyId(info.abonnement.id);
    try {
      await updateDoc(doc(db, "abonnements", info.abonnement.id), { archived: willArchive });
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-1 mt-8">
        <h3 className="font-semibold text-sm text-white">Gestion des abonnements</h3>
      </div>
      <p className="text-[11px] text-[var(--color-text-faint)] mb-3">
        Clôturez un abonnement terminé et déjà réglé pour ranger ses matchs (rien n'est perdu), ou
        supprimez définitivement un abonnement créé par erreur (et tous ses matchs avec).
      </p>

      <div className="flex bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full p-1 w-fit mb-3">
        {[
          ["active", `Actifs (${activeList.length})`],
          ["archived", `Archivés (${archivedList.length})`],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
              tab === id ? "bg-sky-200 text-sky-900" : "text-[var(--color-text-dim)]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {visibleList.length === 0 ? (
        <EmptyState
          icon={<Icon.Calendar className="w-6 h-6" />}
          title={tab === "active" ? "Aucun abonnement actif" : "Aucun abonnement archivé"}
          subtitle={
            tab === "active"
              ? "Générez-en un avec le bouton « Créer un abonnement » en haut de page."
              : "Les abonnements clôturés apparaîtront ici."
          }
        />
      ) : (
        <div className="flex flex-col gap-2 mb-6">
          {visibleList.map((info) => {
            const { abonnement: a } = info;
            const busy = busyId === a.id;
            return (
              <Card key={a.id} className="p-4 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {a.label || info.club?.name || "Abonnement"}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-faint)] mt-0.5">
                      {[
                        info.club?.name,
                        (a.courts || []).length > 0 &&
                          `Terrain${a.courts.length > 1 ? "s" : ""} ${a.courts.join(", ")}`,
                        formatClaimPeriodLabel(a.startDate, a.endDate),
                        `${info.matchCount} match${info.matchCount > 1 ? "s" : ""}`,
                      ]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-faint)] mt-0.5">
                      {info.creditorNames.length > 0
                        ? `Créancier${info.creditorNames.length > 1 ? "s" : ""} : ${info.creditorNames.join(", ")}`
                        : "Aucun créancier"}
                    </p>
                  </div>
                </div>

                {tab === "active" && info.unpaidAmount > 0 && (
                  <p className="text-[11px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5">
                    ⚠️ {info.unpaidAmount.toLocaleString("fr-FR")} € encore en attente de paiement
                    sur des matchs terminés.
                  </p>
                )}
                {tab === "active" && info.unfinishedCount > 0 && (
                  <p className="text-[11px] text-[var(--color-text-faint)]">
                    Clôture indisponible : {info.unfinishedCount} match
                    {info.unfinishedCount > 1 ? "s" : ""} pas encore terminé
                    {info.unfinishedCount > 1 ? "s" : ""}.
                  </p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="secondary"
                    className="!py-1.5 !px-3 !text-xs"
                    disabled={busy || (tab === "active" && info.unfinishedCount > 0)}
                    onClick={() => toggleArchive(info)}
                  >
                    {tab === "active" ? "Clôturer" : "Réactiver"}
                  </Button>
                  <Button
                    variant="danger"
                    className="!py-1.5 !px-3 !text-xs"
                    disabled={busy}
                    onClick={() => setDeleteTarget(info)}
                  >
                    Supprimer
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {deleteTarget && (
        <DeleteAbonnementConfirmModal info={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
    </>
  );
}

// Suppression en cascade — l'abonnement ET tous ses matchs. Les suppressions
// de matchs partent par lots de 450 (marge sous la limite Firestore de 500
// opérations par batch), suivies de la suppression du document abonnement
// lui-même. Si de l'argent réel est en jeu (paiements déjà confirmés sur au
// moins un des matchs), une case à cocher supplémentaire est exigée avant de
// pouvoir confirmer — pour qu'une perte d'historique de paiement soit
// toujours un choix délibéré, jamais un clic accidentel.
function DeleteAbonnementConfirmModal({ info, onClose }) {
  const { abonnement, matchCount, paidAmount, relatedMatchIds } = info;
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const claimsTotal = (abonnement.creditors || []).reduce(
    (s, c) => s + (c.advancedAmount || 0),
    0
  );
  const canDelete = paidAmount === 0 || confirmed;

  const doDelete = async () => {
    setDeleting(true);
    try {
      for (let i = 0; i < relatedMatchIds.length; i += 450) {
        const chunk = relatedMatchIds.slice(i, i + 450);
        const batch = writeBatch(db);
        chunk.forEach((id) => batch.delete(doc(db, "matches", id)));
        await batch.commit();
      }
      await deleteDoc(doc(db, "abonnements", abonnement.id));
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
      setDeleting(false);
    }
  };

  return (
    <Modal
      title="Supprimer cet abonnement ?"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Annuler
          </Button>
          <Button variant="danger" onClick={doDelete} disabled={!canDelete || deleting}>
            {deleting ? "Suppression..." : "Supprimer définitivement"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-text-dim)]">
        Cette action est irréversible. {matchCount} match{matchCount > 1 ? "s" : ""}
        {abonnement.label ? ` de « ${abonnement.label} »` : ""} seront définitivement supprimés
        (joueurs assignés, scores, présences et historique de paiement compris), ainsi que
        l'abonnement lui-même
        {claimsTotal > 0
          ? ` et sa créance de départ (${claimsTotal.toLocaleString("fr-FR")} €)`
          : ""}
        .
      </p>
      {paidAmount > 0 && (
        <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
          <p className="font-semibold mb-1.5">
            ⚠️ {paidAmount.toLocaleString("fr-FR")} € de paiements déjà confirmés seront perdus.
          </p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-3.5 h-3.5 accent-rose-600 shrink-0"
            />
            <span>Je comprends que ces paiements confirmés seront définitivement effacés.</span>
          </label>
        </div>
      )}
    </Modal>
  );
}

export function AdminView() {
  const { players, matches, abonnements, clubs, gameCenterEnabled, maintenanceEnabled } =
    useAppData();
  const [showCreateSeason, setShowCreateSeason] = useState(false);
  const [showManageClubs, setShowManageClubs] = useState(false);
  // Créance en cours d'édition — { creditorId, creditorName, abonnement }.
  // Même modale que celle utilisée par le créancier lui-même depuis "Ma
  // comptabilité", pour que les deux parcours restent parfaitement cohérents.
  const [editingClaim, setEditingClaim] = useState(null);
  // Corrigé le 02/09/2026 (audit paiements) : inclut aussi un joueur dont la
  // case "Créancier" a depuis été décochée mais qui a réellement financé un
  // abonnement (présent dans `abonnement.creditors[]`) — sinon il disparaît
  // à tort de cette liste alors qu'il a encore un solde/une créance réels.
  const creditorIds = getAllCreditorPlayerIds(players, abonnements);
  const creditors = players.filter((p) => creditorIds.has(p.id));
  // Solde = uniquement le total réellement perçu via les matchs, calculé
  // automatiquement. Le concept d'"ajustement manuel" a été retiré de toute
  // l'app le 30/08/2026 (jugé pas instinctif, source de confusion) — toute
  // correction passe désormais uniquement par "Marquer payé" sur le match
  // concerné, depuis "Ma comptabilité" ou l'onglet Matchs.
  const creditorRawTotals = new Map(
    creditors.map((c) => [c.id, getCreditorAccounting(c.id, matches).totalPaidAllTime])
  );
  const totalBalance = [...creditorRawTotals.values()].reduce((s, v) => s + v, 0);
  const upcomingCount = matches.filter((m) => getMatchTiming(m) !== "finished").length;
  // Corrigé le 02/09/2026 (audit paiements) : ce chiffre comptait TOUS les
  // participants non "paid" de TOUS les matchs "Saison", y compris les
  // matchs pas encore joués (rien à payer avant qu'ils aient lieu) et les
  // places couvertes par un créancier de la session (voir
  // `getSessionCreditorIds`) — celles-ci ne passent jamais par "Marquer
  // payé" (le bouton y est désactivé), donc `paidStatus` y reste "unpaid"
  // pour toujours et gonflait ce compteur en continu, sans rapport avec de
  // vrais impayés. Même filtre que le détail nominatif de "Ma comptabilité"
  // (AccountingView.jsx → unpaidPast), pour rester cohérent avec ce que
  // chaque créancier y voit.
  const fallbackCreditorIds = new Set(players.filter((p) => p.isCreditor).map((p) => p.id));
  const sessionGroups = groupMatchesBySession(matches);
  const unpaidCount = matches
    .filter((m) => m.type === "Saison" && getMatchTiming(m) === "finished")
    .reduce((sum, m) => {
      const sessionCreditorIds =
        getSessionCreditorIds(m, matches, sessionGroups) || fallbackCreditorIds;
      return (
        sum +
        participantsOf(m).filter(
          (p) => !sessionCreditorIds.has(p.playerId) && p.paidStatus !== "paid"
        ).length
      );
    }, 0);

  const stats = [
    { label: "Joueurs", value: players.length, icon: Icon.Users },
    { label: "Créanciers", value: creditors.length, icon: Icon.Shield },
    { label: "Matchs à venir", value: upcomingCount, icon: Icon.Calendar },
    { label: "Paiements en attente", value: unpaidCount, icon: Icon.Coin },
  ];

  return (
    <div className="px-4 pt-4 pb-28">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="pm-display font-bold text-xl text-white">Administration</h2>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            className="!py-2 !px-3"
            onClick={() => setShowManageClubs(true)}
          >
            <span className="flex items-center gap-1.5">
              <Icon.Shield className="w-4 h-4" /> Clubs
            </span>
          </Button>
          <Button
            variant="secondary"
            className="!py-2 !px-3"
            onClick={() => setShowCreateSeason(true)}
          >
            <span className="flex items-center gap-1.5">
              <Icon.Calendar className="w-4 h-4" /> Créer un abonnement
            </span>
          </Button>
        </div>
      </div>

      <MaintenanceSettingCard enabled={maintenanceEnabled} />
      <GameCenterSettingCard enabled={gameCenterEnabled} />

      <div className="grid grid-cols-2 gap-3 mb-6">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <s.icon className="w-4 h-4 text-[var(--color-lime)] mb-2" />
            <p className="pm-display text-2xl font-extrabold">{s.value}</p>
            <p className="text-xs text-[var(--color-text-dim)]">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm text-white">
          Soldes des créanciers
        </h3>
        <span className="pm-mono text-sm font-bold text-white">
          Total : {totalBalance.toLocaleString("fr-FR")} €
        </span>
      </div>
      <p className="text-[11px] text-[var(--color-text-faint)] mb-3">
        « Créance de départ » = investissement initial, défini par abonnement lors de sa
        génération (un créancier peut cumuler plusieurs abonnements). « Solde » = total perçu via
        les matchs, calculé automatiquement.
      </p>

      {creditors.length === 0 ? (
        <EmptyState
          icon={<Icon.Coin className="w-6 h-6" />}
          title="Aucun créancier configuré"
          subtitle="Un joueur devient créancier automatiquement en étant sélectionné à la génération d'un abonnement, ou manuellement depuis l'onglet Joueurs."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {[...creditors]
            .sort((a, b) => (creditorRawTotals.get(b.id) || 0) - (creditorRawTotals.get(a.id) || 0))
            .map((c) => {
              const { claims, total } = getCreditorClaims(c.id, abonnements, matches);

              return (
                <Card key={c.id} className="p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <PlayerAvatar player={c} size={40} />
                    <span className="flex-1 font-semibold text-sm">{c.name}</span>
                  </div>

                  <div className="pl-[52px] flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--color-text-dim)]">
                        Créance de départ
                        {claims.length > 1 ? ` (${claims.length} abonnements)` : ""}
                      </span>
                      <span className="pm-mono text-sm font-bold text-sky-600">
                        {total.toLocaleString("fr-FR")} €
                      </span>
                    </div>
                    {claims.length === 0 ? (
                      <p className="text-[10px] text-[var(--color-text-faint)]">
                        Pas encore associé à un abonnement.
                      </p>
                    ) : (
                      claims.map((claim) => {
                        const club = clubs.find((cl) => cl.id === claim.clubId);
                        const periodLabel = formatClaimPeriodLabel(claim.startDate, claim.endDate);
                        return (
                          <div
                            key={claim.abonnementId}
                            className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[var(--color-surface-2)]"
                          >
                            <span className="text-[10px] text-[var(--color-text-faint)] min-w-0 truncate">
                              {[
                                claim.label || club?.name,
                                periodLabel,
                                `${claim.coveredMatches} match${claim.coveredMatches > 1 ? "s" : ""}`,
                              ]
                                .filter(Boolean)
                                .join("  ·  ")}
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              <span className="pm-mono text-xs font-bold">
                                {claim.amount.toLocaleString("fr-FR")} €
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingClaim({
                                    creditorId: c.id,
                                    creditorName: c.name,
                                    abonnement: abonnements.find((a) => a.id === claim.abonnementId),
                                  })
                                }
                                className="p-1 -m-1 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-lime)] transition-colors"
                                title="Modifier cette créance"
                              >
                                <Icon.Settings className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="flex items-center justify-between pl-[52px]">
                    <span className="text-xs text-[var(--color-text-dim)]">
                      Solde (perçu via les matchs)
                    </span>
                    <span className="pm-mono text-sm font-bold text-[var(--color-lime)]">
                      {(creditorRawTotals.get(c.id) || 0).toLocaleString("fr-FR")} €
                    </span>
                  </div>
                </Card>
              );
            })}
        </div>
      )}

      <AbonnementManagementSection
        abonnements={abonnements}
        matches={matches}
        players={players}
        clubs={clubs}
      />

      {showCreateSeason && (
        <CreateSeasonModal onClose={() => setShowCreateSeason(false)} />
      )}
      {showManageClubs && <ManageClubsModal onClose={() => setShowManageClubs(false)} />}
      {editingClaim && (
        <ClaimSettingsModal
          creditorId={editingClaim.creditorId}
          creditorName={editingClaim.creditorName}
          abonnement={editingClaim.abonnement}
          onClose={() => setEditingClaim(null)}
        />
      )}
    </div>
  );
}
