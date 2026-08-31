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
import { createHmac, timingSafeEqual } from "node:crypto";

let cachedServiceAccount = null;

function getServiceAccount() {
  if (cachedServiceAccount) return cachedServiceAccount;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "Variable d'environnement FIREBASE_SERVICE_ACCOUNT manquante sur Vercel."
    );
  }
  try {
    cachedServiceAccount = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT n'est pas un JSON valide — vérifiez que tout le contenu du fichier téléchargé a bien été collé."
    );
  }
  return cachedServiceAccount;
}

function getAdminApp() {
  const existing = getApps();
  if (existing.length > 0) return existing[0];
  return initializeApp({ credential: cert(getServiceAccount()) });
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export { FieldValue };

// ─────────────────────────────────────────────────────────────────────────
// Jeton de session signé — preuve, côté serveur, qu'un navigateur a bien
// réussi une vérification de code PIN pour un joueur donné.
//
// Pourquoi : avant ce mécanisme, rien n'empêchait un appel direct à
// api/manage-pin.js (action "set") avec l'id de N'IMPORTE QUEL joueur pour
// lui écraser son code PIN et se connecter à sa place — admin y compris,
// sans même passer par l'interface. Ce jeton, émis par verify-pin.js après
// une vérification de code réussie, est désormais exigé par manage-pin.js
// pour changer un code : soit on prouve qu'on EST le joueur concerné, soit
// on prouve qu'on est admin.
//
// Signé avec la clé privée du compte de service Firebase déjà configurée
// (FIREBASE_SERVICE_ACCOUNT) — pas besoin d'une variable d'environnement
// supplémentaire sur Vercel. Ce n'est PAS un jeton Firebase Auth, juste un
// mécanisme maison (HMAC-SHA256) réservé à cet unique usage.
// ─────────────────────────────────────────────────────────────────────────
const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 jours

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(payloadB64) {
  return createHmac("sha256", getServiceAccount().private_key)
    .update(payloadB64)
    .digest("base64url");
}

export function signSessionToken(playerId) {
  const payloadB64 = base64url(
    JSON.stringify({ playerId, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS })
  );
  return `${payloadB64}.${sign(payloadB64)}`;
}

// Renvoie { playerId, iat, exp } si le jeton est valide (signature correcte
// ET pas expiré), sinon null. Ne lève jamais d'exception : un jeton
// malformé/altéré/expiré est simplement traité comme absent.
export function verifySessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  let expected;
  try {
    expected = sign(payloadB64);
  } catch (e) {
    return null;
  }
  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch (e) {
    return null;
  }
  if (!payload || typeof payload.playerId !== "string" || typeof payload.exp !== "number") {
    return null;
  }
  if (Date.now() > payload.exp) return null;
  return payload;
}
