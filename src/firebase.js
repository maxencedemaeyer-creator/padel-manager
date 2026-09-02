// ─────────────────────────────────────────────────────────────────────────
// Configuration et initialisation Firebase — projet "Padel Manager".
// ⚠️ Remplacez firebaseConfig par la configuration de votre propre projet
// Firebase (Console Firebase > Paramètres du projet) si vous en créez un
// nouveau. Nécessite : npm install firebase
// ─────────────────────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getStorage } from "firebase/storage";
// firebase/analytics est chargé plus bas via import() dynamique, pas en haut
// du fichier : Analytics n'est utile qu'après coup (statistiques d'usage) et
// n'a aucune raison de faire partie du code téléchargé et exécuté AVANT que
// l'app puisse s'afficher. Un import statique ici l'aurait inclus dans le
// même gros bloc de code que Firebase Auth/Firestore, chargé en premier.

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

// ─────────────────────────────────────────────────────────────────────────
// Cache local persistant (IndexedDB) pour Firestore.
// Sans lui, chaque ouverture de l'app (même par un joueur qui l'a déjà
// utilisée cent fois sur le même téléphone) repart de zéro : il faut
// attendre une réponse du réseau avant de pouvoir afficher le moindre
// joueur ou match. Avec ce cache, le navigateur/téléphone garde une copie
// locale des dernières données reçues (sur son propre appareil, jamais
// partagée) : l'app peut donc s'afficher quasi instantanément avec ces
// données, puis se met à jour dès que la réponse réseau arrive — au lieu
// d'attendre le réseau pour tout afficher d'un coup. Firebase reste la seule
// source de vérité : rien n'est perdu si le cache est vidé ou si l'app est
// ouverte sur un nouvel appareil, l'app se comporte alors juste comme avant
// (attend le réseau une première fois).
// persistentMultipleTabManager : évite une erreur si l'app est ouverte dans
// plusieurs onglets du même navigateur en même temps (ex. l'admin sur PC ET
// sur son téléphone dans le même navigateur) — les onglets partagent alors
// le même cache local au lieu de se bloquer mutuellement.
// Filet de sécurité : certains contextes (navigation privée très
// restrictive de certains navigateurs, très vieux navigateurs) ne supportent
// pas IndexedDB — dans ce cas on retombe simplement sur le comportement
// standard précédent (cache en mémoire uniquement, comme avant ce
// changement) plutôt que de bloquer l'app.
let firestoreDb;
try {
  firestoreDb = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (error) {
  console.warn(
    "Cache Firestore local (IndexedDB) indisponible sur cet appareil, retour au mode standard :",
    error
  );
  firestoreDb = getFirestore(firebaseApp);
}
export const db = firestoreDb;
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
// import() dynamique (au lieu d'un import statique en haut du fichier) :
// le code d'Analytics n'est ainsi téléchargé qu'APRÈS que le reste de l'app
// a déjà pu s'afficher, dans un fichier séparé, au lieu d'alourdir le
// morceau de code chargé en tout premier (celui qui bloque l'affichage
// initial de l'app).
export let analytics;
if (typeof window !== "undefined") {
  import("firebase/analytics")
    .then(({ getAnalytics, isSupported }) =>
      isSupported().then((supported) => {
        if (supported) analytics = getAnalytics(firebaseApp);
      })
    )
    .catch(() => {
      // Analytics non disponible dans cet environnement : on ignore.
    });
}

export const SESSION_KEY = "padelManagerSession";
// Jeton de session signé (voir api/_firebaseAdmin.js) associé au joueur
// connecté — exigé par api/manage-pin.js pour prouver son identité avant de
// changer un code PIN (le sien, ou celui d'un autre joueur si admin).
export const SESSION_TOKEN_KEY = "padelManagerSessionToken";
