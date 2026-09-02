// ─────────────────────────────────────────────────────────────────────────
// Game Center — Jeu "Homme du match" : après un match, chaque joueur peut
// élire l'homme du match PARMI LES JOUEURS DE SON PROPRE TERRAIN (sa
// composition à lui, pas toute la session s'il y a plusieurs terrains).
//
// Règles :
// - Le vote s'ouvre MVP_VOTE_OPENS_HOURS_AFTER_START heure(s) après le DÉBUT
//   du match, et reste ouvert jusqu'à 23h59 le LENDEMAIN (jour calendrier)
//   de la date du match — voir getMvpWindow.
// - Un joueur ne peut voter qu'une seule fois par match, et son vote n'est
//   plus modifiable ensuite (voir castMvpVote, transaction Firestore).
// - Passé le délai, le vainqueur (le plus de voix) est affiché dans le jeu
//   jusqu'au prochain match du joueur — ce "jusqu'au prochain match" est
//   naturel ici : dès qu'un match plus récent a commencé, il devient le
//   nouveau "match de référence" (voir getReferenceMatch), donc l'ancien
//   résultat disparaît de lui-même sans logique de date supplémentaire.
// - En cas d'égalité entre plusieurs joueurs, aucun vainqueur n'est désigné
//   (voir computeMvpWinner) plutôt que de trancher arbitrairement.
// - Les votes sont stockés dans la nouvelle collection Firestore "mvpVotes"
//   (un document par match, id du document = id du match), champ "votes" =
//   { voterId: candidateId }. Nouveau bloc dédié dans firestore.rules (comme
//   "killerMissions") — à recopier manuellement dans Firebase Console.
// ─────────────────────────────────────────────────────────────────────────
import {
  doc,
  getDoc,
  getDocs,
  collection,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { getMatchStart } from "./matchLogic";
import { MVP_VOTE_OPENS_HOURS_AFTER_START, MVP_BADGE_WINDOW_DAYS } from "./constants";

function voteDocRef(matchId) {
  return doc(db, "mvpVotes", matchId);
}

// Tous les matchs où ce joueur est réellement composé (peu importe la date).
function getPlayerMatches(matches, playerId) {
  return (matches || []).filter((m) =>
    (m.participants || []).some((p) => p.playerId === playerId)
  );
}

// Les 2 instants clés du vote pour un match donné.
export function getMvpWindow(match) {
  const start = getMatchStart(match);
  const opensAt = new Date(start.getTime() + MVP_VOTE_OPENS_HOURS_AFTER_START * 3600000);
  // 23:59:59 le LENDEMAIN (jour calendrier) de la date du match — pas
  // simplement "+24h" depuis le début, pour qu'un match tardif le soir
  // garde bien toute sa journée de lendemain, comme demandé.
  const matchDay = new Date(`${match.date}T00:00:00`);
  const votingDeadline = new Date(matchDay.getTime() + 2 * 86400000 - 1000);
  return { start, opensAt, votingDeadline };
}

// Le "match de référence" pour l'affichage du jeu chez ce joueur : le
// dernier de ses matchs déjà commencé (start <= now). Dès qu'un match plus
// récent a commencé à son tour, il prend automatiquement le relais — voir
// le commentaire en tête de fichier.
function getReferenceMatch(matches, playerId, now) {
  const started = getPlayerMatches(matches, playerId)
    .filter((m) => getMatchStart(m) <= now)
    .sort((a, b) => getMatchStart(b) - getMatchStart(a));
  return started[0] || null;
}

// status vaut :
// - "not-present" : aucun match encore commencé ne concerne ce joueur
// - "too-early"   : un match le concerne, mais le vote n'est pas encore ouvert
// - "voting"      : le vote est en cours
// - "closed"      : le vote est clôturé — vainqueur à afficher (voir
//                   computeMvpWinner)
export function getMvpStatus(matches, playerId, now = new Date()) {
  const match = getReferenceMatch(matches, playerId, now);
  if (!match) return { status: "not-present" };
  const window = getMvpWindow(match);
  if (now < window.opensAt) return { status: "too-early", match, window };
  if (now <= window.votingDeadline) return { status: "voting", match, window };
  return { status: "closed", match, window };
}

// Lit (sans en créer) les votes existants pour un match.
export async function fetchMvpVotes(matchId) {
  const snap = await getDoc(voteDocRef(matchId));
  return snap.exists() ? snap.data() : { votes: {} };
}

// Vote transactionnel : un seul vote par joueur et par match. Si le joueur a
// déjà voté, on ne change rien (son premier vote reste définitif) et on
// renvoie simplement l'état actuel des votes.
export async function castMvpVote(matchId, voterId, candidateId) {
  const ref = voteDocRef(matchId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? snap.data().votes || {} : {};
    if (current[voterId]) return current;
    const nextVotes = { ...current, [voterId]: candidateId };
    tx.set(ref, { matchId, votes: nextVotes, updatedAt: serverTimestamp() }, { merge: true });
    return nextVotes;
  });
}

// Vainqueur à partir d'une carte de votes {voterId: candidateId} : le(s)
// candidat(s) avec le plus de voix. En cas d'égalité entre plusieurs
// joueurs, aucun vainqueur n'est désigné (tie: true) plutôt que de trancher
// arbitrairement.
export function computeMvpWinner(votes) {
  const counts = new Map();
  Object.values(votes || {}).forEach((candidateId) => {
    counts.set(candidateId, (counts.get(candidateId) || 0) + 1);
  });
  if (counts.size === 0) return { winnerId: null, tie: false, counts };
  let max = 0;
  counts.forEach((c) => {
    if (c > max) max = c;
  });
  const top = [...counts.entries()].filter(([, c]) => c === max).map(([id]) => id);
  if (top.length > 1) return { winnerId: null, tie: true, counts };
  return { winnerId: top[0], tie: false, counts };
}

// Bandeau "Bravo, tu as été élu..." (MyMatchSummary.jsx) : cherche, parmi
// les matchs du joueur dont le vote est déjà clôturé depuis moins de
// MVP_BADGE_WINDOW_DAYS jours, le plus récent dont il est le vainqueur.
export async function findRecentMvpWin(matches, playerId, now = new Date()) {
  const candidates = getPlayerMatches(matches, playerId)
    .filter((m) => {
      const { votingDeadline } = getMvpWindow(m);
      if (now < votingDeadline) return false;
      const daysSinceClose = (now - votingDeadline) / 86400000;
      return daysSinceClose <= MVP_BADGE_WINDOW_DAYS;
    })
    .sort((a, b) => getMatchStart(b) - getMatchStart(a));

  for (const match of candidates) {
    const data = await fetchMvpVotes(match.id);
    const { winnerId } = computeMvpWinner(data.votes || {});
    if (winnerId === playerId) return match;
  }
  return null;
}

// "Mon profil" — nombre de fois où ce joueur a été élu homme du match,
// toute la saison confondue (lecture globale de la collection, comme le
// classement Killer — voir fetchKillerLeaderboard dans lib/killer.js).
export async function countMvpWins(playerId) {
  const snap = await getDocs(collection(db, "mvpVotes"));
  let count = 0;
  snap.forEach((docSnap) => {
    const { winnerId } = computeMvpWinner(docSnap.data().votes || {});
    if (winnerId === playerId) count += 1;
  });
  return count;
}
