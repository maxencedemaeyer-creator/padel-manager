// ─────────────────────────────────────────────────────────────────────────
// Composant racine — assemble le contexte, l'authentification, l'en-tête,
// la navigation basse et bascule entre les 5 vues.
// N'oubliez pas d'importer "./index.css" une seule fois, dans main.jsx
// (anciennement injecté via <GlobalStyles/>, maintenant un fichier CSS normal).
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useMatches, useAppSettings } from "./hooks/useFirestoreData";
import { useWithdrawalWatcher } from "./lib/withdrawalWatcher";
import { usePresenceAutoAbsentWatcher } from "./lib/presenceWatcher";
import { AppDataContext, useAppData } from "./context/AppContext";
import { Spinner } from "./components/ui";
import { authReady } from "./firebase";
import { AuthGate } from "./components/auth/AuthGate";
import { Header } from "./components/layout/Header";
import { BottomNav } from "./components/layout/BottomNav";
import { PostMatchPrompt } from "./components/matches/PostMatchPrompt";

// Chargement à la demande (code-splitting) : chaque onglet n'est téléchargé
// que la première fois qu'on l'ouvre, au lieu de tout charger d'un bloc dès
// l'arrivée sur le site. Réduit nettement le temps avant que l'app devienne
// utilisable, surtout sur mobile / réseau lent.
const MatchesView = lazy(() =>
  import("./views/MatchesView").then((m) => ({ default: m.MatchesView }))
);
const PlayersView = lazy(() =>
  import("./views/PlayersView").then((m) => ({ default: m.PlayersView }))
);
const StatsView = lazy(() =>
  import("./views/StatsView").then((m) => ({ default: m.StatsView }))
);
const AccountingView = lazy(() =>
  import("./views/AccountingView").then((m) => ({ default: m.AccountingView }))
);
const AdminView = lazy(() =>
  import("./views/AdminView").then((m) => ({ default: m.AdminView }))
);
const GameCenterView = lazy(() =>
  import("./views/GameCenterView").then((m) => ({ default: m.GameCenterView }))
);

function MainApp() {
  const matchesHook = useMatches();
  const settingsHook = useAppSettings();
  const [view, setView] = useState("matches");
  // Les deux watchers reçoivent désormais directement les matchs déjà
  // synchronisés par useMatches() ci-dessus, au lieu de retélécharger toute
  // la collection "matches" en double de leur côté (voir withdrawalWatcher.js
  // et presenceWatcher.js pour le détail — c'était une des principales
  // causes de lenteur au chargement de l'app).
  useWithdrawalWatcher(matchesHook.matches);
  usePresenceAutoAbsentWatcher(matchesHook.matches);
  const appData = useAppData();

  // Mémoïsation : sans elle, un nouvel objet de contexte était recréé à
  // chaque rendu de MainApp — y compris à chaque simple clic sur un onglet
  // de la navigation basse (changement de "view") — ce qui forçait TOUTE
  // l'app à se re-rendre inutilement à chaque clic. C'était la cause
  // principale des petits délais ressentis un peu partout dans l'app.
  const contextValue = useMemo(
    () => ({
      ...appData,
      matches: matchesHook.matches,
      gameCenterEnabled: settingsHook.settings.gameCenterEnabled,
    }),
    [appData, matchesHook.matches, settingsHook.settings.gameCenterEnabled]
  );

  return (
    <AppDataContext.Provider value={contextValue}>
      <div className="pm-root">
        <Header setView={setView} />
        <Suspense fallback={<Spinner />}>
          {matchesHook.loading ? (
            <Spinner />
          ) : view === "matches" ? (
            <MatchesView />
          ) : view === "players" ? (
            <PlayersView />
          ) : view === "stats" ? (
            <StatsView />
          ) : view === "accounting" ? (
            <AccountingView />
          ) : view === "game-center" ? (
            <GameCenterView />
          ) : (
            <AdminView />
          )}
        </Suspense>
        <BottomNav view={view} setView={setView} />
        {!matchesHook.loading && <PostMatchPrompt />}
      </div>
    </AppDataContext.Provider>
  );
}

export default function PadelManagerApp() {
  // Attend la connexion Firebase anonyme (voir src/firebase.js) avant
  // d'afficher quoi que ce soit : tant qu'elle n'est pas terminée, toute
  // lecture Firestore serait refusée par les règles de sécurité.
  const [authIsReady, setAuthIsReady] = useState(false);

  useEffect(() => {
    authReady.then(() => setAuthIsReady(true));
  }, []);

  if (!authIsReady) {
    return (
      <div className="pm-root flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <AuthGate>
      <MainApp />
    </AuthGate>
  );
}
