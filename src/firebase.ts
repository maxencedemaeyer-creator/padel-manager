import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
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

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error("Erreur de connexion Google:", error);
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

export { onAuthStateChanged };
export type { User };
