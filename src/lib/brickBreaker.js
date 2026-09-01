// ─────────────────────────────────────────────────────────────────────────
// Game Center — Jeu "Brick Breaker" : logique Firestore uniquement (le jeu
// lui-même — canvas, physique de la balle, contrôles — vit entièrement dans
// src/components/games/BrickBreakerModal.jsx).
//
// Toutes les données sont stockées dans un seul document,
// "games/brickBreaker" (même collection que "games/tourneeGenerale" et
// "games/killerMissionPool" — déjà couverte par les règles Firestore
// existantes, donc aucune modification de firestore.rules n'est nécessaire
// pour ce jeu) :
// - highScores : tableau des BRICK_BREAKER_HIGH_SCORES_COUNT meilleurs
//   scores jamais réalisés (tous joueurs confondus), trié décroissant —
//   { playerId, score, achievedAt }.
// - attempts : { [playerId]: nombre de parties jouées }, valable pour toute
//   la saison (jamais remis à zéro) — sert au classement "a tenté sa chance
//   le plus de fois" affiché à la fin de chaque partie.
// ─────────────────────────────────────────────────────────────────────────
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { BRICK_BREAKER_HIGH_SCORES_COUNT } from "./constants";

function brickBreakerRef() {
  return doc(db, "games", "brickBreaker");
}

// Lit l'état actuel (high scores + tentatives). Ne crée rien : un document
// absent équivaut simplement à "aucune partie jouée pour l'instant".
export async function fetchBrickBreakerStats() {
  const snap = await getDoc(brickBreakerRef());
  if (!snap.exists()) return { highScores: [], attempts: {} };
  const data = snap.data();
  return {
    highScores: Array.isArray(data.highScores) ? data.highScores : [],
    attempts: data.attempts && typeof data.attempts === "object" ? data.attempts : {},
  };
}

// Comptabilise une nouvelle tentative — appelé dès le lancement d'une
// partie (bouton "Jouer" ou "Rejouer"), pas seulement à la fin : le
// classement porte sur le nombre de fois où un joueur a "tenté sa chance",
// pas uniquement sur les parties menées à leur terme. Stat cumulée pour
// toute la saison, jamais réinitialisée.
export async function recordBrickBreakerAttempt(playerId) {
  await runTransaction(db, async (tx) => {
    const ref = brickBreakerRef();
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const attempts =
      data.attempts && typeof data.attempts === "object" ? { ...data.attempts } : {};
    attempts[playerId] = (attempts[playerId] || 0) + 1;
    tx.set(ref, { attempts, updatedAt: serverTimestamp() }, { merge: true });
  });
}

// Enregistre le score d'une partie terminée et met à jour le tableau des
// meilleurs scores (transaction : deux joueurs qui terminent une partie au
// même instant ne peuvent jamais s'écraser l'un l'autre).
export async function submitBrickBreakerScore(playerId, score) {
  return runTransaction(db, async (tx) => {
    const ref = brickBreakerRef();
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const current = Array.isArray(data.highScores) ? data.highScores : [];
    const next = [...current, { playerId, score, achievedAt: new Date().toISOString() }]
      .sort((a, b) => b.score - a.score)
      .slice(0, BRICK_BREAKER_HIGH_SCORES_COUNT);
    tx.set(ref, { highScores: next, updatedAt: serverTimestamp() }, { merge: true });
    return next;
  });
}
