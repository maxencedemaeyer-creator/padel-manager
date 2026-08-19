import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { Player, UserRole, ClubSettings } from '../types';
import { listenPlayers, listenSettings } from '../services/padelService';

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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [settings, setSettings] = useState<ClubSettings>({
    matchFeePerPlayer: 10,
    courtNames: ['Terrain 1', 'Terrain 2'],
    seasonMatchesCount: 44,
    seasonDayOfWeek: 4,
    seasonDefaultTime: '20:00',
    clubName: 'Padel Manager',
    currency: '€'
  });
  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [currentCode, setCurrentCode] = useState<string | null>(() => {
    return localStorage.getItem(SAVED_CODE_KEY) || null;
  });
  const [isGuestMode, setIsGuestMode] = useState<boolean>(() => {
    return localStorage.getItem(IS_GUEST_KEY) === 'true';
  });
  const [isForgotPasswordModalOpen, setIsForgotPasswordModalOpen] = useState<boolean>(false);

  // 1. Subscribe to Players and Settings real-time
  useEffect(() => {
    let playersLoaded = false;
    let settingsLoaded = false;

    const checkAllLoaded = () => {
      if (playersLoaded && settingsLoaded) {
        setDataLoading(false);
      }
    };

    const unsubPlayers = listenPlayers((newPlayers) => {
      setPlayers(newPlayers);
      playersLoaded = true;
      checkAllLoaded();
    });

    const unsubSettings = listenSettings((newSettings) => {
      setSettings(newSettings);
      settingsLoaded = true;
      checkAllLoaded();
    });

    return () => {
      unsubPlayers();
      unsubSettings();
    };
  }, []);

  // 2. Identify player and role based on currentCode
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

    // Invalid code
    return { matchedPlayer: null, effectiveRole: null };
  }, [currentCode, isGuestMode, players]);

  // 3. Login with Code
  const loginWithCode = useCallback(async (inputCode: string): Promise<{ success: boolean; error?: string }> => {
    const code = (inputCode || '').trim();
    if (!code) {
      return { success: false, error: 'Veuillez entrer un code.' };
    }

    // Check if master admin code
    if (code === '4812') {
      localStorage.setItem(SAVED_CODE_KEY, code);
      localStorage.removeItem(IS_GUEST_KEY);
      setCurrentCode(code);
      setIsGuestMode(false);
      return { success: true };
    }

    // Check in players list
    const found = players.find(p => (p.accessCode || '').trim() === code);
    if (found) {
      localStorage.setItem(SAVED_CODE_KEY, code);
      localStorage.removeItem(IS_GUEST_KEY);
      setCurrentCode(code);
      setIsGuestMode(false);
      return { success: true };
    }

    return { success: false, error: 'Code incorrect. Réessayez.' };
  }, [players]);

  // 4. Login as Guest
  const loginAsGuest = useCallback(() => {
    localStorage.removeItem(SAVED_CODE_KEY);
    localStorage.setItem(IS_GUEST_KEY, 'true');
    setCurrentCode(null);
    setIsGuestMode(true);
  }, []);

  // 5. Logout
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
