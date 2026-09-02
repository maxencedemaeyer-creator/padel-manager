// ─────────────────────────────────────────────────────────────────────────
// Onglet "Matchs" — bandeau personnel, dernier match joué, prochains matchs
// (les 2 prochaines dates, dans un horizon de 15 jours), reste de la saison,
// création d'un match ponctuel (admin).
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { cn } from "../lib/utils";
import {
  daysUntilMatch,
  excludeArchivedSeasonMatches,
  getMatchStart,
  getMatchTiming,
  groupMatchesBySession,
  isPlayerMatchCreditor,
  useNow,
} from "../lib/matchLogic";
import { useAppData } from "../context/AppContext";
import Icon from "../components/icons/Icon";
import { EmptyState } from "../components/ui";
import { isCompositionPublished } from "../lib/composition";
import { MyMatchSummary } from "../components/matches/MyMatchSummary";
import { SessionCard, LastMatchCard, AvailabilitySessionCard } from "../components/matches/SessionCard";
import { CourtPanel } from "../components/matches/CourtPanel";
import { CreateMatchModal } from "../components/matches/CreateMatchModal";

// Nombre max de jours après la date de connexion pendant lesquels un match à
// venir peut apparaître dans "Prochains matchs".
const UPCOMING_WINDOW_DAYS = 15;
// Nombre de dates de match (sessions) à afficher dans "Prochains matchs".
const UPCOMING_SESSIONS_COUNT = 2;
// Nombre de jours après SON dernier match joué pendant lesquels le bloc
// "Dernier match joué" reste visible pour un joueur donné.
const LAST_MATCH_WINDOW_DAYS = 15;
// Nombre de sessions (dates de match) affichées d'un coup dans "Reste de la
// saison", avant d'avoir besoin de cliquer sur "Charger plus". Les matchs
// sont déjà tous récupérés en une fois depuis Firebase (nécessaire pour que
// le reste de l'app — Stats, Comptabilité, jeux du Game Center — reste
// synchronisé en temps réel) : cette limite ne change rien au chargement
// des données, seulement au nombre de cartes construites et affichées d'un
// coup, qui peut devenir coûteux une fois la saison bien avancée.
const REST_OF_SEASON_PAGE_SIZE = 10;

export function MatchesView() {
  const { matches: allMatches, abonnements, isAdmin, connectedPlayer, players } = useAppData();
  const now = useNow();
  const [filter, setFilter] = useState("upcoming");
  const [showCreateMatch, setShowCreateMatch] = useState(false);
  // Réinitialisé à REST_OF_SEASON_PAGE_SIZE à chaque bascule "À venir" /
  // "Terminés" (voir handleFilterChange plus bas), pour ne jamais se
  // retrouver bloqué sur un onglet qui affiche 0 carte alors qu'il y en a.
  const [restOfSeasonVisibleCount, setRestOfSeasonVisibleCount] = useState(
    REST_OF_SEASON_PAGE_SIZE
  );
  const handleFilterChange = (id) => {
    setFilter(id);
    setRestOfSeasonVisibleCount(REST_OF_SEASON_PAGE_SIZE);
  };

  // Ajout du 02/09/2026 (soir) : un abonnement clôturé depuis Administration
  // masque ses matchs ici, pour tout le monde (y compris l'admin) — voir
  // excludeArchivedSeasonMatches dans lib/matchLogic.js. Rien n'est
  // supprimé : réactiver l'abonnement les fait immédiatement réapparaître.
  const matches = excludeArchivedSeasonMatches(allMatches, abonnements);

  // Matchs reportés "à une date inconnue" (voir MatchSettingsModals.jsx →
  // "Reporter à une date inconnue") : sortis du flux chronologique habituel
  // pour TOUT LE MONDE — leur ancienne date, gardée en base mais ignorée
  // (voir getMatchTiming → "tbd"), ne doit plus jamais servir à les classer
  // "à venir" / "terminé".
  const tbdMatches = matches.filter((m) => m.dateTBD);
  const datedMatches = matches.filter((m) => !m.dateTBD);

  // Affichés à part, dans leur propre section tout en bas de l'onglet (pour
  // que "Prochains matchs" reste la première chose vue par tout le monde
  // juste après le bloc "Bonjour") — et visibles UNIQUEMENT de l'admin et
  // du/des créancier(s) de chaque match concerné (voir
  // isPlayerMatchCreditor) : un joueur ordinaire n'a pas besoin de savoir
  // qu'un match doit être reprogrammé, seuls ceux qui peuvent agir dessus le
  // voient. Le bloc "Bonjour" (MyMatchSummary.jsx) affiche, pour ces mêmes
  // personnes, un petit bouton d'alerte qui amène directement ici.
  const visibleTbdMatches = tbdMatches.filter(
    (m) => isAdmin || isPlayerMatchCreditor(m, matches, players, connectedPlayer.id)
  );

  const sortedByStart = [...datedMatches].sort((a, b) => getMatchStart(a) - getMatchStart(b));
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
  // Regroupement en sessions calculé une seule fois ici (au lieu de dans le
  // JSX) pour pouvoir le paginer : seules les REST_OF_SEASON_PAGE_SIZE
  // premières sessions sont réellement construites en cartes à l'écran.
  const otherSessions = groupMatchesBySession(otherFiltered);
  const visibleOtherSessions = otherSessions.slice(0, restOfSeasonVisibleCount);
  const remainingOtherSessionsCount = otherSessions.length - visibleOtherSessions.length;

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
              // La disposition du terrain (qui joue où) ne s'affiche plus
              // automatiquement : elle reste masquée aux joueurs tant que
              // l'administrateur n'a pas cliqué sur "Publier la
              // composition" pour cette session — lui, garde toujours la
              // vue complète pour pouvoir composer les équipes tranquillement.
              const showComposition = isAdmin || isCompositionPublished(session);
              return showComposition ? (
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
                onClick={() => handleFilterChange(id)}
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
            {visibleOtherSessions.map((session) => {
              const key = `${session[0].date}|${session[0].time}`;
              // Un match déjà terminé garde son affichage résultat habituel
              // (score compact) quel que soit l'état de publication — la
              // publication ne concerne que la composition d'un match à
              // venir. Pour un match pas encore joué, la composition ne
              // s'affiche aux joueurs qu'une fois publiée par l'admin ; lui,
              // garde la vue complète pour composer à l'avance.
              const finished = getMatchTiming(session[0], now) === "finished";
              const showComposition = isAdmin || (!finished && isCompositionPublished(session));
              return showComposition ? (
                <SessionCard key={key} sessionMatches={session} now={now} />
              ) : (
                <AvailabilitySessionCard
                  key={key}
                  sessionMatches={session}
                  restOfSeason
                  now={now}
                />
              );
            })}
            {remainingOtherSessionsCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  setRestOfSeasonVisibleCount((c) => c + REST_OF_SEASON_PAGE_SIZE)
                }
                className="w-full py-3 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text-dim)] hover:border-[var(--color-lime)]/50 active:scale-[0.98] transition-all"
              >
                Charger plus ({remainingOtherSessionsCount} restant
                {remainingOtherSessionsCount > 1 ? "s" : ""})
              </button>
            )}
          </div>
        )}
      </div>

      {visibleTbdMatches.length > 0 && (
        <div id="matchs-a-reprogrammer" className="mb-6 scroll-mt-4">
          <h3 className="font-semibold text-sm text-white mb-1">
            Matchs à reprogrammer
          </h3>
          <p className="text-xs text-[var(--color-text-faint)] mb-2">
            Visible uniquement par vous (admin / créancier) tant qu'aucune
            nouvelle date n'est fixée.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleTbdMatches.map((m) => (
              <CourtPanel key={m.id} match={m} now={now} />
            ))}
          </div>
        </div>
      )}

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
