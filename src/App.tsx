/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Player, 
  Match, 
  ClubSettings, 
  DEFAULT_SETTINGS 
} from './types';
import { 
  listenSettings, 
  listenPlayers, 
  listenMatches, 
  seedInitialPlayers 
} from './services/padelService';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { Matches } from './components/Matches';
import { Players } from './components/Players';
import { Finances } from './components/Finances';
import { Settings } from './components/Settings';
import { LoginScreen } from './components/LoginScreen';
import { ForgotPasswordModal } from './components/ForgotPasswordModal';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const {
    isAuthenticated,
    isAdmin,
    isGuest,
    currentPlayer,
    dataLoading,
    isForgotPasswordModalOpen,
    closeForgotPasswordModal
  } = useAuth();

  // App data state
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [settings, setSettings] = useState<ClubSettings>(DEFAULT_SETTINGS);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [isDataSyncing, setIsDataSyncing] = useState<boolean>(true);

  // Mobile Drawer Menu State
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Ref to track if initial demo seed has already run
  const hasSeededRef = useRef(false);

  // 1. Real-time Firestore Listeners (executed when user is authenticated or guest)
  useEffect(() => {
    if (!isAuthenticated) {
      setIsDataSyncing(false);
      return;
    }

    setIsDataSyncing(true);

    const unsubSettings = listenSettings((loadedSettings) => {
      setSettings(loadedSettings);
    });

    const unsubPlayers = listenPlayers((loadedPlayers) => {
      setPlayers(loadedPlayers);
      setIsDataSyncing(false);
    });

    const unsubMatches = listenMatches((loadedMatches) => {
      setMatches(loadedMatches);
      setIsDataSyncing(false);
    });

    return () => {
      unsubSettings();
      unsubPlayers();
      unsubMatches();
    };
  }, [isAuthenticated]);

  // Auto-seed if database is empty on first authenticated load
  useEffect(() => {
    if (!dataLoading && isAuthenticated && players.length === 0 && !hasSeededRef.current) {
      hasSeededRef.current = true;
      seedInitialPlayers().catch(console.error);
    }
  }, [dataLoading, isAuthenticated, players.length]);

  // 1. Initial auth loading state
  if (dataLoading && !isAuthenticated && !isGuest) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center justify-center text-2xl shadow-2xs">
          🎾
        </div>
        <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
          <span>Chargement de Padel Manager...</span>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated -> Login Screen with unique code entry & guest mode
  if (!isAuthenticated) {
    return (
      <>
        <LoginScreen />
        <ForgotPasswordModal
          isOpen={isForgotPasswordModalOpen}
          onClose={closeForgotPasswordModal}
          players={players}
        />
      </>
    );
  }

  // 3. Authenticated -> Full Application
  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 flex flex-col antialiased selection:bg-emerald-100 selection:text-emerald-900">
      {/* Header with Welcome message and Logout */}
      <Header 
        onOpenMobileMenu={() => setIsMobileDrawerOpen(true)}
      />

      {/* Main App Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-4 pb-28 md:pb-12">
        {/* Navigation Tabs (Desktop pills + Mobile bottom/drawer) */}
        <Navigation
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          matchesCount={matches.length}
          playersCount={players.length}
          isAdmin={isAdmin}
          isGuest={isGuest}
          isMobileDrawerOpen={isMobileDrawerOpen}
          setIsMobileDrawerOpen={setIsMobileDrawerOpen}
        />

        {/* Sync Loader for initial load */}
        {isDataSyncing && players.length === 0 && matches.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-12 text-center my-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              Synchronisation des données en direct...
            </h3>
            <p className="text-xs text-slate-400">
              Connexion sécurisée à Firestore.
            </p>
          </div>
        ) : (
          /* Active Views */
          <div>
            {activeTab === 'dashboard' && (
              <Dashboard
                matches={matches}
                players={players}
                settings={settings}
                isAdmin={isAdmin}
                isGuest={isGuest}
                currentPlayer={currentPlayer}
                onNavigateToMatches={() => setActiveTab('matches')}
                onNavigateToFinances={() => setActiveTab('finances')}
                onNavigateToPlayers={() => setActiveTab('players')}
              />
            )}

            {activeTab === 'matches' && (
              <Matches
                matches={matches}
                players={players}
                settings={settings}
                isAdmin={isAdmin}
                isGuest={isGuest}
                currentPlayer={currentPlayer}
              />
            )}

            {activeTab === 'players' && (
              <Players
                players={players}
                isAdmin={isAdmin}
                isGuest={isGuest}
                currentPlayer={currentPlayer}
              />
            )}

            {activeTab === 'finances' && (
              <Finances
                players={players}
                matches={matches}
                settings={settings}
                isAdmin={isAdmin}
              />
            )}

            {activeTab === 'settings' && (
              <Settings
                settings={settings}
                players={players}
                matchesCount={matches.length}
                isAdmin={isAdmin}
              />
            )}
          </div>
        )}
      </main>

      {/* Assistance Modal for Lost Code */}
      <ForgotPasswordModal
        isOpen={isForgotPasswordModalOpen}
        onClose={closeForgotPasswordModal}
        players={players}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
