// ─────────────────────────────────────────────────────────────────────────
// Détail nominatif de "Ce que je dois" — le miroir "dette" de
// MyPaymentsModal (côté payeur). Affichée depuis "Mon profil"
// (StatsView.jsx), uniquement quand le joueur a au moins un match déjà joué
// pas encore réglé de son côté (voir getPlayerDebts dans lib/stats.js).
//
// Chantier du 18/09/2026 — recap cumulé par créancier : quand plusieurs
// dettes ont été explicitement assignées (voir AssignCreditorModal.jsx /
// "Doit payer à…") au MÊME créancier, elles sont désormais regroupées en une
// seule carte "Vous devez à [Nom] : N matchs · X €" (au lieu d'une carte par
// match) — voir groupDebtsByCreditor dans lib/stats.js. Le détail match par
// match (date/heure/lieu) reste disponible en dépliant la carte.
//
// Les dettes PAS ENCORE assignées restent affichées à l'unité, sous "En
// attente d'attribution" : plusieurs créanciers de la session peuvent
// potentiellement les récupérer (remboursement croisé, voir
// accounting-module-notes.md), donc impossible de les cumuler sous un nom
// précis tant que ce choix n'a pas été fait — chaque ligne affiche toujours
// la liste complète des créanciers possibles, comme avant ce chantier.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { groupDebtsByCreditor } from "../../lib/stats";
import { cn, formatDateFR } from "../../lib/utils";
import { Modal, EmptyState } from "../ui";
import Icon from "../icons/Icon";
import { PlayerAvatar } from "../players/PlayerAvatar";

export function MyDebtsModal({ debts, players, onClose }) {
  const { groups, ungrouped } = groupDebtsByCreditor(debts);
  const [openKeys, setOpenKeys] = useState(() => new Set());

  const toggle = (groupKey) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  return (
    <Modal title="Ce que je dois" onClose={onClose} wide>
      {debts.length === 0 ? (
        <EmptyState
          icon={<Icon.CheckCircle className="w-6 h-6" />}
          title="Rien à régler"
          subtitle="Tous vos matchs joués sont réglés."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((group) => {
            const creditor = (players || []).find((p) => p.id === group.creditorId) || null;
            const isOpen = openKeys.has(group.groupKey);
            return (
              <div
                key={group.groupKey}
                className="rounded-2xl border border-sky-200/70 bg-white overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggle(group.groupKey)}
                  className="w-full flex items-center gap-3 p-3.5 text-left"
                >
                  {creditor ? (
                    <PlayerAvatar player={creditor} size={36} />
                  ) : (
                    <span className="w-9 h-9 rounded-full bg-sky-50 flex items-center justify-center shrink-0">
                      <Icon.AlertCircle className="w-4 h-4 text-sky-500" />
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">
                      Vous devez à {creditor?.name || "Créancier inconnu"}
                    </span>
                    <span className="block text-xs text-slate-400">
                      {group.count} match{group.count > 1 ? "s" : ""} non réglé
                      {group.count > 1 ? "s" : ""}
                    </span>
                  </span>
                  <span className="pm-mono font-bold text-sky-600 text-sm shrink-0">
                    {group.total.toLocaleString("fr-FR")} €
                  </span>
                  <Icon.Chevron
                    className={cn(
                      "w-4 h-4 text-slate-300 shrink-0 transition-transform",
                      isOpen && "rotate-90"
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-sky-100 divide-y divide-slate-100 bg-sky-50/40">
                    {group.items.map((item) => (
                      <div key={item.key} className="flex items-center gap-3 px-3.5 py-2.5">
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-semibold text-slate-600 truncate">
                            {formatDateFR(item.date)}
                            {item.time ? ` · ${item.time}` : ""}
                          </span>
                          <span className="block text-[11px] text-slate-400 truncate">
                            {item.location}
                          </span>
                        </span>
                        <span className="pm-mono text-xs font-bold text-sky-600 shrink-0">
                          {item.fee.toLocaleString("fr-FR")} €
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {ungrouped.length > 0 && (
            <>
              {groups.length > 0 && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mt-2 mb-0.5 px-1">
                  En attente d'attribution
                </p>
              )}
              {ungrouped.map((item) => {
                const creditors = (item.creditorIds || []).map((id) => ({
                  id,
                  player: (players || []).find((p) => p.id === id) || null,
                }));
                return (
                  <div
                    key={item.key}
                    className="flex flex-col gap-2 p-3.5 rounded-2xl bg-white border border-orange-200/70"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                        <Icon.AlertCircle className="w-4 h-4 text-orange-500" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold truncate">
                          {formatDateFR(item.date)}
                          {item.time ? ` · ${item.time}` : ""}
                        </span>
                        <span className="block text-xs text-slate-400 truncate">
                          {item.location}
                        </span>
                      </span>
                      <span className="pm-mono font-bold text-orange-600 text-sm shrink-0">
                        {item.fee.toLocaleString("fr-FR")} €
                      </span>
                    </div>
                    {creditors.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pl-12">
                        <span className="text-[11px] text-slate-400">À régler auprès de :</span>
                        {creditors.map(({ id, player }) => (
                          <span
                            key={id}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-50 border border-slate-200"
                          >
                            {player && <PlayerAvatar player={player} size={16} />}
                            <span className="text-[11px] font-medium text-slate-600">
                              {player?.name || "Créancier inconnu"}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
