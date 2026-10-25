// ─────────────────────────────────────────────────────────────────────────
// Outils partagés "rôles" des fonctions serveur (25/10/2026, chantier des
// rôles, étape 1 — sécurité). Fichier préfixé "_" : Vercel ne le publie pas
// comme une route, il est seulement importé par les autres fichiers /api.
//
// Rôles = pouvoirs : isAdmin, isCoach, isCreditor (+ isOwner = admin
// principal). Étiquettes protégées : isTest, isGuest (admin seul).
// Depuis cette étape, AUCUN de ces champs ne peut plus être modifié depuis
// un navigateur (voir firestore.rules) : seule la fonction serveur
// api/manage-roles.js les écrit, après avoir vérifié qui fait la demande.
// ─────────────────────────────────────────────────────────────────────────

// Champs que la base refuse de voir modifiés depuis un navigateur.
export const PROTECTED_ROLE_FIELDS = ["isAdmin", "isCoach", "isCreditor", "isOwner", "isTest", "isGuest"];

// Champs que api/manage-roles.js accepte de modifier. `isOwner` n'en fait
// volontairement pas partie : le rôle d'admin principal ne se transfère que
// manuellement, dans la console Firebase (décision du 20/09/2026).
export const EDITABLE_ROLE_FIELDS = ["isAdmin", "isCoach", "isCreditor", "isTest", "isGuest"];

function createdAtMillis(data) {
  const c = data && data.createdAt;
  if (!c) return Number.POSITIVE_INFINITY;
  if (typeof c.toMillis === "function") return c.toMillis();
  if (typeof c._seconds === "number") return c._seconds * 1000;
  if (typeof c.seconds === "number") return c.seconds * 1000;
  return Number.POSITIVE_INFINITY;
}

// Identifiant de l'admin principal : le joueur marqué `isOwner: true` (posé
// à la main dans la console Firebase), sinon — repli tant que personne
// n'est marqué — l'administrateur le plus ancien (premier compte admin
// créé, celui de Max). Ne lit que les fiches admin (quelques lectures),
// seulement quand une action sensible est demandée.
export async function getOwnerId(db) {
  const ownerSnap = await db.collection("players").where("isOwner", "==", true).get();
  const owners = ownerSnap.docs.filter((d) => d.data().archived !== true);
  if (owners.length > 0) return owners[0].id;

  const adminSnap = await db.collection("players").where("isAdmin", "==", true).get();
  const admins = adminSnap.docs
    .filter((d) => d.data().archived !== true)
    .sort((a, b) => {
      const diff = createdAtMillis(a.data()) - createdAtMillis(b.data());
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });
  return admins.length > 0 ? admins[0].id : null;
}

// Lit la fiche du joueur connecté (d'après son jeton de session) et indique
// s'il est administrateur actif.
export async function getActingAdmin(db, session) {
  if (!session) return null;
  const snap = await db.collection("players").doc(session.playerId).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (data.isAdmin !== true || data.archived === true) return null;
  return { id: snap.id, data };
}
