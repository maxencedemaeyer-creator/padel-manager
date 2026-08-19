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

const CACHED_MATCHES_KEY = 'padel_cached_matches';

function AppContent() {
  const {
    isAuthenticated,
    isAdmin,
    isGuest,
    currentPlayer,
    dataLoading,
    players,
    settings,
    isForgotPasswordModalOpen,
    closeForgotPasswordModal
  } = useAuth();

  // App data state
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  
  // Instant load matches from localStorage cache for 0ms initial render
  const [matches, setMatches] = useState<Match[]>(() => {
    try {
      const cached = localStorage.getItem(CACHED_MATCHES_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  // Mobile Drawer Menu State
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Ref to track if initial demo seed has already run
  const hasSeededRef = useRef(false);

  // 1. Real-time Firestore Listeners for Matches (non-blocking)
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubMatches = listenMatches((loadedMatches) => {
      setMatches(loadedMatches);
      try {
        localStorage.setItem(CACHED_MATCHES_KEY, JSON.stringify(loadedMatches));
      } catch (e) {
        console.warn("Matches cache error:", e);
      }
    });

    return () => {
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

  // 1. Unauthenticated -> Login Screen with unique code entry & guest mode
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

  // 2. Authenticated -> Full Application
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

        {/* Active Views */}
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
