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

// Onglet actif mémorisé pour l'onglet du navigateur en cours (sessionStorage,
// PAS localStorage) : on reste sur le même volet après un rafraîchissement
// manuel de la page, mais une nouvelle connexion (nouvel onglet/navigateur)
// repart bien sur "Matchs" par défaut, comme voulu à l'origine.
const VIEW_STORAGE_KEY = "pm-active-view";
const VALID_VIEWS = ["matches", "players", "stats", "accounting", "admin"];

function MainApp() {
  const matchesHook = useMatches();
  const appData = useAppData();
  const [view, setView] = useState(() => {
    try {
      const saved = sessionStorage.getItem(VIEW_STORAGE_KEY);
      if (!VALID_VIEWS.includes(saved)) return "matches";
      // Un onglet restauré auquel ce joueur n'a plus droit (ex. changement
      // de rôle) ne doit jamais s'afficher — on retombe sur "Matchs".
      if (saved === "admin" && !appData.isAdmin) return "matches";
      if (saved === "accounting" && !appData.connectedPlayer.isCreditor) return "matches";
      return saved;
    } catch {
      return "matches";
    }
  });
  useWithdrawalWatcher();

  const changeView = (id) => {
    setView(id);
    try {
      sessionStorage.setItem(VIEW_STORAGE_KEY, id);
    } catch {
      // sessionStorage indisponible (navigation privée stricte, etc.) —
      // le changement d'onglet fonctionne quand même, seule la mémorisation
      // après rechargement est perdue.
    }
  };

  return (
    <AppDataContext.Provider
      value={{ ...appData, matches: matchesHook.matches }}
    >
      <div className="pm-root">
        <Header setView={changeView} />
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
        ) : view === "admin" ? (
          <AdminView />
        ) : (
          <MatchesView />
        )}
        <BottomNav view={view} setView={changeView} />
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
