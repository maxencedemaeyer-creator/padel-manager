// ─────────────────────────────────────────────────────────────────────────
// Détail nominatif des remboursements perçus par un créancier — utilisée
// pour les 2 colonnes cliquables du bloc "Remboursements par les autres
// joueurs" dans AccountingView.jsx (matchs passés / matchs à venir).
//
// Pensée pour rester lisible même avec des dizaines d'entrées (l'utilisateur
// a explicitement demandé que ça tienne à 80 remboursements) :
// - regroupement par joueur (avatar + total + nombre de matchs), chaque
//   groupe repliable pour éviter une liste plate interminable ;
// - triée par montant total décroissant (les plus gros contributeurs en
//   haut) ;
// - barre de recherche par nom, affichée seulement au-delà de 5 paiements
//   (inutile sur une petite liste) ;
// - modale "wide" avec corps déjà scrollable (voir components/ui).
// ─────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { cn, formatDateFR } from "../../lib/utils";
import { Modal, EmptyState } from "../ui";
import Icon from "../icons/Icon";
import { PlayerAvatar } from "../players/PlayerAvatar";

const ACCENTS = {
  emerald: { text: "text-emerald-600", bg: "bg-emerald-50/70", border: "border-emerald-200/70" },
  sky: { text: "text-sky-600", bg: "bg-sky-50/70", border: "border-sky-200/70" },
};

export function CreditorPaymentsModal({
  title,
  subtitle,
  payments,
  players,
  accent = "emerald",
  sortDir = "desc",
  onClose,
}) {
  const [query, setQuery] = useState("");
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const tone = ACCENTS[accent] || ACCENTS.emerald;

  const groups = useMemo(() => {
    const byPlayer = new Map();
    payments.forEach((p) => {
      const groupKey = p.playerId || p.name;
      if (!byPlayer.has(groupKey)) {
        byPlayer.set(groupKey, { groupKey, playerId: p.playerId, name: p.name, total: 0, items: [] });
      }
      const g = byPlayer.get(groupKey);
      g.total += p.fee;
      g.items.push(p);
    });
    const list = [...byPlayer.values()].map((g) => ({
      ...g,
      player: (players || []).find((pl) => pl.id === g.playerId) || null,
      items: [...g.items].sort((a, b) =>
        sortDir === "asc" ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date)
      ),
    }));
    list.sort((a, b) => b.total - a.total);
    const q = query.trim().toLowerCase();
    return q ? list.filter((g) => g.name.toLowerCase().includes(q)) : list;
  }, [payments, players, query, sortDir]);

  const toggle = (groupKey) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      {subtitle && <p className="text-xs text-slate-500 -mt-2 mb-1">{subtitle}</p>}

      {payments.length > 5 && (
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un joueur…"
          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100 transition-shadow"
        />
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={<Icon.Coin className="w-6 h-6" />}
          title={query ? "Aucun joueur ne correspond" : "Aucun remboursement"}
          subtitle={query ? "Essayez un autre nom." : "Rien à afficher pour l'instant."}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((g) => {
            const isOpen = openKeys.has(g.groupKey);
            return (
              <div
                key={g.groupKey}
                className={cn("rounded-2xl border bg-white overflow-hidden", tone.border)}
              >
                <button
                  type="button"
                  onClick={() => toggle(g.groupKey)}
                  className="w-full flex items-center gap-3 p-3 text-left"
                >
                  {g.player ? (
                    <PlayerAvatar player={g.player} size={34} />
                  ) : (
                    <span className="w-[34px] h-[34px] rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                      <Icon.Users className="w-4 h-4" />
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">{g.name}</span>
                    <span className="block text-xs text-slate-400">
                      {g.items.length} match{g.items.length > 1 ? "s" : ""}
                    </span>
                  </span>
                  <span className={cn("pm-mono font-bold text-sm shrink-0", tone.text)}>
                    +{g.total.toLocaleString("fr-FR")} €
                  </span>
                  <Icon.Chevron
                    className={cn(
                      "w-4 h-4 text-slate-300 shrink-0 transition-transform",
                      isOpen && "rotate-90"
                    )}
                  />
                </button>
                {isOpen && (
                  <div className={cn("border-t divide-y divide-slate-100", tone.border, tone.bg)}>
                    {g.items.map((item) => (
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
                        <span className={cn("pm-mono text-xs font-bold shrink-0", tone.text)}>
                          +{item.fee.toLocaleString("fr-FR")} €
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
