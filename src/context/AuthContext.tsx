import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { User, onAuthStateChanged, signInWithGoogle, signInWithGoogleRedirect, signInGuest, logOut, auth } from '../firebase';
import { Player, UserRole } from '../types';
import { listenPlayers, linkPlayerAuth, unlinkPlayerAuth } from '../services/padelService';

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
  unlinkPlayer: () => Promise<void>;
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

  // Determine linked player strictly from players list with userId match
  const linkedPlayer = useMemo<Player | null>(() => {
    if (!user || user.isAnonymous) return null;
    const userEmail = user.email?.toLowerCase().trim();
    const userUid = user.uid;

    // 1. Strict primary match by userId / linkedUid / authUid
    let matched = activePlayers.find((p) => {
      if (p.userId && p.userId === userUid) return true;
      if (p.linkedUid && p.linkedUid === userUid) return true;
      if (p.authUid && p.authUid === userUid) return true;
      return false;
    });

    // 2. Secondary match by verified email if not already matched
    if (!matched && userEmail) {
      matched = activePlayers.find((p) => {
        if (p.linkedEmail && p.linkedEmail.toLowerCase().trim() === userEmail) return true;
        if (p.authEmail && p.authEmail.toLowerCase().trim() === userEmail) return true;
        if (p.email && p.email.toLowerCase().trim() === userEmail) return true;
        return false;
      });
    }

    // 3. Fallback to localStorage cache if players are loaded
    if (!matched && activePlayers.length > 0) {
      try {
        const cachedId = localStorage.getItem(`padel_linked_uid_${userUid}`);
        if (cachedId) {
          const cachedMatch = activePlayers.find((p) => p.id === cachedId);
          if (cachedMatch) matched = cachedMatch;
        }
      } catch (e) {
        // ignore
      }
    }

    return matched || null;
  }, [user, activePlayers]);

  // Auto-sync Firestore if matched by email or cache but userId wasn't set yet
  useEffect(() => {
    if (user && !user.isAnonymous && linkedPlayer && (!linkedPlayer.userId || linkedPlayer.userId !== user.uid)) {
      linkPlayerAuth(linkedPlayer.id, user.uid, user.email || undefined).catch((err) => {
        console.warn('Auto-healing player userId in Firestore:', err);
      });
    }
  }, [user, linkedPlayer]);

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
      if (user?.uid) {
        try {
          localStorage.removeItem(`padel_linked_uid_${user.uid}`);
        } catch (e) {}
      }
      await logOut();
    } catch (err) {
      console.error('Logout error:', err);
      throw err;
    }
  };

  const handleUnlinkPlayer = useCallback(async (): Promise<void> => {
    if (!linkedPlayer) return;
    try {
      await unlinkPlayerAuth(linkedPlayer.id, user?.uid);
      setIsAuthModalOpen(true);
    } catch (err) {
      console.error('Erreur déliaison profil:', err);
      throw err;
    }
  }, [linkedPlayer, user?.uid]);

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
      unlinkPlayer: handleUnlinkPlayer,
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
      handleUnlinkPlayer,
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
