// ─────────────────────────────────────────────────────────────────────────
// Présences ("Présent / Absent / Je ne sais pas encore") pour les matchs pas
// encore composés. Un joueur répond au niveau de la SESSION (date + heure),
// pas terrain par terrain — on écrit/lit donc la même réponse sur tous les
// terrains de la session, pour rester cohérent qu'il y en ait un ou deux.
//
// Présence ⇄ placement sur le terrain : dès qu'un joueur n'est plus déclaré
// "présent" (il répond "absent"/"je ne sais pas encore", ou sa réponse est
// réinitialisée), on le retire automatiquement de sa place sur le terrain —
// mais UNIQUEMENT s'il s'y est placé lui-même (participant.selfJoined ===
// true, voir CourtPanel.selfJoin). Une place attribuée par un admin
// (PickPlayerModal, placement rapide) n'a pas ce marqueur et n'est donc
// jamais touchée ici : la priorité admin est toujours conservée, quelle que
// soit la présence déclarée du joueur.
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

// Retire un joueur de sa place sur le terrain pour un match donné, mais
// seulement s'il s'y est placé lui-même (jamais une place attribuée par un
// admin). Retourne `null` si rien à changer, sinon le nouveau tableau
// `participants` à écrire.
function dropSelfJoinedSlot(match, playerId) {
  const participants = match.participants || [];
  const hasSelfSlot = participants.some(
    (p) => p.playerId === playerId && p.selfJoined === true
  );
  if (!hasSelfSlot) return null;
  return participants.filter((p) => !(p.playerId === playerId && p.selfJoined === true));
}

// Écrit la réponse d'un joueur sur TOUS les terrains de la session. Si la
// réponse n'est pas "présent", sa place éventuelle (auto-inscription
// uniquement) est libérée dans la foulée pour rester cohérent avec sa
// nouvelle réponse.
export async function setSessionAvailability(sessionMatches, playerId, status) {
  await Promise.all(
    (sessionMatches || []).map((m) => {
      const updates = { [`availability.${playerId}`]: status };
      if (status !== "present") {
        const nextParticipants = dropSelfJoinedSlot(m, playerId);
        if (nextParticipants) updates.participants = nextParticipants;
      }
      return updateDoc(doc(db, "matches", m.id), updates);
    })
  );
}

// Réinitialise la réponse d'un joueur sur TOUS les terrains de la session —
// on supprime complètement le champ (pas juste "unknown") pour qu'il
// redevienne "en attente" et doive répondre lui-même à nouveau. Comme il
// n'est alors plus déclaré "présent", sa place auto-inscrite (le cas
// échéant) est libérée en même temps — voir dropSelfJoinedSlot ci-dessus.
// Utilisable par le joueur lui-même ("Modifier ma réponse") ou par l'admin
// (voir ManagePresenceModal dans Availability.jsx).
export async function resetSessionAvailability(sessionMatches, playerId) {
  await Promise.all(
    (sessionMatches || []).map((m) => {
      const updates = { [`availability.${playerId}`]: deleteField() };
      const nextParticipants = dropSelfJoinedSlot(m, playerId);
      if (nextParticipants) updates.participants = nextParticipants;
      return updateDoc(doc(db, "matches", m.id), updates);
    })
  );
}
