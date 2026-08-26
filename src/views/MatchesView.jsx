// ─────────────────────────────────────────────────────────────────────────
// Onglet "Matchs" — bandeau personnel, dernier match joué, prochains matchs
// (les 2 prochaines dates, dans un horizon de 15 jours), reste de la saison,
// création d'un match ponctuel (admin).
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { cn } from "../lib/utils";
import {
  daysUntilMatch,
  getMatchStart,
  getMatchTiming,
  groupMatchesBySession,
  useNow,
} from "../lib/matchLogic";
import { useAppData } from "../context/AppContext";
import Icon from "../components/icons/Icon";
import { EmptyState } from "../components/ui";
import { getSessionAvailability } from "../lib/availability";
import { MyMatchSummary } from "../components/matches/MyMatchSummary";
import { SessionCard, LastMatchCard, AvailabilitySessionCard } from "../components/matches/SessionCard";
import { CreateMatchModal } from "../components/matches/CreateMatchModal";

// Nombre max de jours après la date de connexion pendant lesquels un match à
// venir peut apparaître dans "Prochains matchs".
const UPCOMING_WINDOW_DAYS = 15;
// Nombre de dates de match (sessions) à afficher dans "Prochains matchs".
const UPCOMING_SESSIONS_COUNT = 2;
// Nombre de jours après SON dernier match joué pendant lesquels le bloc
// "Dernier match joué" reste visible pour un joueur donné.
const LAST_MATCH_WINDOW_DAYS = 15;

export function MatchesView() {
  const { matches, isAdmin, connectedPlayer } = useAppData();
  const now = useNow();
  const [filter, setFilter] = useState("upcoming");
  const [showCreateMatch, setShowCreateMatch] = useState(false);

  const sortedByStart = [...matches].sort((a, b) => getMatchStart(a) - getMatchStart(b));
  const notFinished = sortedByStart.filter((m) => getMatchTiming(m, now) !== "finished");
  const finishedDesc = sortedByStart
    .filter((m) => getMatchTiming(m, now) === "finished")
    .sort((a, b) => getMatchStart(b) - getMatchStart(a));

  // Prochains matchs : les 2 prochaines dates de match à venir (que le
  // joueur y participe ou non), en ne gardant que celles qui ont lieu dans
  // les 15 jours suivant la date de connexion (ex. connexion le 1er
  // septembre → matchs visibles jusqu'au 15 septembre inclus).
  const upcomingWithinWindow = notFinished.filter(
    (m) => daysUntilMatch(m, now) < UPCOMING_WINDOW_DAYS
  );
  const nextDates = [...new Set(upcomingWithinWindow.map((m) => m.date))].slice(
    0,
    UPCOMING_SESSIONS_COUNT
  );
  const nextGroup = upcomingWithinWindow.filter((m) => nextDates.includes(m.date));

  // Dernier match joué : uniquement si LE JOUEUR CONNECTÉ a lui-même déjà
  // joué un match terminé, et seulement tant que ce match date de moins de
  // 15 jours calendrier — sinon le bloc disparaît pour lui (mais reste
  // visible pour un autre joueur ayant, lui, joué plus récemment).
  const myFinishedDesc = finishedDesc.filter((m) =>
    (m.participants || []).some((p) => p.playerId === connectedPlayer.id)
  );
  const myLastPlayed = myFinishedDesc[0];
  const lastDate =
    myLastPlayed && daysUntilMatch(myLastPlayed, now) > -LAST_MATCH_WINDOW_DAYS
      ? myLastPlayed.date
      : null;
  const lastGroup = lastDate ? finishedDesc.filter((m) => m.date === lastDate) : [];

  const highlightedIds = new Set([...nextGroup, ...lastGroup].map((m) => m.id));
  const otherMatches = sortedByStart.filter((m) => !highlightedIds.has(m.id));
  const otherFiltered = otherMatches.filter((m) =>
    filter === "upcoming"
      ? getMatchTiming(m, now) !== "finished"
      : getMatchTiming(m, now) === "finished"
  );

  return (
    <div className="px-4 pt-4 pb-28 relative min-h-[70vh]">
      <MyMatchSummary now={now} />

      {lastGroup.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-sm text-white mb-2">
            Dernier match joué
          </h3>
          <div className="flex flex-col gap-3">
            {groupMatchesBySession(lastGroup).map((session) => (
              <LastMatchCard
                key={`${session[0].date}|${session[0].time}`}
                sessionMatches={session}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mb-6">
        <h3 className="font-semibold text-sm text-white mb-2">
          Prochains matchs
        </h3>
        {nextGroup.length > 0 ? (
          <div className="flex flex-col gap-4">
            {groupMatchesBySession(nextGroup).map((session) => {
              const key = `${session[0].date}|${session[0].time}`;
              // Tant que le joueur connecté n'a pas répondu à cette session
              // (présent / absent / je ne sais pas encore), on affiche la
              // carte simplifiée "présence" plutôt que la disposition du
              // terrain — l'admin, lui, garde toujours la vue complète pour
              // pouvoir composer les équipes.
              const hasAnswered =
                isAdmin || Boolean(getSessionAvailability(session)[connectedPlayer.id]);
              return hasAnswered ? (
                <SessionCard key={key} sessionMatches={session} now={now} />
              ) : (
                <AvailabilitySessionCard key={key} sessionMatches={session} />
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Icon.Calendar className="w-6 h-6" />}
            title={
              notFinished.length > 0
                ? "Aucun match dans les 15 prochains jours"
                : "Aucun match à venir"
            }
            subtitle={
              notFinished.length > 0
                ? "Le prochain match programmé a lieu dans plus de 15 jours."
                : isAdmin
                ? "Créez un match ponctuel avec le bouton + ci-dessous, ou lancez une saison complète depuis l'onglet Administration."
                : "Revenez plus tard, l'administrateur programmera bientôt de nouveaux matchs."
            }
          />
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-white">
            Reste de la saison
          </h3>
          <div className="flex bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full p-1">
            {[
              ["upcoming", "À venir"],
              ["done", "Terminés"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                  filter === id
                    ? "bg-sky-200 text-sky-900"
                    : "text-[var(--color-text-dim)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {otherFiltered.length === 0 ? (
          <EmptyState
            icon={<Icon.Calendar className="w-6 h-6" />}
            title={
              filter === "upcoming" ? "Aucun autre match à venir" : "Aucun autre match terminé"
            }
            subtitle="Le reste de la saison apparaîtra ici."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {groupMatchesBySession(otherFiltered).map((session) => {
              const key = `${session[0].date}|${session[0].time}`;
              // Les matchs encore lointains (> 15 jours) n'affichent pas la
              // composition détaillée aux joueurs — juste date/lieu et leur
              // présence. L'admin garde la vue complète pour composer à
              // l'avance.
              return isAdmin ? (
                <SessionCard key={key} sessionMatches={session} now={now} />
              ) : (
                <AvailabilitySessionCard key={key} sessionMatches={session} restOfSeason />
              );
            })}
          </div>
        )}
      </div>

      {isAdmin && (
        <button
          onClick={() => setShowCreateMatch(true)}
          aria-label="Créer un match ponctuel"
          className="fixed bottom-24 right-5 z-20 w-14 h-14 rounded-full bg-sky-200 text-sky-900 flex items-center justify-center shadow-lg shadow-sky-300/50 active:scale-95 transition-all"
        >
          <Icon.Plus className="w-6 h-6" />
        </button>
      )}

      {showCreateMatch && <CreateMatchModal onClose={() => setShowCreateMatch(false)} />}
    </div>
  );
}
