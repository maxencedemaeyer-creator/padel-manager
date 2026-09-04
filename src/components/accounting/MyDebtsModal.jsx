// ─────────────────────────────────────────────────────────────────────────
// Détail nominatif de "Ce que je dois" — le miroir "dette" de
// MyPaymentsModal (côté payeur). Affichée depuis "Mon profil"
// (StatsView.jsx), uniquement quand le joueur a au moins un match déjà joué
// pas encore réglé de son côté (voir getPlayerDebts dans lib/stats.js).
//
// Quand aucun créancier n'a encore explicitement pris la dette (voir
// AssignCreditorModal.jsx / lib/stats.js → champ `owedTo`), chaque ligne
// peut avoir PLUSIEURS créanciers possibles (voir "remboursement croisé"
// dans accounting-module-notes.md) : le joueur peut régler auprès de
// n'importe quel créancier de la session de ce match — on affiche alors la
// liste complète plutôt qu'un nom unique.
//
// Dès qu'un créancier a cliqué "Doit payer à…" sur cette dette précise,
// `owedTo` porte son id : on remplace la liste ambiguë par une ligne unique
// et claire "À régler à : [Nom]", pour que le joueur sache enfin exactement
// à qui rembourser (demande de Max du 04/09/2026).
// ─────────────────────────────────────────────────────────────────────────
import { formatDateFR } from "../../lib/utils";
import { Modal, EmptyState } from "../ui";
import Icon from "../icons/Icon";
import { PlayerAvatar } from "../players/PlayerAvatar";

export function MyDebtsModal({ debts, players, onClose }) {
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
          {debts.map((item) => {
            const owedToPlayer = item.owedTo
              ? (players || []).find((p) => p.id === item.owedTo) || null
              : null;
            const creditors = (item.creditorIds || []).map((id) => ({
              id,
              player: (players || []).find((p) => p.id === id) || null,
            }));
            return (
              <div
                key={item.key}
                className={
                  owedToPlayer
                    ? "flex flex-col gap-2 p-3.5 rounded-2xl bg-white border border-sky-200/70"
                    : "flex flex-col gap-2 p-3.5 rounded-2xl bg-white border border-orange-200/70"
                }
              >
                <div className="flex items-center gap-3">
                  <span
                    className={
                      owedToPlayer
                        ? "w-9 h-9 rounded-full bg-sky-50 flex items-center justify-center shrink-0"
                        : "w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0"
                    }
                  >
                    <Icon.AlertCircle
                      className={owedToPlayer ? "w-4 h-4 text-sky-500" : "w-4 h-4 text-orange-500"}
                    />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">
                      {formatDateFR(item.date)}
                      {item.time ? ` · ${item.time}` : ""}
                    </span>
                    <span className="block text-xs text-slate-400 truncate">{item.location}</span>
                  </span>
                  <span
                    className={
                      owedToPlayer
                        ? "pm-mono font-bold text-sky-600 text-sm shrink-0"
                        : "pm-mono font-bold text-orange-600 text-sm shrink-0"
                    }
                  >
                    {item.fee.toLocaleString("fr-FR")} €
                  </span>
                </div>
                {owedToPlayer ? (
                  <div className="flex items-center gap-1.5 pl-12">
                    <span className="text-[11px] text-slate-400">À régler à :</span>
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-sky-50 border border-sky-200">
                      <PlayerAvatar player={owedToPlayer} size={16} />
                      <span className="text-[11px] font-semibold text-sky-700">
                        {owedToPlayer.name}
                      </span>
                    </span>
                  </div>
                ) : (
                  creditors.length > 0 && (
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
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
