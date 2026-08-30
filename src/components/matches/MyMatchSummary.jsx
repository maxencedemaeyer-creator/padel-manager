// ─────────────────────────────────────────────────────────────────────────
// Bandeau personnel en tête de l'onglet Matchs : rappel de présence si le
// joueur n'a pas encore répondu pour les 2 prochaines sessions, prochain
// match où il va effectivement jouer, rappel de paiement, accroche
// motivante (série/classement). Les messages sont cumulatifs : plusieurs
// peuvent s'afficher en même temps, l'un sous l'autre.
// ─────────────────────────────────────────────────────────────────────────
import { clubNameOnly, formatDateFR, formatTimeFR, getFirstName } from "../../lib/utils";
import {
  daysUntilMatch,
  getMatchStart,
  getMatchTiming,
  groupMatchesBySession,
} from "../../lib/matchLogic";
import { getSessionAvailability } from "../../lib/availability";
import { computePlayerStats } from "../../lib/stats";
import { useAppData } from "../../context/AppContext";

// Mêmes valeurs que dans MatchesView pour repérer "les 2 prochains matchs"
// exactement comme la liste "Prochains matchs" affichée juste en dessous
// (les 2 prochaines dates, dans un horizon de 15 jours).
const UPCOMING_WINDOW_DAYS = 15;
const UPCOMING_SESSIONS_COUNT = 2;

export function MyMatchSummary({ now }) {
  const { connectedPlayer, players, matches } = useAppData();

  const notFinished = matches.filter((m) => getMatchTiming(m, now) !== "finished");

  // "Vous jouez" : la première session à venir (même dans plusieurs mois,
  // pas de limite de fenêtre ici) où le joueur va effectivement jouer — soit
  // qu'il ait déjà une place composée sur un terrain, soit qu'il ait répondu
  // "présent" à sa disponibilité (il jouera alors d'office, même si l'admin
  // n'a pas encore publié la composition — un joueur peut très bien être
  // "présent" à un match dans 2 mois tout en étant absent aux 2 prochains).
  //
  // Tant que la composition n'est pas faite, on ne connaît pas encore SON
  // terrain précis (juste "présent" ne dit pas sur quel terrain il jouera
  // s'il y en a plusieurs ce jour-là) : on affiche alors seulement le nom du
  // club, jamais un numéro de terrain au hasard. Dès qu'il a une place
  // précise (participants), on affiche son terrain exact.
  const upcomingSessions = groupMatchesBySession(notFinished).sort(
    (a, b) => getMatchStart(a[0]) - getMatchStart(b[0])
  );
  let myUpcoming = null;
  for (const session of upcomingSessions) {
    const myMatch = session.find((m) =>
      (m.participants || []).some((p) => p.playerId === connectedPlayer.id)
    );
    if (myMatch) {
      myUpcoming = { date: myMatch.date, time: myMatch.time, location: myMatch.location };
      break;
    }
    if (getSessionAvailability(session)[connectedPlayer.id] === "present") {
      const clubs = [...new Set(session.map((m) => clubNameOnly(m.location)).filter(Boolean))];
      myUpcoming = {
        date: session[0].date,
        time: session[0].time,
        location: clubs.join(" · ") || null,
      };
      break;
    }
  }

  // Rappel de présence : sur les 2 prochaines dates de match (même fenêtre
  // que "Prochains matchs" ci-dessous), le joueur a-t-il déjà donné une
  // réponse ? Présent, absent, ou même "je ne sais pas encore" comptent
  // tous les 3 comme "répondu" — seule l'absence totale de réponse déclenche
  // le rappel.
  const upcomingWithinWindow = notFinished.filter(
    (m) => daysUntilMatch(m, now) < UPCOMING_WINDOW_DAYS
  );
  const nextDates = [...new Set(upcomingWithinWindow.map((m) => m.date))].slice(
    0,
    UPCOMING_SESSIONS_COUNT
  );
  const nextSessions = groupMatchesBySession(
    upcomingWithinWindow.filter((m) => nextDates.includes(m.date))
  );
  const needsPresenceReminder = nextSessions.some((session) => {
    const availability = getSessionAvailability(session);
    return availability[connectedPlayer.id] === undefined;
  });

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

      <div className="flex flex-col gap-1.5">
        {needsPresenceReminder && (
          <p className="text-sm bg-amber-400/20 border border-amber-300/30 rounded-xl px-2.5 py-1.5">
            ⏰ N'oubliez pas d'indiquer votre présence pour les prochains matchs !
          </p>
        )}

        {myUpcoming && (
          <p className="text-sm">
            📅 Vous jouez <span className="font-semibold">{formatDateFR(myUpcoming.date)}</span> à{" "}
            {formatTimeFR(myUpcoming.time)}
            {myUpcoming.location ? ` (${myUpcoming.location})` : ""}.
          </p>
        )}

        {/* Cas neutre : le joueur a déjà répondu pour les prochaines
            sessions (donc pas de rappel) mais n'a de place confirmée nulle
            part — typiquement répondu "absent" aux prochains matchs (et pas
            encore répondu au-delà, ou absent pour le reste de la saison).
            Sans ce message, le bandeau resterait vide sous "Bonjour". */}
        {!needsPresenceReminder && !myUpcoming && (
          <p className="text-sm text-white/90">
            On espère te revoir vite sur les terrains 👋
          </p>
        )}
      </div>

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
