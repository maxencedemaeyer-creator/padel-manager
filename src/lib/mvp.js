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
// - En cas d'égalité entre plusieurs joueurs, TOUS les joueurs à égalité au
//   plus haut nombre de voix sont élus hommes du match (voir
//   computeMvpWinner) — plutôt que de trancher arbitrairement entre eux.
// - (26/09/2026) On peut élire TOUT joueur présent lors de la SESSION (même
//   date + heure + club, tous terrains confondus, manches supplémentaires
//   comprises — voir lib/rounds.js), plus seulement ceux de son terrain :
//   depuis les manches, on joue avec plus de monde que prévu. Le vote reste
//   stocké dans le document du match du votant (aucune migration), mais le
//   RÉSULTAT est calculé sur la session entière en fusionnant les documents
//   de ses matchs (voir fetchSessionVotes / buildMvpResults). Un joueur qui
//   n'apparaît que dans une manche supplémentaire peut lui aussi voter.
// - Les votes sont stockés dans la nouvelle collection Firestore "mvpVotes"
//   (un document par match, id du document = id du match), champ "votes" =
//   { voterId: candidateId }. Nouveau bloc dédié dans firestore.rules (comme
//   "killerMissions") — à recopier manuellement dans Firebase Console.
// - (26/09/2026) En votant, on peut laisser un petit message FACULTATIF (limité
//   à MVP_NOTE_MAX_LENGTH caractères) au joueur choisi, signé ou anonyme au
//   choix du votant. Stocké dans le MÊME document, champ "notes" =
//   { voterId: { text, signed } } (le destinataire est toujours
//   votes[voterId]). Le message n'est montré qu'au joueur s'il est ÉLU ; sinon
//   il reste archivé côté votant (voir fetchMyVoteHistory).
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
import { getRounds, sessionKeyOf } from "./rounds";
import { MVP_VOTE_OPENS_HOURS_AFTER_START, MVP_BADGE_WINDOW_DAYS } from "./constants";

// Longueur maximale du petit message adressé à l'homme du match.
export const MVP_NOTE_MAX_LENGTH = 140;

function voteDocRef(matchId) {
  return doc(db, "mvpVotes", matchId);
}

// Tous les matchs où ce joueur est réellement composé (peu importe la date).
// (Depuis le 26/09/2026 : compte aussi une présence dans une manche
// supplémentaire, pour que les joueurs venus en renfort puissent voter.)
function getPlayerMatches(matches, playerId) {
  return (matches || []).filter(
    (m) =>
      (m.participants || []).some((p) => p.playerId === playerId) ||
      getRounds(m).some((r) => (r.participants || []).some((p) => p.playerId === playerId))
  );
}

// Tous les matchs de la même session que `match` (même date + heure + club).
function getSessionMatches(matches, match) {
  const key = sessionKeyOf(match);
  return (matches || []).filter((m) => sessionKeyOf(m) === key);
}

// Ids des joueurs présents sur un match : composition de base + manches.
function collectPlayerIds(match) {
  const ids = [];
  const add = (list) =>
    (list || []).forEach((p) => {
      if (p && p.playerId && !ids.includes(p.playerId)) ids.push(p.playerId);
    });
  add(match.participants);
  getRounds(match).forEach((r) => add(r.participants));
  return ids;
}

// Candidats au vote pour la session du match `match` : { own, others } —
// `own` = joueurs de SON match (à afficher en premier), `others` = les autres
// joueurs présents lors de la session (autres terrains, renforts en manche).
export function getMvpCandidates(matches, match) {
  const own = collectPlayerIds(match);
  const others = [];
  getSessionMatches(matches, match).forEach((m) => {
    if (m.id === match.id) return;
    collectPlayerIds(m).forEach((id) => {
      if (!own.includes(id) && !others.includes(id)) others.push(id);
    });
  });
  return { own, others };
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

// Votes de TOUTE la session du match `match` : fusion des documents de tous
// les matchs de la session (un votant n'apparaît que dans un seul document ;
// si jamais il y en avait deux, le premier lu l'emporte). Renvoie
// { votes, notes } au même format que le document d'un match.
export async function fetchSessionVotes(matches, match) {
  const sessionMatches = getSessionMatches(matches, match);
  if (!sessionMatches.some((m) => m.id === match.id)) sessionMatches.push(match);
  const docs = await Promise.all(sessionMatches.map((m) => fetchMvpVotes(m.id)));
  const votes = {};
  const notes = {};
  docs.forEach((d) => {
    Object.entries(d.votes || {}).forEach(([voterId, candidateId]) => {
      if (votes[voterId]) return;
      votes[voterId] = candidateId;
      if (d.notes && d.notes[voterId]) notes[voterId] = d.notes[voterId];
    });
  });
  return { votes, notes };
}

// Regroupe des documents de votes ({ id, votes, notes }) par SESSION et
// calcule le(s) vainqueur(s) de chacune. Ne garde que les votes clôturés si
// `closedOnly` (un vote encore ouvert n'a pas de vainqueur définitif). Un
// document dont le match n'existe plus est traité seul, comme clôturé.
// Renvoie [{ key, match, votes, notes, winnerIds }].
export function buildMvpResults(voteDocs, matches, now = new Date(), closedOnly = true) {
  const matchById = new Map((matches || []).map((m) => [m.id, m]));
  const groups = new Map();
  (voteDocs || []).forEach((d) => {
    const match = matchById.get(d.id) || null;
    const key = match ? sessionKeyOf(match) : `doc:${d.id}`;
    if (!groups.has(key)) groups.set(key, { key, match, votes: {}, notes: {} });
    const g = groups.get(key);
    if (!g.match && match) g.match = match;
    Object.entries(d.votes || {}).forEach(([voterId, candidateId]) => {
      if (g.votes[voterId]) return;
      g.votes[voterId] = candidateId;
      if (d.notes && d.notes[voterId]) g.notes[voterId] = d.notes[voterId];
    });
  });
  const results = [];
  groups.forEach((g) => {
    if (closedOnly && g.match && now <= getMvpWindow(g.match).votingDeadline) return;
    const { winnerIds } = computeMvpWinner(g.votes);
    results.push({ ...g, winnerIds });
  });
  return results;
}

// Vote transactionnel : un seul vote par joueur et par match. Si le joueur a
// déjà voté, on ne change rien (son premier vote reste définitif) et on
// renvoie simplement l'état actuel des votes.
export async function castMvpVote(matchId, voterId, candidateId, note = null) {
  const ref = voteDocRef(matchId);
  const text = String((note && note.text) || "").trim().slice(0, MVP_NOTE_MAX_LENGTH);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const current = data.votes || {};
    const currentNotes = data.notes || {};
    if (current[voterId]) return { votes: current, notes: currentNotes };
    const nextVotes = { ...current, [voterId]: candidateId };
    // Message facultatif : rien n'est écrit s'il est vide.
    const nextNotes = text
      ? { ...currentNotes, [voterId]: { text, signed: !!(note && note.signed) } }
      : currentNotes;
    tx.set(
      ref,
      { matchId, votes: nextVotes, notes: nextNotes, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return { votes: nextVotes, notes: nextNotes };
  });
}

// Vainqueur(s) à partir d'une carte de votes {voterId: candidateId} : TOUS
// les candidats à égalité au plus haut nombre de voix (donc un tableau d'un
// seul id la plupart du temps, mais plusieurs en cas d'égalité — voir
// commentaire en tête de fichier : plusieurs hommes du match plutôt qu'un
// choix arbitraire entre joueurs à égalité).
export function computeMvpWinner(votes) {
  const counts = new Map();
  Object.values(votes || {}).forEach((candidateId) => {
    counts.set(candidateId, (counts.get(candidateId) || 0) + 1);
  });
  if (counts.size === 0) return { winnerIds: [], counts };
  let max = 0;
  counts.forEach((c) => {
    if (c > max) max = c;
  });
  const winnerIds = [...counts.entries()].filter(([, c]) => c === max).map(([id]) => id);
  return { winnerIds, counts };
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

  const seenSessions = new Set();
  for (const match of candidates) {
    // Un seul contrôle par session (le résultat est commun à la session).
    const key = sessionKeyOf(match);
    if (seenSessions.has(key)) continue;
    seenSessions.add(key);
    const data = await fetchSessionVotes(matches, match);
    const { winnerIds } = computeMvpWinner(data.votes || {});
    if (winnerIds.includes(playerId)) return match;
  }
  return null;
}

// "Mon profil" — nombre de fois où ce joueur a été élu homme du match
// (y compris ex æquo), toute la saison confondue (lecture globale de la
// collection, comme le classement Killer — voir fetchKillerLeaderboard dans
// lib/killer.js).
export async function countMvpWins(playerId) {
  const snap = await getDocs(collection(db, "mvpVotes"));
  let count = 0;
  snap.forEach((docSnap) => {
    const { winnerIds } = computeMvpWinner(docSnap.data().votes || {});
    if (winnerIds.includes(playerId)) count += 1;
  });
  return count;
}

// "Mon profil" — la liste des matchs où CE joueur a été élu homme du match
// (y compris ex æquo), avec les messages qui lui étaient adressés. Ne compte
// que les votes CLÔTURÉS (un vote encore ouvert n'a pas de vainqueur définitif
// et ses messages ne doivent pas être lus avant la fin). `matches` sert à
// retrouver la date/l'heure ; un match introuvable (supprimé) est traité
// comme clôturé. Tri : du plus récent au plus ancien.
// Chaque élément : { matchId, date, time, coWinners, notes: [{ text, authorId|null }] }
// — authorId vaut null quand le votant a choisi de rester anonyme.
export async function fetchMyMvpWins(playerId, matches, now = new Date()) {
  const snap = await getDocs(collection(db, "mvpVotes"));
  const docs = [];
  snap.forEach((docSnap) => docs.push({ id: docSnap.id, ...docSnap.data() }));
  const wins = [];
  buildMvpResults(docs, matches, now, true).forEach((r) => {
    if (!r.winnerIds.includes(playerId)) return;
    const notes = Object.entries(r.notes)
      .filter(([voterId, n]) => r.votes[voterId] === playerId && n && n.text)
      .map(([voterId, n]) => ({ text: n.text, authorId: n.signed ? voterId : null }));
    wins.push({
      matchId: r.match ? r.match.id : r.key,
      date: r.match ? r.match.date : "",
      time: r.match ? r.match.time : "",
      coWinners: r.winnerIds.length,
      notes,
    });
  });
  wins.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  return wins;
}

// Côté votant : "historique de mes votes" — tous les matchs où CE joueur a
// voté, avec le joueur choisi et le message laissé (même si ce joueur n'a pas
// été élu : le message reste ainsi archivé chez son rédacteur). Tri : du plus
// récent au plus ancien.
// Chaque élément : { matchId, date, time, candidateId, text, signed }
export async function fetchMyVoteHistory(voterId, matches) {
  const snap = await getDocs(collection(db, "mvpVotes"));
  const matchById = new Map((matches || []).map((m) => [m.id, m]));
  const history = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const candidateId = (data.votes || {})[voterId];
    if (!candidateId) return;
    const match = matchById.get(docSnap.id);
    const note = (data.notes || {})[voterId];
    history.push({
      matchId: docSnap.id,
      date: match ? match.date : "",
      time: match ? match.time : "",
      candidateId,
      text: note && note.text ? note.text : "",
      signed: !!(note && note.signed),
    });
  });
  history.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  return history;
}
