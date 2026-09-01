// ─────────────────────────────────────────────────────────────────────────
// Fun Center — Jeu "Tournée générale" : tire au sort, parmi les joueurs
// réellement présents sur un terrain AUJOURD'HUI, qui doit payer la
// prochaine tournée.
//
// Règles :
// - Le tirage n'est possible qu'un jour de match, et seulement à partir de
//   TOURNEE_GENERALE_ACTIVATION_HOURS_BEFORE heures avant son coup d'envoi
//   (voir getTourneeGeneraleStatus).
// - Seuls les joueurs réellement placés sur un terrain aujourd'hui (tous
//   matchs/terrains du jour confondus) sont tirables — pas tout le club, ni
//   simplement ceux ayant répondu "présent" sans être composés.
// - L'historique des joueurs déjà tirés est stocké sur Firebase
//   (collection "games", document "tourneeGenerale"), donc partagé en temps
//   réel entre tous les joueurs : deux personnes qui lancent le tirage à
//   quelques minutes d'intervalle ne peuvent jamais retomber sur le même nom
//   tant que tout le monde n'est pas passé. L'historique est associé à la
//   date du jour (dayKey) : dès qu'on change de jour, l'ancien historique
//   est ignoré et un cycle tout neuf recommence — ce qui couvre largement
//   la demande d'une réinitialisation 24h après le match, puisque le jeu
//   n'est de toute façon jouable que les jours de match.
// - Si tous les présents du jour ont déjà été tirés (ex. 8 tournées
//   payées), l'historique du jour est réinitialisé automatiquement et un
//   nouveau cycle recommence aussitôt, plutôt que de bloquer le jeu.
// - Le tirage passe par une transaction Firestore : si deux joueurs lancent
//   le jeu au même moment, ils ne peuvent jamais faire gagner deux tournées
//   d'affilée à la même personne.
// ─────────────────────────────────────────────────────────────────────────
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { getMatchStart } from "./matchLogic";
import { toLocalISODate } from "./utils";
import { TOURNEE_GENERALE_ACTIVATION_HOURS_BEFORE } from "./constants";

const gameDocRef = () => doc(db, "games", "tourneeGenerale");

// Matchs du jour (peu importe l'heure ou le terrain) — c'est parmi leurs
// participants que le tirage se fait.
export function getTodaysMatches(matches, now = new Date()) {
  const todayKey = toLocalISODate(now);
  return (matches || []).filter((m) => m.date === todayKey);
}

// Joueurs réellement placés sur un terrain aujourd'hui, tous matchs
// confondus (un joueur sur 2 terrains le même jour ne compte qu'une fois).
// Retourne les fiches joueur complètes (pas juste des ids).
export function getPresentPlayersToday(todaysMatches, players) {
  const presentIds = new Set();
  (todaysMatches || []).forEach((m) => {
    (m.participants || []).forEach((p) => presentIds.add(p.playerId));
  });
  return (players || []).filter((p) => presentIds.has(p.id));
}

// Détermine si le jeu est jouable maintenant. status vaut :
// - "no-match"  : aucun match aujourd'hui
// - "too-early" : match aujourd'hui, mais pas encore dans la fenêtre des
//                 TOURNEE_GENERALE_ACTIVATION_HOURS_BEFORE heures avant
// - "ok"        : le tirage est ouvert
export function getTourneeGeneraleStatus(matches, now = new Date()) {
  const todaysMatches = getTodaysMatches(matches, now);
  if (todaysMatches.length === 0) {
    return { status: "no-match", todaysMatches };
  }
  const earliestStart = todaysMatches
    .map((m) => getMatchStart(m))
    .reduce((min, d) => (d < min ? d : min));
  const activatesAt = new Date(
    earliestStart.getTime() - TOURNEE_GENERALE_ACTIVATION_HOURS_BEFORE * 3600000
  );
  if (now < activatesAt) {
    return { status: "too-early", todaysMatches, activatesAt };
  }
  return { status: "ok", todaysMatches };
}

// Tire un joueur au sort parmi "presentPlayers", en lisant/actualisant
// l'historique partagé du jour dans une transaction Firestore (voir
// description en tête de fichier). Retourne la fiche du joueur tiré.
export async function drawTourneeGenerale(presentPlayers, now = new Date()) {
  if (!presentPlayers || presentPlayers.length === 0) {
    throw new Error("Aucun joueur présent aujourd'hui.");
  }
  const dayKey = toLocalISODate(now);
  const byId = new Map(presentPlayers.map((p) => [p.id, p]));

  const pickedId = await runTransaction(db, async (tx) => {
    const ref = gameDocRef();
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : null;

    // On ne garde de l'historique que les ids encore présents aujourd'hui
    // (un joueur qui n'a pas rejoué n'a plus de raison de "bloquer" un tour).
    let alreadyPicked =
      data && data.dayKey === dayKey && Array.isArray(data.pickedPlayerIds)
        ? data.pickedPlayerIds.filter((id) => byId.has(id))
        : [];

    let pool = presentPlayers.filter((p) => !alreadyPicked.includes(p.id));
    if (pool.length === 0) {
      // Tout le monde présent est déjà passé aujourd'hui : nouveau cycle.
      alreadyPicked = [];
      pool = presentPlayers;
    }

    const picked = pool[Math.floor(Math.random() * pool.length)];

    tx.set(ref, {
      dayKey,
      pickedPlayerIds: [...alreadyPicked, picked.id],
      updatedAt: serverTimestamp(),
    });

    return picked.id;
  });

  return byId.get(pickedId);
}
