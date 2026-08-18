import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { User, onAuthStateChanged, signInWithGoogle, signInWithGoogleRedirect, signInGuest, logOut, auth } from '../firebase';
import { Player, UserRole } from '../types';
import { listenPlayers } from '../services/padelService';

export interface AuthContextType {
  user: User | null;
  authChecked: boolean;
  role: UserRole; // 'admin' | 'user' | 'guest'
  isAdmin: boolean;
  isUser: boolean;
  isGuest: boolean;
  isCreditor: boolean;
  currentUserPlayerId: string | null;
  linkedPlayer: Player | null;
  loginWithGoogle: (autoFallback?: boolean) => Promise<User | null>;
  loginWithGoogleRedirect: () => Promise<void>;
  loginAsGuest: () => Promise<User | null>;
  logout: () => Promise<void>;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Admin email identifiers (case-insensitive)
const ADMIN_EMAILS = [
  'maxence.de.maeyer@gmail.com',
  'maxencedemaeyer@gmail.com'
];

interface AuthProviderProps {
  children: React.ReactNode;
  players?: Player[];
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, players: propPlayers }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [internalPlayers, setInternalPlayers] = useState<Player[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  // Listen to players only once auth is checked and user is active (if not supplied via prop)
  useEffect(() => {
    if (propPlayers !== undefined) return;
    if (!authChecked || !user) {
      setInternalPlayers([]);
      return;
    }
    const unsub = listenPlayers(
      (loaded) => setInternalPlayers(loaded),
      () => {}
    );
    return () => unsub();
  }, [authChecked, user?.uid, propPlayers]);

  const activePlayers = propPlayers !== undefined ? propPlayers : internalPlayers;

  // Determine linked player from players list
  const linkedPlayer = useMemo<Player | null>(() => {
    if (!user) return null;
    const userEmail = user.email?.toLowerCase().trim();
    const userUid = user.uid;

    const matched = activePlayers.find((p) => {
      if (p.linkedUid && p.linkedUid === userUid) return true;
      if (p.authUid && p.authUid === userUid) return true;
      if (userEmail) {
        if (p.linkedEmail && p.linkedEmail.toLowerCase().trim() === userEmail) return true;
        if (p.authEmail && p.authEmail.toLowerCase().trim() === userEmail) return true;
        if (p.email && p.email.toLowerCase().trim() === userEmail) return true;
      }
      return false;
    });

    return matched || null;
  }, [user, activePlayers]);

  // Determine RBAC permissions
  const { role, isAdmin, isUser, isGuest, isCreditor } = useMemo(() => {
    if (!user || user.isAnonymous) {
      return {
        role: 'guest' as UserRole,
        isAdmin: false,
        isUser: false,
        isGuest: true,
        isCreditor: false
      };
    }

    const email = user.email?.toLowerCase().trim() || '';
    const hasAdminEmail = ADMIN_EMAILS.some(adminEmail => email === adminEmail || email.includes('maxence.de.maeyer') || email.includes('maxencedemaeyer'));
    const isPlayerAdmin = Boolean(linkedPlayer?.isAdmin);

    const adminStatus = hasAdminEmail || isPlayerAdmin;

    return {
      role: adminStatus ? ('admin' as UserRole) : ('user' as UserRole),
      isAdmin: adminStatus,
      isUser: !adminStatus,
      isGuest: false,
      isCreditor: linkedPlayer?.role === 'creditor'
    };
  }, [user, linkedPlayer]);

  const currentUserPlayerId = linkedPlayer?.id || null;

  const handleLoginWithGoogle = async (autoFallback = true): Promise<User | null> => {
    try {
      const loggedUser = await signInWithGoogle(autoFallback);
      return loggedUser;
    } catch (err) {
      console.error('Login with Google error:', err);
      throw err;
    }
  };

  const handleLoginWithGoogleRedirect = async (): Promise<void> => {
    try {
      await signInWithGoogleRedirect();
    } catch (err) {
      console.error('Login with Google Redirect error:', err);
      throw err;
    }
  };

  const handleLoginAsGuest = async (): Promise<User | null> => {
    try {
      const guestUser = await signInGuest();
      return guestUser;
    } catch (err) {
      console.error('Login as guest error:', err);
      throw err;
    }
  };

  const handleLogout = async (): Promise<void> => {
    try {
      await logOut();
    } catch (err) {
      console.error('Logout error:', err);
      throw err;
    }
  };

  const value = useMemo(
    () => ({
      user,
      authChecked,
      role,
      isAdmin,
      isUser,
      isGuest,
      isCreditor,
      currentUserPlayerId,
      linkedPlayer,
      loginWithGoogle: handleLoginWithGoogle,
      loginWithGoogleRedirect: handleLoginWithGoogleRedirect,
      loginAsGuest: handleLoginAsGuest,
      logout: handleLogout,
      isAuthModalOpen,
      setIsAuthModalOpen,
      openAuthModal: () => setIsAuthModalOpen(true),
      closeAuthModal: () => setIsAuthModalOpen(false)
    }),
    [
      user,
      authChecked,
      role,
      isAdmin,
      isUser,
      isGuest,
      isCreditor,
      currentUserPlayerId,
      linkedPlayer,
      isAuthModalOpen
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
