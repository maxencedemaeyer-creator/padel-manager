// ─────────────────────────────────────────────────────────────────────────
// Onglet "Administration" — KPIs du club, soldes des créanciers (éditables).
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { formatClaimPeriodLabel } from "../lib/utils";
import { getMatchTiming } from "../lib/matchLogic";
import { getCreditorAccounting, getCoveredMatchesEstimate } from "../lib/stats";
import { useAppData } from "../context/AppContext";
import Icon from "../components/icons/Icon";
import { Card, Button, EmptyState } from "../components/ui";
import { CreateSeasonModal } from "../components/matches/CreateSeasonModal";
import { ClaimSettingsModal } from "../components/accounting/ClaimSettingsModal";
import { PlayerAvatar } from "../components/players/PlayerAvatar";

export function AdminView() {
  const { players, matches } = useAppData();
  const [showCreateSeason, setShowCreateSeason] = useState(false);
  // Créance de départ en cours d'édition (dates, montant, terrains) — même
  // modale que celle utilisée par le créancier lui-même depuis "Ma
  // comptabilité", pour que les deux parcours restent parfaitement cohérents.
  const [editingCreditor, setEditingCreditor] = useState(null);
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="pm-display font-bold text-xl text-white">Administration</h2>
        <Button
          variant="secondary"
          className="!py-2 !px-3"
          onClick={() => setShowCreateSeason(true)}
        >
          <span className="flex items-center gap-1.5">
            <Icon.Calendar className="w-4 h-4" /> Créer une saison
          </span>
        </Button>
      </div>

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
        « Créance de départ » = investissement initial (visible dans l'onglet
        Compta du créancier). « Solde » = total perçu via les matchs,
        calculé automatiquement.
      </p>

      {creditors.length === 0 ? (
        <EmptyState
          icon={<Icon.Coin className="w-6 h-6" />}
          title="Aucun créancier configuré"
          subtitle="Activez l'option « Créancier » sur un joueur depuis l'onglet Joueurs pour qu'il puisse recevoir des paiements."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {[...creditors]
            .sort((a, b) => (creditorRawTotals.get(b.id) || 0) - (creditorRawTotals.get(a.id) || 0))
            .map((c) => {
              const claimPeriodLabel = formatClaimPeriodLabel(
                c.advancedAmountPeriodStart,
                c.advancedAmountPeriodEnd
              );
              const claimCourts = c.advancedAmountCourts;
              const coveredMatches = getCoveredMatchesEstimate(c, matches);
              const hasClaimDetails = Boolean(claimPeriodLabel) || claimCourts != null;

              return (
                <Card key={c.id} className="p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <PlayerAvatar player={c} size={40} />
                    <span className="flex-1 font-semibold text-sm">{c.name}</span>
                  </div>

                  <div className="pl-[52px]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--color-text-dim)]">
                        Créance de départ
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="pm-mono text-sm font-bold text-sky-600">
                          {(c.advancedAmount || 0).toLocaleString("fr-FR")} €
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingCreditor(c)}
                          className="p-1 -m-1 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-lime)] transition-colors"
                          title="Modifier la créance de départ"
                        >
                          <Icon.Settings className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {hasClaimDetails && (
                      <p className="text-[10px] text-[var(--color-text-faint)] mt-0.5">
                        {[
                          claimPeriodLabel,
                          claimCourts != null &&
                            `${claimCourts} terrain${claimCourts > 1 ? "s" : ""}`,
                          coveredMatches != null && `≈ ${coveredMatches} match${coveredMatches > 1 ? "s" : ""}`,
                        ]
                          .filter(Boolean)
                          .join("  ·  ")}
                      </p>
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
      {editingCreditor && (
        <ClaimSettingsModal
          creditor={editingCreditor}
          onClose={() => setEditingCreditor(null)}
        />
      )}
    </div>
  );
}
