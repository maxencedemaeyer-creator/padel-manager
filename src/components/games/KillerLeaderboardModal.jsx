// ─────────────────────────────────────────────────────────────────────────
// Fun Center — Jeu "Killer" : petite fenêtre pop-up affichant le classement
// cumulé de tous les joueurs de l'effectif. Calcul dans
// src/lib/killer.js → fetchKillerLeaderboard.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { fetchKillerLeaderboard } from "../../lib/killer";
import { getFirstName } from "../../lib/utils";
import { PlayerAvatar } from "../players/PlayerAvatar";
import { Modal, Spinner } from "../ui";

export function KillerLeaderboardModal({ onClose, players }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchKillerLeaderboard(players).then((result) => {
      if (!cancelled) setRows(result);
    });
    return () => {
      cancelled = true;
    };
  }, [players]);

  return (
    <Modal title="Classement Killer 🏆" onClose={onClose}>
      {rows === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-dim)] text-center py-6">
          Aucun classement pour le moment.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div
              key={row.player.id}
              className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-white/70 border border-white/60"
            >
              <span className="w-5 text-center text-xs font-bold text-[var(--color-text-faint)]">
                {i + 1}
              </span>
              <PlayerAvatar player={row.player} size={32} />
              <span className="flex-1 text-sm font-semibold text-[var(--color-text)] truncate">
                {getFirstName(row.player.name)}
              </span>
              <span className="text-[10px] text-[var(--color-text-faint)] text-right leading-tight">
                {row.participations} partie{row.participations > 1 ? "s" : ""}
                <br />
                {row.successes} réussie{row.successes > 1 ? "s" : ""}
              </span>
              <span className="pm-mono font-bold text-sm text-[var(--color-lime)] w-12 text-right shrink-0">
                {row.points} pt{row.points > 1 ? "s" : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
