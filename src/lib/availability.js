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
import { doc, getDoc, updateDoc, deleteField, runTransaction } from "firebase/firestore";
import { db } from "../firebase";
import { COURT_SLOT_DEFS } from "./constants";
import { normalizeSide } from "./utils";
import { getMatchStart, getMatchTiming } from "./matchLogic";

export const AVAILABILITY_STATUSES = ["present", "absent", "unknown"];

// Statut supplémentaire, réservé à l'admin (voir ManagePresenceModal — jamais
// proposé au joueur lui-même, donc volontairement absent de
// AVAILABILITY_STATUSES) : "reserve" veut dire "présent, mais l'admin l'a
// volontairement mis en réserve" — même si la session n'est pas encore
// complète. Compte comme présent partout (compteur, groupe "présent"), mais
// n'est JAMAIS auto-placé (voir autoPlacePresentPlayer, qui n'est appelé que
// pour le statut "present") et perd sa place éventuelle comme n'importe quel
// statut différent de "present" (voir dropSelfJoinedSlot via
// setSessionAvailability). Un admin peut toujours le placer "à la main" sur
// le terrain ensuite (PickPlayerModal) : il rejoint alors naturellement les
// titulaires, puisque titulaire/réserve se déduit de la place occupée, pas du
// statut stocké.
export const RESERVE_STATUS = "reserve";

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

// Nombre de places total d'une session, tous terrains confondus (4 places
// par terrain, voir COURT_SLOT_DEFS) — ex : 1 terrain = 4 places, 2 terrains
// = 8 places. Sert à distinguer les présents "titulaires" (qui ont une
// place) des présents "en réserve" (au-delà de la capacité, voir plus bas).
export function getSessionCapacity(sessionMatches) {
  return COURT_SLOT_DEFS.length * (sessionMatches || []).length;
}

// Nombre de places encore libres dans la session, tous terrains confondus —
// même définition d'une place "libre" que autoPlacePresentPlayer (une place =
// un couple équipe + côté de COURT_SLOT_DEFS, libre tant que personne ne
// l'occupe). Sert à savoir si un joueur en réserve peut prendre la place d'un
// désistement (voir le bouton "Je prends la place" dans AvailabilityButtons).
export function getFreeSlotCount(sessionMatches) {
  let free = 0;
  (sessionMatches || []).forEach((m) => {
    const participants = m.participants || [];
    COURT_SLOT_DEFS.forEach((def) => {
      const taken = participants.some(
        (p) => p.team === def.team && p.courtSide === def.side
      );
      if (!taken) free += 1;
    });
  });
  return free;
}

// Tous les joueurs déjà assignés à une place sur l'un des terrains de la
// session, peu importe le terrain ou l'équipe (admin ou auto-inscription).
function getPlacedPlayerIds(sessionMatches) {
  const placed = new Set();
  (sessionMatches || []).forEach((m) => {
    (m.participants || []).forEach((p) => placed.add(p.playerId));
  });
  return placed;
}

// Classe tous les joueurs du club à partir des réponses de la session :
// - present / absent : ont explicitement répondu ainsi
// - pending : n'ont pas répondu OU ont répondu "je ne sais pas encore"
// - responded : tous ceux qui ont fait un choix (les 3 statuts confondus),
//   avec leur statut — utile pour la liste admin "qui a répondu".
//
// Présents "titulaires" vs "en réserve" : `present` reprend TOUS les
// présents, statut "present" ET statut "reserve" confondus (rien ne change
// pour les compteurs), mais on le sous-divise en `presentTitulaires` (ceux
// qui ont effectivement une place sur un terrain de la session, voir
// getPlacedPlayerIds ci-dessus) et `presentReserve` (tous les autres — sans
// place, que ce soit parce que la session est complète — voir
// getSessionCapacity — ou parce que l'admin les a explicitement mis en
// réserve, voir RESERVE_STATUS ci-dessus). Cette distinction se déduit
// entièrement de la place occupée (pas du statut stocké) : comme
// autoPlacePresentPlayer place chaque "present" sur une place libre dès qu'il
// répond et tant qu'il en reste, ça reflète naturellement l'ordre d'arrivée
// pour les présents "normaux", et respecte la mise en réserve volontaire de
// l'admin (jamais auto-placée) — y compris si l'admin le place quand même à
// la main ensuite, il rejoint alors les titulaires.
//
// Joueurs occasionnels (player.isOccasional === true) : totalement exclus de
// ces groupes (donc des listes ET des compteurs Présent/Absent/En attente)
// tant que personne — l'admin, via ManagePresenceModal — n'a explicitement
// répondu pour eux sur CETTE session. Dès qu'une réponse existe pour eux
// (présent, absent, ou même "je ne sais pas encore"), ils rentrent dans les
// groupes exactement comme n'importe quel autre joueur. Voir feature
// "joueurs occasionnels".
export function getAvailabilityGroups(sessionMatches, players) {
  const availability = getSessionAvailability(sessionMatches);
  const placedPlayerIds = getPlacedPlayerIds(sessionMatches);
  const present = [];
  const presentTitulaires = [];
  const presentReserve = [];
  const absent = [];
  const pending = [];
  const responded = [];

  (players || []).forEach((p) => {
    const status = availability[p.id];
    if (p.isOccasional && !status) return;
    if (status === "present" || status === RESERVE_STATUS) {
      present.push(p);
      if (placedPlayerIds.has(p.id)) presentTitulaires.push(p);
      else presentReserve.push(p);
    } else if (status === "absent") absent.push(p);
    else pending.push(p);
    if (status) responded.push({ player: p, status });
  });

  return {
    availability,
    present,
    presentTitulaires,
    presentReserve,
    capacity: getSessionCapacity(sessionMatches),
    absent,
    pending,
    responded,
  };
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

// Gel de présence avant match (ajouté le 19/09/2026, voir constants.js →
// DEFAULT_PRESENCE_LOCK_HOURS et AdminView.jsx → PresenceLockSettingCard) :
// vrai si `match` démarre dans moins de `lockHours` heures à l'instant
// `now`. Utilisé pour empêcher un joueur (jamais l'admin) de changer seul
// sa réponse une fois "présent"/"réserve" (voir AvailabilityButtons dans
// components/matches/Availability.jsx) ou de se désinscrire lui-même d'une
// place déjà obtenue (voir CourtPanel.selfLeave) — trop près du match, un
// désistement doit passer par l'équipe (WhatsApp) ou l'administrateur, qui
// lui garde toujours un accès total via ManagePresenceModal.
//
// Ne s'applique qu'aux matchs "upcoming" : un match "tbd" (date inconnue —
// on ne sait pas s'il aura lieu) n'est jamais concerné, et un match déjà
// "ongoing"/"finished" est couvert séparément par le verrouillage post-match
// existant (voir isLocked dans AvailabilityButtons). `lockHours` à 0 (ou
// non positif) désactive complètement le gel.
export function isPresenceFrozen(match, now, lockHours) {
  if (!match || !(lockHours > 0)) return false;
  if (getMatchTiming(match, now) !== "upcoming") return false;
  const hoursUntilStart = (getMatchStart(match).getTime() - now.getTime()) / 3600000;
  return hoursUntilStart <= lockHours;
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
//      "P1000", 0 = "Pas de niveau" — grille LEVELS corrigée le 18/09/2026,
//      voir claude/feature-ranking-padel-manager.md §7.4) face au numéro de
//      terrain : meilleur niveau → terrain le plus petit numéro (1), moins
//      bon niveau → terrain le plus grand numéro de la session — parmi les
//      places encore possibles après le filtre de côté ci-dessus.
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
// Relit chaque terrain au plus frais juste avant d'écrire, puis écrit dans
// une transaction Firestore (voir plus bas) : deux présences quasi
// simultanées ne peuvent plus se disputer la même place.
//
// Valeur de retour (ajoutée pour le bouton "Je prends la place" d'un joueur en
// réserve, voir AvailabilityButtons dans Availability.jsx — les appelants
// historiques, qui ignorent la valeur retournée, ne sont pas affectés) :
//   "placed"    — le joueur vient d'être placé sur une place libre ;
//   "already"   — il avait déjà une place (rien à faire) ;
//   "full"      — plus aucune place libre (session complète, ou place prise à
//                 l'instant par quelqu'un d'autre) ;
//   "elsewhere" — il est déjà engagé sur un autre match le même jour ;
//   "error"     — erreur technique (voir la console) ;
//   "invalid"   — appel sans session ou sans joueur.
//
// L'écriture finale se fait dans une transaction Firestore : si deux joueurs
// en réserve tentent de prendre la même place libre en même temps, un seul
// l'obtient — l'autre voit la place déjà occupée, retente sur une autre place
// libre s'il en reste, sinon reçoit "full". Le placement ne peut donc plus
// écraser celui d'un autre joueur.
export async function autoPlacePresentPlayer(sessionMatches, matches, player) {
  if (!sessionMatches?.length || !player) return "invalid";

  const sessionDate = sessionMatches[0].date;
  const sessionIds = new Set(sessionMatches.map((m) => m.id));
  const alreadyElsewhereToday = (matches || []).some(
    (m) =>
      !sessionIds.has(m.id) &&
      m.date === sessionDate &&
      (m.participants || []).some((p) => p.playerId === player.id)
  );
  if (alreadyElsewhereToday) return "elsewhere";

  // Jusqu'à 3 tentatives : si la place choisie est prise entre la lecture et
  // l'écriture (conflit détecté par la transaction), on relit tout et on
  // choisit une autre place libre.
  for (let attempt = 0; attempt < 3; attempt += 1) {
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
    if (alreadyPlaced) return "already";

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
    if (freeSlots.length === 0) return "full"; // session complète — le joueur reste "présent" non placé

    // Préférence n°2 : côté du joueur.
    const preferredSide = normalizeSide(player.preferredSide);
    const sideSlots =
      preferredSide === "Droite" || preferredSide === "Gauche"
        ? freeSlots.filter((slot) => slot.def.side === preferredSide)
        : [];
    const candidates = sideSlots.length > 0 ? sideSlots : freeSlots;

    // Préférence n°3 : niveau → numéro de terrain. On calcule le terrain
    // "idéal" du joueur en répartissant l'échelle de niveau (0 à 100, voir
    // LEVELS dans constants.js — 100 = P1000, le plus fort, depuis la
    // correction du 18/09/2026) linéairement sur le nombre de terrains de la
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
      const matchRef = doc(db, "matches", best.match.id);
      const outcome = await runTransaction(db, async (tx) => {
        const snap = await tx.get(matchRef);
        if (!snap.exists()) return "conflict";
        const current = snap.data().participants || [];
        if (current.some((p) => p.playerId === player.id)) return "already";
        const slotTaken = current.some(
          (p) => p.team === best.def.team && p.courtSide === best.def.side
        );
        if (slotTaken) return "conflict"; // quelqu'un vient de prendre cette place
        tx.update(matchRef, { participants: [...current, newParticipant] });
        return "placed";
      });
      if (outcome === "placed" || outcome === "already") return outcome;
      // "conflict" : on relit et on retente sur une autre place libre.
    } catch (e) {
      console.error("Erreur lors du placement automatique en composition :", e);
      return "error";
    }
  }
  return "full";
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
