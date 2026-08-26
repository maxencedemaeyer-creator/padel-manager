// ─────────────────────────────────────────────────────────────────────────
// Présences ("Présent / Absent / Je ne sais pas encore") pour les matchs pas
// encore composés. Un joueur répond au niveau de la SESSION (date + heure),
// pas terrain par terrain — on écrit/lit donc la même réponse sur tous les
// terrains de la session, pour rester cohérent qu'il y en ait un ou deux.
// ─────────────────────────────────────────────────────────────────────────
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { db } from "../firebase";

export const AVAILABILITY_STATUSES = ["present", "absent", "unknown"];

// Fusionne les réponses de tous les terrains d'une session : un joueur ne
// répond qu'une fois pour toute la session (même s'il y a 2 terrains ce
// jour-là). En cas de désynchronisation entre terrains, la première réponse
// trouvée fait foi.
export function getSessionAvailability(sessionMatches) {
  const merged = {};
  (sessionMatches || []).forEach((m) => {
    Object.entries(m.availability || {}).forEach(([playerId, status]) => {
      if (merged[playerId] === undefined) merged[playerId] = status;
    });
  });
  return merged;
}

// Classe tous les joueurs du club à partir des réponses de la session :
// - present / absent : ont explicitement répondu ainsi
// - pending : n'ont pas répondu OU ont répondu "je ne sais pas encore"
// - responded : tous ceux qui ont fait un choix (les 3 statuts confondus),
//   avec leur statut — utile pour la liste admin "qui a répondu".
export function getAvailabilityGroups(sessionMatches, players) {
  const availability = getSessionAvailability(sessionMatches);
  const present = [];
  const absent = [];
  const pending = [];
  const responded = [];

  (players || []).forEach((p) => {
    const status = availability[p.id];
    if (status === "present") present.push(p);
    else if (status === "absent") absent.push(p);
    else pending.push(p);
    if (status) responded.push({ player: p, status });
  });

  return { availability, present, absent, pending, responded };
}

// Écrit la réponse d'un joueur sur TOUS les terrains de la session.
export async function setSessionAvailability(sessionMatches, playerId, status) {
  await Promise.all(
    (sessionMatches || []).map((m) =>
      updateDoc(doc(db, "matches", m.id), { [`availability.${playerId}`]: status })
    )
  );
}

// Réinitialise la réponse d'un joueur sur TOUS les terrains de la session —
// on supprime complètement le champ (pas juste "unknown") pour qu'il
// redevienne "en attente" et doive répondre lui-même à nouveau. Réservé à
// l'admin (voir ManagePresenceModal dans Availability.jsx).
export async function resetSessionAvailability(sessionMatches, playerId) {
  await Promise.all(
    (sessionMatches || []).map((m) =>
      updateDoc(doc(db, "matches", m.id), { [`availability.${playerId}`]: deleteField() })
    )
  );
}
