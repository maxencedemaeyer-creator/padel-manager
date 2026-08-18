/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  auth, 
  onAuthStateChanged, 
  User 
} from './firebase';
import { 
  Player, 
  Match, 
  ClubSettings, 
  CourtSlot, 
  SlotPosition, 
  PlayerRole 
} from './types';
import { 
  DEFAULT_SETTINGS,
  listenSettings, 
  listenPlayers, 
  listenMatches, 
  saveSettings, 
  savePlayer, 
  removePlayer, 
  saveMatch, 
  removeMatch, 
  updateSlotInMatch, 
  setSlotPaymentStatus,
  generateFullSeasonSchedule,
  seedInitialDemoData,
  linkPlayerAuth 
} from './services/padelService';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { Matches } from './components/Matches';
import { Players } from './components/Players';
import { Finances } from './components/Finances';
import { Settings } from './components/Settings';
import { AssignPlayerModal } from './components/AssignPlayerModal';
import { NewMatchModal } from './components/NewMatchModal';
import { AuthModal } from './components/AuthModal';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [settings, setSettings] = useState<ClubSettings>(DEFAULT_SETTINGS);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  // Match detail state for Matches view
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  // Auth linking modal state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [hasPromptedAuthModal, setHasPromptedAuthModal] = useState(false);

  // Slot Assignment Modal State
  const [activeSlotModal, setActiveSlotModal] = useState<{
    isOpen: boolean;
    match: Match | null;
    courtId: string;
    courtName: string;
    slot: CourtSlot | null;
  }>({
    isOpen: false,
    match: null,
    courtId: '',
    courtName: '',
    slot: null
  });

  // New Match Modal
  const [isNewMatchModalOpen, setIsNewMatchModalOpen] = useState(false);

  // Mobile Drawer Menu State
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Keep selectedMatch updated if matches change
  useEffect(() => {
    if (selectedMatch) {
      const updated = matches.find(m => m.id === selectedMatch.id);
      if (updated) {
        setSelectedMatch(updated);
      }
    }
  }, [matches]);

  // Auth Listener
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setHasPromptedAuthModal(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // Real-time Firestore Listeners
  useEffect(() => {
    let settingsLoaded = false;
    let playersLoaded = false;
    let matchesLoaded = false;

    const checkAllLoaded = () => {
      if (settingsLoaded && playersLoaded && matchesLoaded) {
        setLoading(false);
      }
    };

    const unsubSettings = listenSettings((loadedSettings) => {
      setSettings(loadedSettings);
      settingsLoaded = true;
      checkAllLoaded();
    });

    const unsubPlayers = listenPlayers((loadedPlayers) => {
      setPlayers(loadedPlayers);
      playersLoaded = true;
      checkAllLoaded();
    });

    const unsubMatches = listenMatches((loadedMatches) => {
      setMatches(loadedMatches);
      matchesLoaded = true;
      checkAllLoaded();
    });

    return () => {
      unsubSettings();
      unsubPlayers();
      unsubMatches();
    };
  }, []);

  // Auto-seed if database is empty on first load
  useEffect(() => {
    if (!loading && players.length === 0 && matches.length === 0) {
      seedInitialDemoData(settings).catch(console.error);
    }
  }, [loading, players.length, matches.length]);

  // Check if authenticated user is linked to any player in Firestore
  const linkedPlayer = players.find(p => 
    (user?.uid && p.authUid === user.uid) ||
    (user?.email && (
      (p.authEmail && p.authEmail.toLowerCase() === user.email.toLowerCase()) ||
      (p.email && p.email.toLowerCase() === user.email.toLowerCase())
    ))
  );

  // Trigger Auth modal when user signs in and is not linked
  useEffect(() => {
    if (!loading && user && !linkedPlayer && !hasPromptedAuthModal && players.length > 0) {
      setIsAuthModalOpen(true);
      setHasPromptedAuthModal(true);
    }
  }, [user, linkedPlayer, loading, hasPromptedAuthModal, players.length]);

  // Handle Profile Linking
  const handleLinkPlayer = async (playerId: string) => {
    if (!user) return;
    await linkPlayerAuth(playerId, user.uid, user.email || undefined);
    setIsAuthModalOpen(false);
  };

  const handleCreateAndLinkPlayer = async (name: string) => {
    if (!user) return;
    await savePlayer({
      name,
      role: 'player',
      advanceAmount: 0,
      email: user.email || '',
      authUid: user.uid,
      authEmail: user.email || ''
    });
    setIsAuthModalOpen(false);
  };

  // Calculate pending debt badge count
  const pendingDebtsTotal = matches.reduce((acc, m) => {
    let matchUnpaid = 0;
    m.courts.forEach(c => {
      c.slots.forEach(s => {
        if (s.playerId) {
          const p = players.find(x => x.id === s.playerId);
          if (p?.role !== 'creditor' && s.paymentStatus === 'pending') {
            matchUnpaid += m.pricePerPlayer || 12.50;
          }
        }
      });
    });
    return acc + matchUnpaid;
  }, 0);

  // Slot Click Handler
  const handleSlotClick = (match: Match, courtId: string, slot: CourtSlot) => {
    const court = match.courts.find(c => c.courtId === courtId);
    setActiveSlotModal({
      isOpen: true,
      match,
      courtId,
      courtName: court?.courtName || 'Terrain',
      slot
    });
  };

  // Quick Toggle Payment from court view
  const handleQuickTogglePayment = async (
    match: Match, 
    courtId: string, 
    slot: CourtSlot,
    e: React.MouseEvent
  ) => {
    if (!slot.playerId) return;
    const player = players.find(p => p.id === slot.playerId);
    if (player?.role === 'creditor') return; // Creditor is always auto-debited

    const newStatus = slot.paymentStatus === 'paid' ? 'pending' : 'paid';
    const creditors = players.filter(p => p.role === 'creditor');
    const creditorId = newStatus === 'paid' ? (creditors.length > 0 ? creditors[0].id : null) : null;

    await setSlotPaymentStatus(match.id, courtId, slot.position, newStatus, creditorId);
  };

  // Save Slot Assignment
  const handleSaveSlotAssignment = async (
    courtId: string,
    slot: CourtSlot,
    player: Player | null,
    paymentStatus: 'pending' | 'paid',
    paidToCreditorId: string | null
  ) => {
    if (!activeSlotModal.match) return;
    const creditors = players.filter(p => p.role === 'creditor');
    await updateSlotInMatch(
      activeSlotModal.match,
      courtId,
      slot.position,
      player,
      creditors,
      paymentStatus,
      paidToCreditorId
    );
  };

  // Quick Add Player from Modal
  const handleAddNewPlayerQuick = async (name: string, role: PlayerRole): Promise<Player> => {
    const newId = await savePlayer({
      name,
      role,
      advanceAmount: role === 'creditor' ? 1000 : 0
    });
    return {
      id: newId,
      name,
      role,
      advanceAmount: role === 'creditor' ? 1000 : 0
    };
  };

  // Settle Debt from Finances tab
  const handleSettleDebt = async (
    matchId: string,
    courtId: string,
    position: SlotPosition,
    paidToCreditorId: string
  ) => {
    await setSlotPaymentStatus(matchId, courtId, position, 'paid', paidToCreditorId);
  };

  // Open Match Detail
  const handleOpenMatchDetail = (match: Match) => {
    setSelectedMatch(match);
    setActiveTab('matches');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-sky-500 text-white flex items-center justify-center shadow-lg animate-bounce">
          🎾
        </div>
        <div className="flex items-center gap-2 text-slate-600 text-sm font-bold">
          <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
          Chargement de Padel Manager...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col antialiased selection:bg-sky-100 selection:text-sky-900">
      {/* Header */}
      <Header 
        user={user} 
        linkedPlayer={linkedPlayer}
        settings={settings} 
        activeMatchesCount={matches.length} 
        onOpenMobileMenu={() => setIsMobileDrawerOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
      />

      {/* Main Container with safe area padding for bottom navigation on mobile */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-3 sm:pt-4 pb-28 md:pb-12">
        {/* Navigation Tabs (Top pills on desktop + Drawer & Bottom bar on mobile) */}
        <Navigation
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            if (tab !== 'matches') {
              setSelectedMatch(null);
            }
          }}
          pendingDebtsCount={Math.round(pendingDebtsTotal)}
          matchesCount={matches.length}
          playersCount={players.length}
          onOpenNewMatchModal={() => setIsNewMatchModalOpen(true)}
          isMobileDrawerOpen={isMobileDrawerOpen}
          setIsMobileDrawerOpen={setIsMobileDrawerOpen}
        />

        {/* Tab Views */}
        <div>
          {activeTab === 'dashboard' && (
            <Dashboard
              user={user}
              matches={matches}
              players={players}
              settings={settings}
              onSelectTab={setActiveTab}
              onSlotClick={handleSlotClick}
              onOpenNewMatchModal={() => setIsNewMatchModalOpen(true)}
              onQuickTogglePayment={handleQuickTogglePayment}
              onOpenMatchDetail={handleOpenMatchDetail}
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
            />
          )}

          {activeTab === 'matches' && (
            <Matches
              matches={matches}
              players={players}
              settings={settings}
              selectedMatch={selectedMatch}
              onSelectMatch={setSelectedMatch}
              onSlotClick={handleSlotClick}
              onQuickTogglePayment={handleQuickTogglePayment}
              onSaveMatch={saveMatch}
              onDeleteMatch={removeMatch}
              onOpenNewMatchModal={() => setIsNewMatchModalOpen(true)}
            />
          )}

          {activeTab === 'players' && (
            <Players
              players={players}
              matches={matches}
              onSavePlayer={savePlayer}
              onDeletePlayer={removePlayer}
              onSeedDemoPlayers={() => seedInitialDemoData(settings)}
            />
          )}

          {activeTab === 'finances' && (
            <Finances
              players={players}
              matches={matches}
              settings={settings}
              onSettleDebt={handleSettleDebt}
            />
          )}

          {activeTab === 'settings' && (
            <Settings
              settings={settings}
              onSaveSettings={saveSettings}
              onGenerateSeason={(startDate) => generateFullSeasonSchedule(settings, startDate)}
              onSeedDemo={() => seedInitialDemoData(settings)}
            />
          )}
        </div>
      </main>

      {/* Assign Player Modal */}
      <AssignPlayerModal
        isOpen={activeSlotModal.isOpen}
        onClose={() => setActiveSlotModal({ ...activeSlotModal, isOpen: false })}
        courtId={activeSlotModal.courtId}
        courtName={activeSlotModal.courtName}
        slot={activeSlotModal.slot}
        match={activeSlotModal.match}
        players={players}
        onSave={handleSaveSlotAssignment}
        onAddNewPlayerQuick={handleAddNewPlayerQuick}
      />

      {/* New Match Modal */}
      <NewMatchModal
        isOpen={isNewMatchModalOpen}
        onClose={() => setIsNewMatchModalOpen(false)}
        settings={settings}
        matchesCount={matches.length}
        onSave={saveMatch}
      />

      {/* Auth Profile Linking Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        user={user}
        players={players}
        onLinkPlayer={handleLinkPlayer}
        onCreateAndLinkPlayer={handleCreateAndLinkPlayer}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
}
