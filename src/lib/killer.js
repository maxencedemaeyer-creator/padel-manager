// ─────────────────────────────────────────────────────────────────────────
// Fun Center — Jeu "Killer" : avant chaque match, un joueur réellement
// engagé dans ce match reçoit une mission personnelle tirée au sort, qu'il
// valide (Réussi / Raté / Pas essayé) 30 minutes après le début du match
// pour marquer des points.
//
// Règles :
// - Seul un joueur réellement engagé dans un de ses matchs (aujourd'hui,
//   hier ou avant-hier — voir plus bas) peut jouer. Les autres voient un
//   message les invitant à revenir à leur prochain jour de match.
// - Le jeu s'ouvre KILLER_ACTIVATION_HOURS_BEFORE heures avant le début du
//   match du joueur, et la mission peut être récupérée jusqu'à
//   KILLER_MISSION_CHOICE_DEADLINE_MINUTES minutes après le début du match.
// - À partir de ce même instant (+30 min), la mission reçue s'affiche avec
//   3 boutons de résultat, qui rapportent des points (voir KILLER_POINTS).
// - Le jeu (et le bouton "Classement") reste accessible
//   KILLER_SCOREBOARD_WINDOW_HOURS heures après ce même instant — d'où le
//   besoin de regarder aussi les matchs des jours précédents, et pas
//   seulement ceux du jour, pour retrouver la bonne fenêtre après minuit.
// - Chaque mission est strictement personnelle : stockée dans la collection
//   Firestore "killerMissions" (un document par joueur et par jour), elle
//   n'est jamais demandée ni affichée pour un autre joueur dans
//   l'interface. Comme pour le reste de l'app (voir remarque dans
//   firestore.rules), la base de données elle-même ne distingue pas les
//   joueurs entre eux au niveau des permissions : c'est l'application qui
//   ne va jamais chercher/afficher la mission de quelqu'un d'autre.
// - Le classement cumule, pour CHAQUE joueur de l'effectif (tous, pas
//   seulement ceux du jour), les points de toutes les missions validées
//   depuis le début. En cas d'égalité : total de points, puis nombre de
//   participations (missions validées), puis nombre de "Réussi", puis
//   ordre alphabétique.
// ─────────────────────────────────────────────────────────────────────────
import {
  doc,
  getDoc,
  getDocs,
  collection,
  runTransaction,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { getMatchStart } from "./matchLogic";
import { toLocalISODate } from "./utils";
import {
  KILLER_ACTIVATION_HOURS_BEFORE,
  KILLER_MISSION_CHOICE_DEADLINE_MINUTES,
  KILLER_SCOREBOARD_WINDOW_HOURS,
  KILLER_POINTS,
} from "./constants";
import { KILLER_MISSIONS } from "./killerMissions";

function missionDocId(dayKey, playerId) {
  return `${dayKey}_${playerId}`;
}
function missionDocRef(dayKey, playerId) {
  return doc(db, "killerMissions", missionDocId(dayKey, playerId));
}

// Tous les matchs où ce joueur est engagé, peu importe la date.
function getPlayerMatches(matches, playerId) {
  return (matches || []).filter((m) =>
    (m.participants || []).some((p) => p.playerId === playerId)
  );
}

// Les 3 instants clés du jeu Killer pour un match donné.
export function getKillerWindow(match) {
  const start = getMatchStart(match);
  const opensAt = new Date(start.getTime() - KILLER_ACTIVATION_HOURS_BEFORE * 3600000);
  const choiceDeadline = new Date(
    start.getTime() + KILLER_MISSION_CHOICE_DEADLINE_MINUTES * 60000
  );
  const closesAt = new Date(
    choiceDeadline.getTime() + KILLER_SCOREBOARD_WINDOW_HOURS * 3600000
  );
  return { start, opensAt, choiceDeadline, closesAt };
}

// Parmi tous les matchs du joueur, celui dont la fenêtre Killer couvre
// l'instant présent (normalement un seul à la fois). S'il y en avait
// plusieurs, on privilégie celui déjà commencé le plus récemment, sinon le
// prochain à venir.
function getActiveMatch(matches, playerId, now) {
  const withWindows = getPlayerMatches(matches, playerId)
    .map((match) => ({ match, window: getKillerWindow(match) }))
    .filter(({ window }) => now >= window.opensAt && now <= window.closesAt);
  if (withWindows.length === 0) return null;
  withWindows.sort((a, b) => a.window.start - b.window.start);
  const alreadyStarted = withWindows.filter(({ window }) => now >= window.start);
  return (alreadyStarted.length > 0 ? alreadyStarted[alreadyStarted.length - 1] : withWindows[0])
    .match;
}

// Détermine l'état du jeu pour ce joueur à l'instant "now". status vaut :
// - "not-present" : aucun match ne concerne ce joueur en ce moment
// - "too-early"   : un match le concerne, mais la fenêtre n'est pas ouverte
// - "choosing"    : le joueur peut récupérer (ou consulter) sa mission
// - "playing"     : la mission attend son résultat, et le classement est
//                   consultable
export function getKillerStatus(matches, playerId, now = new Date()) {
  const match = getActiveMatch(matches, playerId, now);
  if (!match) return { status: "not-present" };
  const window = getKillerWindow(match);
  if (now < window.opensAt) return { status: "too-early", match, window };
  if (now < window.choiceDeadline) return { status: "choosing", match, window };
  return { status: "playing", match, window };
}

// Lit (sans en créer) la mission du joueur pour la fenêtre donnée.
export async function fetchTodaysMission(window, playerId) {
  const dayKey = toLocalISODate(window.start);
  const snap = await getDoc(missionDocRef(dayKey, playerId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Récupère la mission du joueur pour ce match — la tire au sort si elle
// n'existe pas encore. Transaction Firestore : un double-clic rapide sur
// "Mission du jour" ne peut jamais tirer deux missions différentes pour le
// même joueur le même jour.
export async function getOrCreateTodaysMission(window, playerId, matchId) {
  const dayKey = toLocalISODate(window.start);
  const ref = missionDocRef(dayKey, playerId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) return { id: ref.id, ...snap.data() };
    const mission = KILLER_MISSIONS[Math.floor(Math.random() * KILLER_MISSIONS.length)];
    const data = {
      dayKey,
      playerId,
      matchId,
      mission,
      result: null,
      points: 0,
      assignedAt: serverTimestamp(),
      resolvedAt: null,
    };
    tx.set(ref, data);
    return { id: ref.id, ...data };
  });
}

// Enregistre le résultat choisi par le joueur (Réussi / Raté / Pas essayé)
// et les points associés (voir KILLER_POINTS). Retourne les points obtenus.
export async function resolveKillerMission(missionId, result) {
  const points = KILLER_POINTS[result] ?? 0;
  await updateDoc(doc(db, "killerMissions", missionId), {
    result,
    points,
    resolvedAt: serverTimestamp(),
  });
  return points;
}

// Classement cumulé de TOUS les joueurs de l'effectif (missions VALIDÉES
// uniquement — une mission juste tirée mais jamais tranchée ne compte pas
// comme une participation), avec les 4 niveaux de départage demandés.
export async function fetchKillerLeaderboard(players) {
  const snap = await getDocs(collection(db, "killerMissions"));
  const totals = new Map();
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (!data.playerId || !data.result) return;
    const t = totals.get(data.playerId) || { points: 0, participations: 0, successes: 0 };
    t.points += data.points || 0;
    t.participations += 1;
    if (data.result === "success") t.successes += 1;
    totals.set(data.playerId, t);
  });
  return (players || [])
    .map((p) => ({
      player: p,
      ...(totals.get(p.id) || { points: 0, participations: 0, successes: 0 }),
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.participations !== a.participations) return b.participations - a.participations;
      if (b.successes !== a.successes) return b.successes - a.successes;
      return a.player.name.localeCompare(b.player.name, "fr");
    });
}
