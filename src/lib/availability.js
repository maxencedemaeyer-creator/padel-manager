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
import { doc, getDoc, updateDoc, deleteField } from "firebase/firestore";
import { db } from "../firebase";
import { COURT_SLOT_DEFS } from "./constants";
import { normalizeSide } from "./utils";

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

// Reproduit le tri par numéro de terrain de matchLogic.js (courtSortKey /
// compareByCourt, qui n'y sont pas exportées) — nécessaire ici pour classer
// les terrains de la session du plus petit numéro au plus grand avant d'y
// répartir les joueurs par niveau (voir plus bas). Logique identique,
// dupliquée volontairement plutôt qu'exportée, pour ne pas devoir modifier
// matchLogic.js pour ce seul usage.
function courtNumber(match) {
  const location = match.location || "";
  const numMatch = location.match(/(\d+)\s*$/);
  return numMatch ? Number(numMatch[1]) : null;
}
function compareByCourtNumber(a, b) {
  const na = courtNumber(a);
  const nb = courtNumber(b);
  if (na != null && nb != null && na !== nb) return na - nb;
  if (na != null && nb == null) return -1;
  if (na == null && nb != null) return 1;
  return (a.location || "").localeCompare(b.location || "");
}

// Place automatiquement un joueur qui vient de répondre "présent" sur une
// place encore libre de la session — pour que l'admin n'ait plus à composer
// à la main chaque joueur qui a déjà dit présent. Marqué `selfJoined: true`
// comme une auto-inscription classique : entièrement modifiable/retirable
// par l'admin (PickPlayerModal) avant publication, et automatiquement
// libéré si le joueur change sa réponse (voir dropSelfJoinedSlot ci-dessus)
// — jamais prioritaire sur un placement admin.
//
// Ordre de préférence pour CHOISIR la place, dans cet ordre :
//   1. Une place disponible, obligatoirement — on ne laisse jamais un
//      joueur "présent" sans place tant qu'il en reste une libre quelque
//      part dans la session (tous terrains confondus).
//   2. Le côté du joueur (Droite/Gauche, voir player.preferredSide) — s'il
//      reste une place libre de son côté, elle est privilégiée. "Polyvalent"
//      (et toute valeur non reconnue) n'a pas de préférence de côté. Si
//      aucune place de son côté n'est libre, on retombe sur n'importe quelle
//      place libre plutôt que de faire attendre le joueur.
//   3. Le niveau du joueur (player.levelSortValue, 100 = meilleur niveau
//      "P50", 0 = "Pas de niveau") face au numéro de terrain : meilleur
//      niveau → terrain le plus petit numéro (1), moins bon niveau →
//      terrain le plus grand numéro de la session — parmi les places encore
//      possibles après le filtre de côté ci-dessus.
//
// Contrainte absolue : on ne choisit JAMAIS qu'une place réellement libre —
// on ne déplace ni ne remplace jamais un joueur déjà placé, même pour
// respecter au mieux les préférences 2 et 3 ci-dessus. Si la place idéale
// est prise, on place simplement le joueur ailleurs.
//
// Règle qui prime sur tout le reste : "premier présent, premier placé" —
// les préférences de côté/niveau ne servent qu'à choisir LA place de CE
// joueur au moment où il répond, jamais à retarder son placement ni à
// réorganiser ceux déjà placés avant lui. Une fois tous les terrains
// complets, les présents suivants restent "présents" sans être placés
// (visible en clair, pas en gras, dans RespondedPlayersPanel) — comme
// avant, juste atteint plus tard puisque les places se remplissent
// automatiquement. L'admin garde évidemment la main pour tout réorganiser
// à la main avant de publier.
//
// Ne place jamais un joueur déjà engagé ailleurs le même jour (même garde
// que l'auto-inscription classique, voir CourtPanel.alreadyElsewhereToday).
// Relit chaque terrain au plus frais juste avant d'écrire pour réduire le
// risque de collision entre deux présences quasi simultanées — l'app
// n'utilise de transaction Firestore nulle part ailleurs non plus, donc un
// risque résiduel (rare, faible groupe de joueurs) subsiste, cohérent avec
// le reste du code.
export async function autoPlacePresentPlayer(sessionMatches, matches, player) {
  if (!sessionMatches?.length || !player) return;

  const sessionDate = sessionMatches[0].date;
  const sessionIds = new Set(sessionMatches.map((m) => m.id));
  const alreadyElsewhereToday = (matches || []).some(
    (m) =>
      !sessionIds.has(m.id) &&
      m.date === sessionDate &&
      (m.participants || []).some((p) => p.playerId === player.id)
  );
  if (alreadyElsewhereToday) return;

  const freshDocs = await Promise.all(
    sessionMatches.map((m) => getDoc(doc(db, "matches", m.id)))
  );
  const freshMatches = freshDocs
    .filter((d) => d.exists())
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort(compareByCourtNumber); // terrain 1, puis 2, etc. — nécessaire pour le critère de niveau ci-dessous

  const alreadyPlaced = freshMatches.some((m) =>
    (m.participants || []).some((p) => p.playerId === player.id)
  );
  if (alreadyPlaced) return;

  // Toutes les places encore libres de la session, tous terrains confondus.
  const freeSlots = [];
  freshMatches.forEach((match, courtIndex) => {
    const participants = match.participants || [];
    COURT_SLOT_DEFS.forEach((def) => {
      const taken = participants.some(
        (p) => p.team === def.team && p.courtSide === def.side
      );
      if (!taken) freeSlots.push({ match, participants, def, courtIndex });
    });
  });
  if (freeSlots.length === 0) return; // session complète — le joueur reste "présent" non placé

  // Préférence n°2 : côté du joueur.
  const preferredSide = normalizeSide(player.preferredSide);
  const sideSlots =
    preferredSide === "Droite" || preferredSide === "Gauche"
      ? freeSlots.filter((slot) => slot.def.side === preferredSide)
      : [];
  const candidates = sideSlots.length > 0 ? sideSlots : freeSlots;

  // Préférence n°3 : niveau → numéro de terrain. On calcule le terrain
  // "idéal" du joueur en répartissant l'échelle de niveau (0 à 100, voir
  // LEVELS dans constants.js) linéairement sur le nombre de terrains de la
  // session, puis on choisit, parmi les places encore possibles, celle dont
  // le terrain est le plus proche de cet idéal (à égalité, le plus petit
  // numéro l'emporte).
  const courtCount = freshMatches.length;
  const levelValue = typeof player.levelSortValue === "number" ? player.levelSortValue : 0;
  const idealCourtIndex =
    courtCount > 1 ? Math.round(((100 - levelValue) / 100) * (courtCount - 1)) : 0;

  let best = candidates[0];
  let bestDistance = Math.abs(best.courtIndex - idealCourtIndex);
  for (const slot of candidates) {
    const distance = Math.abs(slot.courtIndex - idealCourtIndex);
    if (distance < bestDistance || (distance === bestDistance && slot.courtIndex < best.courtIndex)) {
      best = slot;
      bestDistance = distance;
    }
  }

  const newParticipant = {
    playerId: player.id,
    name: player.name,
    paidStatus: "unpaid",
    creditorId: null,
    team: best.def.team,
    courtSide: best.def.side,
    selfJoined: true,
  };
  try {
    await updateDoc(doc(db, "matches", best.match.id), {
      participants: [...best.participants, newParticipant],
    });
  } catch (e) {
    console.error("Erreur lors du placement automatique en composition :", e);
  }
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
