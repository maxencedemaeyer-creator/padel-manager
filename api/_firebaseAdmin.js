// ─────────────────────────────────────────────────────────────────────────
// Initialisation partagée du SDK Admin Firebase — utilisée UNIQUEMENT par
// les fonctions serveur de ce dossier /api (jamais envoyée au navigateur,
// contrairement à tout le code de src/). C'est ce SDK qui a le droit de lire
// et écrire dans Firestore en contournant complètement les règles de
// sécurité — d'où la nécessité de le garder strictement côté serveur.
//
// Nécessite la variable d'environnement FIREBASE_SERVICE_ACCOUNT sur Vercel,
// contenant le JSON complet téléchargé depuis Firebase Console
// (Paramètres du projet > Comptes de service > Générer une nouvelle clé
// privée). Voir les instructions fournies séparément pour la configurer.
// ─────────────────────────────────────────────────────────────────────────
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function getAdminApp() {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "Variable d'environnement FIREBASE_SERVICE_ACCOUNT manquante sur Vercel."
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT n'est pas un JSON valide — vérifiez que tout le contenu du fichier téléchargé a bien été collé."
    );
  }

  return initializeApp({ credential: cert(serviceAccount) });
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export { FieldValue };
