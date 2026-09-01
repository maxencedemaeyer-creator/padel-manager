// ─────────────────────────────────────────────────────────────────────────
// Game Center — Jeu "Killer" : avant chaque match, un joueur réellement
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
// - Un joueur peut demander UNE SEULE fois une "deuxième chance" (nouvelle
//   mission) s'il trouve la sienne trop dure/impossible, tant qu'il n'a pas
//   encore validé de résultat — voir rerollKillerMission. La mission
//   abandonnée est remise dans le pool commun pour pouvoir ressortir plus
//   tard, chez lui ou chez un autre joueur.
// - En plus de la fenêtre de jeu ci-dessus, un petit raccourci indépendant
//   (fetchMissionForToday) permet à un joueur de "revoir sa mission du
//   jour" (avec son résultat) n'importe quand avant minuit, même si le
//   statut ci-dessus est déjà repassé sur un autre match.
// - Chaque mission est strictement personnelle : stockée dans la collection
//   Firestore "killerMissions" (un document par joueur et par jour), elle
//   n'est jamais demandée ni affichée pour un autre joueur dans
//   l'interface. Comme pour le reste de l'app (voir remarque dans
//   firestore.rules), la base de données elle-même ne distingue pas les
//   joueurs entre eux au niveau des permissions : c'est l'application qui
//   ne va jamais chercher/afficher la mission de quelqu'un d'autre.
// - Le tirage des missions ne se répète jamais tant que tout le reste de
//   KILLER_MISSIONS n'a pas été distribué (à qui que ce soit, n'importe
//   quel jour) : un historique partagé et invisible ("games/killerMissionPool")
//   retient les missions déjà sorties et se réinitialise automatiquement
//   une fois la liste épuisée — voir drawFreshMission.
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
// Historique partagé (invisible) des missions déjà tirées, tous joueurs et
// tous jours confondus — dans la collection "games", au même niveau que
// "games/tourneeGenerale" (même règles Firestore, déjà en place).
function missionPoolRef() {
  return doc(db, "games", "killerMissionPool");
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

// Petit raccourci indépendant de la fenêtre de jeu : la mission (avec son
// résultat éventuel) du joueur pour la date calendaire d'aujourd'hui. Comme
// la clé du document est basée sur la date du jour, ça s'arrête tout seul à
// minuit (le lendemain, ce n'est plus "aujourd'hui") — sert au petit lien
// "Revoir ma mission du jour" dans KillerModal.
export async function fetchMissionForToday(playerId, now = new Date()) {
  const dayKey = toLocalISODate(now);
  const snap = await getDoc(missionDocRef(dayKey, playerId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Tire une mission au sort dans le pool commun, en évitant toute mission
// déjà utilisée (par qui que ce soit) tant que la liste complète n'a pas été
// distribuée. "excluding" permet en plus d'exclure une mission précise (cas
// du reroll : on ne veut pas retomber immédiatement sur celle qu'on vient de
// refuser). Doit être appelé à l'intérieur d'une transaction Firestore, tx
// et poolRef déjà lus (tx.get(poolRef) doit avoir été fait avant, comme
// l'exigent les transactions Firestore — toutes les lectures avant les
// écritures).
function pickFreshMission(poolData, excluding) {
  let used = poolData && Array.isArray(poolData.usedMissions) ? poolData.usedMissions : [];
  let available = KILLER_MISSIONS.filter((m) => !used.includes(m) && m !== excluding);
  if (available.length === 0) {
    // Tout le reste de la liste a déjà été distribué : nouveau cycle complet
    // (sauf la mission qu'on exclut explicitement, pour ne pas la
    // redistribuer dans le même geste).
    used = [];
    available = KILLER_MISSIONS.filter((m) => m !== excluding);
  }
  const mission = available[Math.floor(Math.random() * available.length)];
  const nextUsed = [...used, mission];
  return { mission, nextUsed };
}

// Récupère la mission du joueur pour ce match — la tire au sort (sans
// répétition, voir pickFreshMission) si elle n'existe pas encore.
// Transaction Firestore : un double-clic rapide sur "Mission du jour" ne
// peut jamais tirer deux missions différentes pour le même joueur le même
// jour.
export async function getOrCreateTodaysMission(window, playerId, matchId) {
  const dayKey = toLocalISODate(window.start);
  const ref = missionDocRef(dayKey, playerId);
  const poolRef = missionPoolRef();
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) return { id: ref.id, ...snap.data() };
    const poolSnap = await tx.get(poolRef);
    const { mission, nextUsed } = pickFreshMission(
      poolSnap.exists() ? poolSnap.data() : null
    );
    tx.set(poolRef, { usedMissions: nextUsed, updatedAt: serverTimestamp() });
    const data = {
      dayKey,
      playerId,
      matchId,
      mission,
      result: null,
      points: 0,
      rerollUsed: false,
      assignedAt: serverTimestamp(),
      resolvedAt: null,
    };
    tx.set(ref, data);
    return { id: ref.id, ...data };
  });
}

// "Deuxième chance" : remplace la mission en cours par une nouvelle
// (jamais utilisée ailleurs), une seule fois par joueur et par jour, et
// uniquement tant qu'aucun résultat n'a été validé. La mission abandonnée
// est retirée de l'historique "utilisées" pour pouvoir resservir plus tard.
export async function rerollKillerMission(missionId) {
  const ref = doc(db, "killerMissions", missionId);
  const poolRef = missionPoolRef();
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Mission introuvable.");
    const current = snap.data();
    if (current.rerollUsed) {
      throw new Error("Tu as déjà utilisé ta deuxième chance pour aujourd'hui.");
    }
    if (current.result) {
      throw new Error("Mission déjà validée, impossible d'en changer.");
    }
    const poolSnap = await tx.get(poolRef);
    const poolData = poolSnap.exists() ? poolSnap.data() : null;
    const usedWithoutCurrent = (
      poolData && Array.isArray(poolData.usedMissions) ? poolData.usedMissions : []
    ).filter((m) => m !== current.mission);
    const { mission, nextUsed } = pickFreshMission(
      { usedMissions: usedWithoutCurrent },
      current.mission
    );
    tx.set(poolRef, { usedMissions: nextUsed, updatedAt: serverTimestamp() });
    const update = { mission, rerollUsed: true };
    tx.update(ref, update);
    return { id: ref.id, ...current, ...update };
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
