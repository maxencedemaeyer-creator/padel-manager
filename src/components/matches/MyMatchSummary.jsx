// ─────────────────────────────────────────────────────────────────────────
// Bandeau personnel en tête de l'onglet Matchs : prochain match perso,
// rappel de paiement, accroche motivante (série/classement).
// ─────────────────────────────────────────────────────────────────────────
import { formatDateFR, getFirstName } from "../../lib/utils";
import { getMatchStart, getMatchTiming } from "../../lib/matchLogic";
import { computePlayerStats } from "../../lib/stats";
import { useAppData } from "../../context/AppContext";

export function MyMatchSummary({ now }) {
  const { connectedPlayer, players, matches } = useAppData();

  const myUpcoming = [...matches]
    .filter(
      (m) =>
        getMatchTiming(m, now) !== "finished" &&
        (m.participants || []).some((p) => p.playerId === connectedPlayer.id)
    )
    .sort((a, b) => getMatchStart(a) - getMatchStart(b))[0];

  const myLastFinished = [...matches]
    .filter(
      (m) =>
        m.type === "Saison" &&
        getMatchTiming(m, now) === "finished" &&
        (m.participants || []).some((p) => p.playerId === connectedPlayer.id)
    )
    .sort((a, b) => getMatchStart(b) - getMatchStart(a))[0];

  let owesMoney = null;
  if (myLastFinished && !connectedPlayer.isCreditor) {
    const me = myLastFinished.participants.find((p) => p.playerId === connectedPlayer.id);
    if (me && me.paidStatus !== "paid") owesMoney = myLastFinished;
  }

  let partnerNames = "";
  if (myUpcoming) {
    const me = myUpcoming.participants.find((p) => p.playerId === connectedPlayer.id);
    const partners = (myUpcoming.participants || []).filter(
      (p) => me?.team && p.team === me.team && p.playerId !== connectedPlayer.id
    );
    partnerNames = partners.map((p) => getFirstName(p.name)).join(" & ");
  }

  // Accroche motivante — reprend les stats déjà calculées ailleurs (série,
  // classement), juste mise en avant ici pour donner envie de se connecter.
  const myStats = computePlayerStats(connectedPlayer.id, matches);
  const ranked = players
    .map((p) => ({ id: p.id, stats: computePlayerStats(p.id, matches) }))
    .filter((r) => r.stats.wins + r.stats.losses > 0)
    .sort((a, b) => b.stats.winRate - a.stats.winRate || b.stats.wins - a.stats.wins);
  const myRank = ranked.findIndex((r) => r.id === connectedPlayer.id) + 1;

  let hook = null;
  if (myStats.streak >= 2 && myStats.streakType === "win") {
    hook = `🔥 ${myStats.streak} victoires d'affilée — en forme !`;
  } else if (myRank > 0 && myRank <= 3) {
    hook = `🏆 ${myRank}${myRank === 1 ? "er" : "ème"} au classement du club`;
  } else if (myStats.streak >= 2 && myStats.streakType === "loss") {
    hook = `💪 ${myStats.streak} défaites d'affilée — la revanche approche`;
  } else if (myStats.bestDuo) {
    const partnerName = players.find((p) => p.id === myStats.bestDuo.id)?.name;
    if (partnerName) hook = `🤝 Duo du feu avec ${getFirstName(partnerName)}`;
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-700 text-white shadow-sm p-4 mb-5">
      <p className="pm-display font-bold text-lg mb-1">
        Bonjour {getFirstName(connectedPlayer.name)} 👋
      </p>
      {hook && (
        <span className="inline-block bg-white/15 rounded-full px-2.5 py-1 text-xs font-semibold mb-2">
          {hook}
        </span>
      )}

      {myUpcoming ? (
        <p className="text-sm">
          📅 Vous jouez <span className="font-semibold">{formatDateFR(myUpcoming.date)}</span> à{" "}
          {myUpcoming.time}
          {myUpcoming.location ? ` (${myUpcoming.location})` : ""}
          {partnerNames ? (
            <>
              {" "}
              avec <span className="font-semibold">{partnerNames}</span>
            </>
          ) : (
            ""
          )}
          .
        </p>
      ) : (
        <p className="text-sm text-white/90">
          N'oublie pas d'indiquer tes présences ☺️
        </p>
      )}

      {owesMoney && (
        <p className="text-sm mt-2 pt-2 border-t border-white/20">
          ⚠️ Vous devez encore régler{" "}
          <span className="font-semibold">
            {(owesMoney.matchFeePerPlayer || 0).toLocaleString("fr-FR")} €
          </span>{" "}
          pour le match du {formatDateFR(owesMoney.date)}.
        </p>
      )}
    </div>
  );
}
