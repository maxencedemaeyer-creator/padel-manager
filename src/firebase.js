// ─────────────────────────────────────────────────────────────────────────
// Configuration et initialisation Firebase — projet "Padel Manager".
// ⚠️ Remplacez firebaseConfig par la configuration de votre propre projet
// Firebase (Console Firebase > Paramètres du projet) si vous en créez un
// nouveau. Nécessite : npm install firebase
// ─────────────────────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported as analyticsIsSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getStorage } from "firebase/storage";

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
export const auth = getAuth(firebaseApp);
// Stockage des photos de profil (avatars) — voir src/lib/avatarUpload.js.
// ⚠️ Nécessite que "Cloud Storage" soit activé dans la Console Firebase
// (Storage > Get started) et que le projet soit sur le forfait Blaze
// (paiement à l'usage) — obligatoire depuis septembre 2024 pour provisionner
// le bucket, même si l'usage réel reste dans le palier gratuit vu la taille
// des fichiers ici (photos compressées à quelques centaines de Ko).
export const storage = getStorage(firebaseApp);

// ─────────────────────────────────────────────────────────────────────────
// Connexion Firebase anonyme automatique.
// Depuis la mise à jour des règles Firestore, lire ou écrire la moindre
// donnée exige un utilisateur authentifié — même anonyme. Ce mécanisme est
// entièrement invisible pour les joueurs : il ne remplace pas l'écran de
// connexion par code PIN de l'app (AuthGate), il tourne en coulisses dès le
// chargement de la page pour obtenir ce laissez-passer technique. Sans lui,
// plus aucune lecture/écriture Firestore n'est possible.
// ⚠️ Nécessite que l'authentification "Anonyme" soit activée dans la
// Console Firebase (Authentication > Sign-in method) — sinon toute l'app
// reste bloquée sur l'écran de chargement.
// ─────────────────────────────────────────────────────────────────────────
export const authReady = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user) {
      unsubscribe();
      resolve(user);
    }
  });
  signInAnonymously(auth).catch((error) => {
    console.error("Erreur de connexion Firebase (anonyme) :", error);
  });
});

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
// Jeton de session signé (voir api/_firebaseAdmin.js) associé au joueur
// connecté — exigé par api/manage-pin.js pour prouver son identité avant de
// changer un code PIN (le sien, ou celui d'un autre joueur si admin).
export const SESSION_TOKEN_KEY = "padelManagerSessionToken";
