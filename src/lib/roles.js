// ─────────────────────────────────────────────────────────────────────────
// Rôles côté application (25/10/2026, chantier des rôles, étape 1).
//
// Depuis cette étape, les rôles (isAdmin, isCoach, isCreditor, isOwner) et
// les étiquettes protégées (isTest, isGuest) ne s'écrivent plus jamais
// directement dans Firestore depuis le navigateur : firestore.rules le
// refuse. Ils passent par la fonction serveur api/manage-roles.js, qui
// vérifie qui fait la demande.
//
// Les fonctions ci-dessous servent seulement à l'AFFICHAGE (montrer ou non
// une case à cocher) ; la vraie décision est toujours prise par le serveur.
// ─────────────────────────────────────────────────────────────────────────

function createdAtMillis(p) {
  const c = p && p.createdAt;
  if (!c) return Number.POSITIVE_INFINITY;
  if (typeof c.toMillis === "function") return c.toMillis();
  if (typeof c.seconds === "number") return c.seconds * 1000;
  return Number.POSITIVE_INFINITY;
}

// Même règle que api/_roles.js → getOwnerId : le joueur marqué `isOwner`,
// sinon l'administrateur le plus ancien.
export function getOwnerId(players) {
  const active = (players || []).filter((p) => !p.archived);
  const owner = active.find((p) => p.isOwner === true);
  if (owner) return owner.id;
  const admins = active
    .filter((p) => p.isAdmin === true)
    .sort((a, b) => {
      const diff = createdAtMillis(a) - createdAtMillis(b);
      return diff !== 0 ? diff : String(a.id).localeCompare(String(b.id));
    });
  return admins.length > 0 ? admins[0].id : null;
}

// Envoie au serveur une liste de changements de rôles :
// updates = [{ playerId, changes: { isCreditor: true, ... } }]
// Ne fait rien (et ne coûte rien) si la liste est vide.
export async function updateRoles(sessionToken, updates) {
  const useful = (updates || []).filter((u) => u && u.changes && Object.keys(u.changes).length > 0);
  if (useful.length === 0) return { ok: true, changed: 0 };
  const response = await fetch("/api/manage-roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actingToken: sessionToken, updates: useful }),
  });
  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error("Le serveur n'a pas répondu correctement.");
  }
  if (!data.ok) throw new Error(data.error || "Changement de rôle refusé.");
  return data;
}
