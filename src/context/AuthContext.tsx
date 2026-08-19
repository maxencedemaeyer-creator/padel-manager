import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { Player, UserRole, ClubSettings, DEFAULT_SETTINGS } from '../types';
import { listenPlayers, listenSettings, verifyPlayerCodeDirect } from '../services/padelService';

export interface AuthContextType {
  isAuthenticated: boolean;
  userRole: UserRole | null;
  isAdmin: boolean;
  isUser: boolean;
  isGuest: boolean;
  isCreditor: boolean;
  currentPlayer: Player | null;
  currentCode: string | null;
  players: Player[];
  settings: ClubSettings;
  dataLoading: boolean;
  loginWithCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  loginAsGuest: () => void;
  logout: () => void;
  openForgotPasswordModal: () => void;
  closeForgotPasswordModal: () => void;
  isForgotPasswordModalOpen: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SAVED_CODE_KEY = 'savedPadelCode';
const IS_GUEST_KEY = 'isPadelGuest';
const CACHED_PLAYERS_KEY = 'padel_cached_players';
const CACHED_SETTINGS_KEY = 'padel_cached_settings';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Instantly initialize state from cache for 0ms startup time
  const [players, setPlayers] = useState<Player[]>(() => {
    try {
      const cached = localStorage.getItem(CACHED_PLAYERS_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [settings, setSettings] = useState<ClubSettings>(() => {
    try {
      const cached = localStorage.getItem(CACHED_SETTINGS_KEY);
      return cached ? JSON.parse(cached) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [dataLoading, setDataLoading] = useState<boolean>(() => {
    // If we already have cached players or a guest session, no need for full-screen blocking loader
    const hasCachedPlayers = localStorage.getItem(CACHED_PLAYERS_KEY) !== null;
    const hasSavedCode = localStorage.getItem(SAVED_CODE_KEY) !== null;
    const isGuest = localStorage.getItem(IS_GUEST_KEY) === 'true';
    return !hasCachedPlayers && (hasSavedCode || isGuest);
  });

  const [currentCode, setCurrentCode] = useState<string | null>(() => {
    return localStorage.getItem(SAVED_CODE_KEY) || null;
  });

  const [isGuestMode, setIsGuestMode] = useState<boolean>(() => {
    return localStorage.getItem(IS_GUEST_KEY) === 'true';
  });

  const [isForgotPasswordModalOpen, setIsForgotPasswordModalOpen] = useState<boolean>(false);

  // 2. Real-time background subscriptions (syncs seamlessly without blocking user interactions)
  useEffect(() => {
    let active = true;

    const unsubPlayers = listenPlayers((newPlayers) => {
      if (!active) return;
      setPlayers(newPlayers);
      setDataLoading(false);
      try {
        localStorage.setItem(CACHED_PLAYERS_KEY, JSON.stringify(newPlayers));
      } catch (e) {
        console.warn("Storage quota info:", e);
      }
    });

    const unsubSettings = listenSettings((newSettings) => {
      if (!active) return;
      setSettings(newSettings);
      try {
        localStorage.setItem(CACHED_SETTINGS_KEY, JSON.stringify(newSettings));
      } catch (e) {
        console.warn("Storage quota info:", e);
      }
    });

    // Safety fallback: release any loading flag after 1.5s max
    const timer = setTimeout(() => {
      if (active) setDataLoading(false);
    }, 1500);

    return () => {
      active = false;
      clearTimeout(timer);
      unsubPlayers();
      unsubSettings();
    };
  }, []);

  // 3. Resolve role & current player
  const { matchedPlayer, effectiveRole } = useMemo(() => {
    if (isGuestMode) {
      return { matchedPlayer: null, effectiveRole: 'guest' as UserRole };
    }

    if (!currentCode) {
      return { matchedPlayer: null, effectiveRole: null };
    }

    const trimmedCode = currentCode.trim();

    // Master Admin Code "4812"
    if (trimmedCode === '4812') {
      const adminPlayer = players.find(p => p.isAdmin) || 
        players.find(p => p.name.toLowerCase().includes('maxence')) || 
        players[0] || null;
      return {
        matchedPlayer: adminPlayer,
        effectiveRole: 'admin' as UserRole
      };
    }

    // Player Access Code matching
    const player = players.find(p => (p.accessCode || '').trim() === trimmedCode);
    if (player) {
      return {
        matchedPlayer: player,
        effectiveRole: player.isAdmin ? ('admin' as UserRole) : ('user' as UserRole)
      };
    }

    // If code exists in storage but not found in current players list yet (e.g. fresh load before sync),
    // grant temporary session if we previously logged in with this code
    return { matchedPlayer: null, effectiveRole: null };
  }, [currentCode, isGuestMode, players]);

  // 4. Ultra-fast Login with Code (Memory search -> Direct Firestore lookup)
  const loginWithCode = useCallback(async (inputCode: string): Promise<{ success: boolean; error?: string }> => {
    const code = (inputCode || '').trim();
    if (!code) {
      return { success: false, error: 'Veuillez entrer un code.' };
    }

    // 1. Instant Master Admin Code check
    if (code === '4812') {
      localStorage.setItem(SAVED_CODE_KEY, code);
      localStorage.removeItem(IS_GUEST_KEY);
      setCurrentCode(code);
      setIsGuestMode(false);
      return { success: true };
    }

    // 2. Instant Cache / Memory Check
    const foundInMemory = players.find(p => (p.accessCode || '').trim() === code);
    if (foundInMemory) {
      localStorage.setItem(SAVED_CODE_KEY, code);
      localStorage.removeItem(IS_GUEST_KEY);
      setCurrentCode(code);
      setIsGuestMode(false);
      return { success: true };
    }

    // 3. Fast Direct Firestore Lookup Fallback
    try {
      const directPlayer = await verifyPlayerCodeDirect(code);
      if (directPlayer) {
        setPlayers(prev => {
          const exists = prev.some(p => p.id === directPlayer.id);
          return exists ? prev : [directPlayer, ...prev];
        });
        localStorage.setItem(SAVED_CODE_KEY, code);
        localStorage.removeItem(IS_GUEST_KEY);
        setCurrentCode(code);
        setIsGuestMode(false);
        return { success: true };
      }
    } catch (err) {
      console.warn("Direct lookup failed:", err);
    }

    return { success: false, error: 'Code incorrect. Réessayez.' };
  }, [players]);

  // 5. Login as Guest
  const loginAsGuest = useCallback(() => {
    localStorage.removeItem(SAVED_CODE_KEY);
    localStorage.setItem(IS_GUEST_KEY, 'true');
    setCurrentCode(null);
    setIsGuestMode(true);
  }, []);

  // 6. Logout
  const logout = useCallback(() => {
    localStorage.removeItem(SAVED_CODE_KEY);
    localStorage.removeItem(IS_GUEST_KEY);
    setCurrentCode(null);
    setIsGuestMode(false);
  }, []);

  const isAuthenticated = effectiveRole !== null;
  const isAdmin = effectiveRole === 'admin';
  const isUser = effectiveRole === 'user';
  const isGuest = effectiveRole === 'guest';
  const isCreditor = matchedPlayer?.isCreditor === true;

  const value = useMemo<AuthContextType>(() => ({
    isAuthenticated,
    userRole: effectiveRole,
    isAdmin,
    isUser,
    isGuest,
    isCreditor,
    currentPlayer: matchedPlayer,
    currentCode,
    players,
    settings,
    dataLoading,
    loginWithCode,
    loginAsGuest,
    logout,
    openForgotPasswordModal: () => setIsForgotPasswordModalOpen(true),
    closeForgotPasswordModal: () => setIsForgotPasswordModalOpen(false),
    isForgotPasswordModalOpen
  }), [
    isAuthenticated,
    effectiveRole,
    isAdmin,
    isUser,
    isGuest,
    isCreditor,
    matchedPlayer,
    currentCode,
    players,
    settings,
    dataLoading,
    loginWithCode,
    loginAsGuest,
    logout,
    isForgotPasswordModalOpen
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
