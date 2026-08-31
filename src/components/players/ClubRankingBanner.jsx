// ─────────────────────────────────────────────────────────────────────────
// Bandeau "Classement du club" — top 5 par % de victoires. Visible par
// tous, en tête de l'onglet Équipe.
// ─────────────────────────────────────────────────────────────────────────
import { computePlayerStats } from "../../lib/stats";
import { PlayerAvatar } from "./PlayerAvatar";

export function ClubRankingBanner({ players, matches }) {
  const ranked = players
    .map((p) => ({ player: p, stats: computePlayerStats(p.id, matches) }))
    .filter((r) => r.stats.wins + r.stats.losses > 0)
    .sort((a, b) => b.stats.winRate - a.stats.winRate || b.stats.wins - a.stats.wins)
    .slice(0, 5);

  if (ranked.length === 0) return null;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-700 text-white shadow-sm p-4 mb-5">
      <p className="text-sm font-semibold text-white/90 mb-3">
        🏆 Classement du club (% de victoires)
      </p>
      <div className="flex flex-col gap-2">
        {ranked.map((r, i) => (
          <div
            key={r.player.id}
            className="flex items-center gap-3 bg-white/10 rounded-xl px-3 py-2"
          >
            <span className="w-4 text-center text-sm font-bold text-white/70 shrink-0">
              {i + 1}
            </span>
            <PlayerAvatar player={r.player} size={32} />
            <span className="flex-1 min-w-0 text-sm font-semibold truncate">
              {r.player.name}
            </span>
            <span className="text-xs text-white/70 shrink-0">
              {r.stats.wins}V-{r.stats.losses}D
            </span>
            <span className="pm-mono font-bold text-sm shrink-0 w-11 text-right">
              {r.stats.winRate}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
