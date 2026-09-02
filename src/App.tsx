// ─────────────────────────────────────────────────────────────────────────
// Composant racine — assemble le contexte, l'authentification, l'en-tête,
// la navigation basse et bascule entre les 5 vues.
// N'oubliez pas d'importer "./index.css" une seule fois, dans main.jsx
// (anciennement injecté via <GlobalStyles/>, maintenant un fichier CSS normal).
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useMatches, useAppSettings, useAbonnements, useClubs } from "./hooks/useFirestoreData";
import { useWithdrawalWatcher } from "./lib/withdrawalWatcher";
import { usePresenceAutoAbsentWatcher } from "./lib/presenceWatcher";
import { AppDataContext, useAppData } from "./context/AppContext";
import { Spinner, BounceLoader, Button } from "./components/ui";
import { authReady } from "./firebase";
import { AuthGate } from "./components/auth/AuthGate";
import { Header } from "./components/layout/Header";
import { BottomNav } from "./components/layout/BottomNav";
import { PostMatchPrompt } from "./components/matches/PostMatchPrompt";
import Icon from "./components/icons/Icon";

// Écran plein écran affiché à tous les joueurs non-admin quand le mode
// maintenance est activé depuis l'onglet Administration (voir
// src/views/AdminView.jsx, MaintenanceSettingCard). L'administrateur, lui,
// n'est jamais bloqué : c'est le seul moyen de désactiver la maintenance.
function MaintenanceScreen() {
  const { logout } = useAppData();

  return (
    <div className="pm-root min-h-screen flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-300/40 flex items-center justify-center mb-5 text-rose-500">
        <Icon.AlertCircle className="w-8 h-8" />
      </div>
      <h1 className="pm-display font-extrabold text-2xl mb-2">Maintenance en cours</h1>
      <p className="text-sm text-[var(--color-text-dim)] max-w-xs mb-8">
        L'application est momentanément indisponible pour effectuer une mise à jour. Merci de
        votre patience, ça ne devrait pas être long !
      </p>
      <Button variant="secondary" onClick={logout}>
        Changer de compte
      </Button>
    </div>
  );
}

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
  const abonnementsHook = useAbonnements();
  const clubsHook = useClubs();
  const [view, setView] = useState("matches");
  // Les deux watchers reçoivent directement les matchs déjà synchronisés par
  // useMatches() ci-dessus, au lieu de retélécharger toute la collection
  // "matches" en double de leur côté (voir withdrawalWatcher.js et
  // presenceWatcher.js pour le détail — c'était une des principales causes
  // de lenteur au chargement de l'app). Important : ces deux appels DOIVENT
  // recevoir matchesHook.matches — un remplacement de ce fichier qui les
  // appellerait sans argument réintroduirait le problème de lenteur pour
  // usePresenceAutoAbsentWatcher (et viderait silencieusement les données
  // utilisées par useWithdrawalWatcher).
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
      maintenanceEnabled: settingsHook.settings.maintenanceEnabled,
      abonnements: abonnementsHook.abonnements,
      clubs: clubsHook.clubs,
    }),
    [
      appData,
      matchesHook.matches,
      settingsHook.settings.gameCenterEnabled,
      settingsHook.settings.maintenanceEnabled,
      abonnementsHook.abonnements,
      clubsHook.clubs,
    ]
  );

  // Mode maintenance : tout le monde est bloqué sur l'écran d'attente, sauf
  // l'administrateur (qui doit impérativement garder l'accès pour pouvoir
  // désactiver la maintenance depuis l'onglet Administration).
  if (settingsHook.settings.maintenanceEnabled && !appData.isAdmin) {
    return (
      <AppDataContext.Provider value={contextValue}>
        <MaintenanceScreen />
      </AppDataContext.Provider>
    );
  }

  // Juste après la connexion (choix du profil + code PIN), les toutes
  // premières données (matchs) sont encore en train d'arriver de Firebase :
  // plutôt que d'afficher l'en-tête et la barre de navigation autour d'un
  // simple spinner dans le contenu, on affiche un écran de chargement plein
  // écran (balle qui rebondit) le temps de cette unique pause, puis on
  // révèle l'app complète d'un coup, déjà prête et rapide.
  if (matchesHook.loading) {
    return (
      <AppDataContext.Provider value={contextValue}>
        <BounceLoader fullScreen label="Préparation de votre espace..." />
      </AppDataContext.Provider>
    );
  }

  return (
    <AppDataContext.Provider value={contextValue}>
      <div className="pm-root">
        <Header setView={setView} />
        <Suspense
          fallback={
            view === "game-center" ? (
              <BounceLoader label="Chargement du Game Center..." />
            ) : (
              <Spinner />
            )
          }
        >
          {view === "matches" ? (
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
        <PostMatchPrompt />
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
    return <BounceLoader fullScreen />;
  }

  return (
    <AuthGate>
      <MainApp />
    </AuthGate>
  );
}
