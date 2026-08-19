import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
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
