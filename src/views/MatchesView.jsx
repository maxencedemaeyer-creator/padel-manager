// ─────────────────────────────────────────────────────────────────────────
// Onglet "Matchs" — bandeau personnel, dernier match joué, prochain match,
// reste de la saison, création d'un match ponctuel (admin).
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { cn } from "../lib/utils";
import { getMatchStart, getMatchTiming, groupMatchesBySession, useNow } from "../lib/matchLogic";
import { useAppData } from "../context/AppContext";
import Icon from "../components/icons/Icon";
import { EmptyState } from "../components/ui";
import { MyMatchSummary } from "../components/matches/MyMatchSummary";
import { SessionCard, LastMatchCard } from "../components/matches/SessionCard";
import { CreateMatchModal } from "../components/matches/CreateMatchModal";

export function MatchesView() {
  const { matches, isAdmin } = useAppData();
  const now = useNow();
  const [filter, setFilter] = useState("upcoming");
  const [showCreateMatch, setShowCreateMatch] = useState(false);

  const sortedByStart = [...matches].sort((a, b) => getMatchStart(a) - getMatchStart(b));
  const notFinished = sortedByStart.filter((m) => getMatchTiming(m, now) !== "finished");
  const finishedDesc = sortedByStart
    .filter((m) => getMatchTiming(m, now) === "finished")
    .sort((a, b) => getMatchStart(b) - getMatchStart(a));

  // Prochain match : toutes les rencontres du jour le plus proche à venir
  // (ex. les 2 terrains du jeudi suivant).
  const nextDate = notFinished[0]?.date;
  const nextGroup = nextDate ? notFinished.filter((m) => m.date === nextDate) : [];

  // Dernier match joué : toutes les rencontres du dernier jour déjà terminé.
  const lastDate = finishedDesc[0]?.date;
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
          Prochain match
        </h3>
        {nextGroup.length > 0 ? (
          <div className="flex flex-col gap-4">
            {groupMatchesBySession(nextGroup).map((session) => (
              <SessionCard
                key={`${session[0].date}|${session[0].time}`}
                sessionMatches={session}
                now={now}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Icon.Calendar className="w-6 h-6" />}
            title="Aucun match à venir"
            subtitle={
              isAdmin
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
            {groupMatchesBySession(otherFiltered).map((session) => (
              <SessionCard
                key={`${session[0].date}|${session[0].time}`}
                sessionMatches={session}
                now={now}
              />
            ))}
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
