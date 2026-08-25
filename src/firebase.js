// ─────────────────────────────────────────────────────────────────────────
// Configuration et initialisation Firebase — projet "Padel Manager".
// ⚠️ Remplacez firebaseConfig par la configuration de votre propre projet
// Firebase (Console Firebase > Paramètres du projet) si vous en créez un
// nouveau. Nécessite : npm install firebase
// ─────────────────────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported as analyticsIsSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCGKon9mVdOn0FIBY3BvtVX9DPiudF6LJA",
  authDomain: "padel-manager-6f6f3.firebaseapp.com",
  projectId: "padel-manager-6f6f3",
  storageBucket: "padel-manager-6f6f3.firebasestorage.app",
  messagingSenderId: "42822367197",
  appId: "1:42822367197:web:d1fca198e220f1f7602834",
  measurementId: "G-14KPMP7L30",
};

const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);

// Analytics : chargé uniquement côté navigateur, et seulement si le
// contexte le supporte (évite toute erreur en SSR ou navigateurs restrictifs).
export let analytics;
if (typeof window !== "undefined") {
  analyticsIsSupported()
    .then((supported) => {
      if (supported) analytics = getAnalytics(firebaseApp);
    })
    .catch(() => {
      // Analytics non disponible dans cet environnement : on ignore.
    });
}

export const SESSION_KEY = "padelManagerSession";
export const ADMIN_MASTER_CODE = "4812"; // Code admin de secours (Maxence)
