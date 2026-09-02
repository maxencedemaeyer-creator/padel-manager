// ─────────────────────────────────────────────────────────────────────────
// Onglet "Administration" — KPIs du club, soldes des créanciers (éditables),
// gestion des clubs, génération d'abonnements.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { formatClaimPeriodLabel } from "../lib/utils";
import { getMatchTiming } from "../lib/matchLogic";
import { getCreditorAccounting, getCreditorClaims } from "../lib/stats";
import { useAppData } from "../context/AppContext";
import Icon from "../components/icons/Icon";
import { Card, Button, EmptyState, Switch } from "../components/ui";
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

export function AdminView() {
  const { players, matches, abonnements, clubs, gameCenterEnabled, maintenanceEnabled } =
    useAppData();
  const [showCreateSeason, setShowCreateSeason] = useState(false);
  const [showManageClubs, setShowManageClubs] = useState(false);
  // Créance en cours d'édition — { creditorId, creditorName, abonnement }.
  // Même modale que celle utilisée par le créancier lui-même depuis "Ma
  // comptabilité", pour que les deux parcours restent parfaitement cohérents.
  const [editingClaim, setEditingClaim] = useState(null);
  const creditors = players.filter((p) => p.isCreditor);
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
  const unpaidCount = matches
    .filter((m) => m.type === "Saison")
    .reduce(
      (sum, m) =>
        sum + (m.participants || []).filter((p) => p.paidStatus !== "paid").length,
      0
    );

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
