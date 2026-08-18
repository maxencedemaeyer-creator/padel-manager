import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut, 
  signInAnonymously,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import configJson from '../firebase-applet-config.json';

// Support Vercel / production env variables with fallback to sandbox config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || configJson.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || configJson.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || configJson.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || configJson.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || configJson.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || configJson.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || configJson.measurementId || undefined,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with specific databaseId if provided
const firestoreDbId = import.meta.env.VITE_FIREBASE_DATABASE_ID || (
  configJson.firestoreDatabaseId && configJson.firestoreDatabaseId !== '(default)'
    ? configJson.firestoreDatabaseId 
    : undefined
);

export const db = firestoreDbId ? getFirestore(app, firestoreDbId) : getFirestore(app);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Check for redirect result on initialization
getRedirectResult(auth).catch((err) => {
  if (err && err.code !== 'auth/null-user') {
    console.warn("Info getRedirectResult:", err);
  }
});

/**
 * Google Sign In with popup and automatic fallback to redirect on popup blockers
 */
export const signInWithGoogle = async (autoFallbackToRedirect = false): Promise<User | null> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error("Erreur de connexion Google (popup):", error);
    
    // If popup is blocked, closed prematurely, or blocked by browser policy and fallback is allowed
    const isPopupBlockError = 
      error?.code === 'auth/popup-blocked' || 
      error?.code === 'auth/cancelled-popup-request' ||
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/operation-not-supported-in-this-environment';

    if (autoFallbackToRedirect && isPopupBlockError) {
      console.warn("Bascule automatique sur signInWithRedirect en raison de l'erreur popup:", error.code);
      await signInWithRedirect(auth, googleProvider);
      return null;
    }

    throw error;
  }
};

/**
 * Direct Google Sign In with Page Redirect
 */
export const signInWithGoogleRedirect = async (): Promise<void> => {
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (error: any) {
    console.error("Erreur de connexion Google (redirect):", error);
    throw error;
  }
};

export const signInGuest = async () => {
  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (error: any) {
    console.error("Erreur de connexion Invité:", error);
    throw error;
  }
};

export const logOut = async () => {
  try {
    await fbSignOut(auth);
  } catch (error) {
    console.error("Erreur de déconnexion:", error);
  }
};

export { onAuthStateChanged, getRedirectResult, signInWithRedirect };
export type { User };
