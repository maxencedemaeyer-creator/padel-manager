// ─────────────────────────────────────────────────────────────────────────
// Composant racine — assemble le contexte, l'authentification, l'en-tête,
// la navigation basse et bascule entre les 5 vues.
// N'oubliez pas d'importer "./index.css" une seule fois, dans main.jsx
// (anciennement injecté via <GlobalStyles/>, maintenant un fichier CSS normal).
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useMatches } from "./hooks/useFirestoreData";
import { useWithdrawalWatcher } from "./lib/withdrawalWatcher";
import { AppDataContext, useAppData } from "./context/AppContext";
import { Spinner } from "./components/ui";
import { AuthGate } from "./components/auth/AuthGate";
import { Header } from "./components/layout/Header";
import { BottomNav } from "./components/layout/BottomNav";
import { MatchesView } from "./views/MatchesView";
import { PlayersView } from "./views/PlayersView";
import { StatsView } from "./views/StatsView";
import { AccountingView } from "./views/AccountingView";
import { AdminView } from "./views/AdminView";
import { PostMatchPrompt } from "./components/matches/PostMatchPrompt";

function MainApp() {
  const matchesHook = useMatches();
  const [view, setView] = useState("matches");
  useWithdrawalWatcher();

  return (
    <AppDataContext.Provider
      value={{ ...useAppData(), matches: matchesHook.matches }}
    >
      <div className="pm-root">
        <Header setView={setView} />
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
        ) : (
          <AdminView />
        )}
        <BottomNav view={view} setView={setView} />
        {!matchesHook.loading && <PostMatchPrompt />}
      </div>
    </AppDataContext.Provider>
  );
}

export default function PadelManagerApp() {
  return (
    <AuthGate>
      <MainApp />
    </AuthGate>
  );
}
