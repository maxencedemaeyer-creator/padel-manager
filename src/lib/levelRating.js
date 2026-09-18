// ─────────────────────────────────────────────────────────────────────────
// Moteur de calcul du "Ranking" (score interne au club, échelle 1-10) — voir
// claude/feature-ranking-padel-manager.md pour la spec complète. Fichier
// PUR : aucune dépendance Firestore ici (voir §7.2/§11 de la spec) — les
// composants appelants (EndMatchModal.jsx, PostMatchModal.jsx, et les
// outils de migration dans AdminView.jsx) sont seuls responsables des
// lectures/écritures Firebase, à partir de ce que ce fichier calcule.
//
// Vocabulaire (voir §1 de la spec) : "Ranking" = le score interne construit
// ici (jamais montré ailleurs dans le code sous ce nom technique — les
// champs restent `internalScore` / `internalScoreReliability` en base).
// "Niveau officiel" = l'AUTRE donnée, déjà existante (LEVELS, constants.js).
// ─────────────────────────────────────────────────────────────────────────
import { LEVELS } from "./constants";

// ─── Constantes (voir §4.2, §4.4, §4.6, §13 de la spec — ajustées par
// simulation, voir claude/feature-ranking-padel-manager.md §12) ───────────
export const RANKING_SCALE_MIN = 1;
export const RANKING_SCALE_MAX = 10;

const K_MAX = 0.55;
const K_MIN = 0.06;
const K_TAU = 18;
const ELO_DIVISOR = 3;

const MARGIN_FLOOR = 0.7;
const MARGIN_CEIL = 1.3;
const MARGIN_SLOPE = 1.2;

const RECAL_WEIGHT_MIN = 0.3;
const RECAL_WEIGHT_MAX = 0.95;
// Réduit la baisse de fiabilité quand c'est l'ADMIN qui modifie le niveau
// officiel d'un AUTRE joueur (plutôt que le joueur qui modifie le sien) —
// voir §4.6. Constante ajustable, comme celles du §4.2.
export const RECAL_ADMIN_RELIABILITY_FACTOR = 0.5;

// Seuils du signal de divergence (§13) — validés par simulation (§12).
export const DIVERGENCE_THRESHOLD = 1.2;
export const DIVERGENCE_MIN_RELIABILITY = 6;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ─── §3 : score de base à partir du niveau officiel ───────────────────────
// Retourne `null` pour "Pas de niveau" (levelSortValue absent/0) — ce joueur
// n'a pas de score_base, voir §4.7 (amorçage/bootstrap).
export function getScoreBase(levelSortValue) {
  if (typeof levelSortValue !== "number" || levelSortValue <= 0) return null;
  return Math.max(1, levelSortValue / 10);
}

// ─── §3/§8 : état de ranking "vu de l'extérieur" d'un joueur ──────────────
// hasRanking=false ⇔ "Non classé" (aucun ranking affichable ni utilisable
// dans les calculs, voir §3/§4.7). score/reliability restent utilisables
// tels quels dans le moteur ci-dessous dans tous les autres cas — qu'ils
// viennent du champ réel `internalScore`/`internalScoreReliability` (déjà
// écrit en base) ou, à défaut, de `score_base` calculé à la volée (§3,
// création paresseuse du champ).
export function getPlayerRatingState(player) {
  if (!player) return { score: null, reliability: 0, hasRanking: false };
  if (typeof player.internalScore === "number") {
    return {
      score: player.internalScore,
      reliability:
        typeof player.internalScoreReliability === "number"
          ? player.internalScoreReliability
          : 0,
      hasRanking: true,
    };
  }
  const base = getScoreBase(player.levelSortValue);
  if (base == null) return { score: null, reliability: 0, hasRanking: false };
  return { score: base, reliability: 0, hasRanking: true };
}

// ─── §4.1 : résultat attendu (Elo) ─────────────────────────────────────────
export function expectedScore(teamScoreSelf, teamScoreOpponent) {
  return 1 / (1 + Math.pow(10, (teamScoreOpponent - teamScoreSelf) / ELO_DIVISOR));
}

// ─── §4.2 : fiabilité → K (volatilité) ─────────────────────────────────────
// kFactor(0) = K_MAX exactement (voir §4.7, amorçage : "K(0) = K_max=0.55").
export function kFactor(reliability) {
  const rel = Math.max(0, reliability || 0);
  return K_MIN + (K_MAX - K_MIN) * Math.exp(-rel / K_TAU);
}

// ─── §4.3 : résultat brut (victoire/défaite/nul) pour l'équipe `myTeam` ───
export function resultValue(myTeam, winningTeam) {
  if (!winningTeam) return 0.5; // match nul réel (voir §4.3/§5 — hasMatchScore true, winningTeam null)
  return myTeam === winningTeam ? 1 : 0;
}

// ─── §4.4 : facteur de marge (écart de jeux) ───────────────────────────────
// Moyenne, set par set (uniquement les sets "remplis" — même détection que
// computeWinnerFromSets dans matchLogic.js, dupliquée ici volontairement
// pour garder ce fichier indépendant de Firestore ET de React), du ratio de
// jeux remporté par le VAINQUEUR du match. Un match nul n'a par définition
// aucun "vainqueur" dont calculer le ratio → facteur_marge = 0.7 (minimum),
// directement, sans parcourir les sets.
export function marginFactorFromSets(sets, winningTeam) {
  if (!winningTeam) return MARGIN_FLOOR;
  let ratioSum = 0;
  let filledSets = 0;
  ["set1", "set2", "set3"].forEach((key) => {
    const set = sets && sets[key];
    if (!set || typeof set !== "object") return;
    const a = Number(set.a);
    const b = Number(set.b);
    if (set.a === "" || set.b === "" || !Number.isFinite(a) || !Number.isFinite(b)) return;
    const winnerGames = winningTeam === "A" ? a : b;
    const loserGames = winningTeam === "A" ? b : a;
    const total = winnerGames + loserGames;
    if (total <= 0) return; // set à 0-0 rempli : ignoré, aucune information de marge
    ratioSum += winnerGames / total;
    filledSets += 1;
  });
  if (filledSets === 0) return MARGIN_FLOOR;
  const rMatch = ratioSum / filledSets;
  return clamp(MARGIN_FLOOR + MARGIN_SLOPE * (rMatch - 0.5), MARGIN_FLOOR, MARGIN_CEIL);
}

// ─── §4.7 : "niveau_ancre" — moyenne de l'équipe adverse, avec repli sur le
// plancher 1 si celle-ci contient elle-même un joueur "Non classé" à cet
// instant (cas limite documenté dans la spec). ──────────────────────────────
function teamIsFullyRanked(teamStates) {
  return teamStates.every((s) => s.hasRanking);
}
function opposingAnchor(oppTeamStates) {
  if (!teamIsFullyRanked(oppTeamStates)) return RANKING_SCALE_MIN;
  return (oppTeamStates[0].score + oppTeamStates[1].score) / 2;
}

// Moyenne d'équipe utilisée pour le calcul attendu/delta des AUTRES joueurs
// (partenaire + adversaires) de ce match — §4.7, "Répercussion sur les 3
// autres joueurs du même match". Un joueur non classé de cette équipe
// contribue à cette moyenne avec `niveau_ancre` (moyenne de l'équipe
// adverse, ou plancher 1 si elle-même pas entièrement classée) plutôt
// qu'avec une valeur arbitraire — extension symétrique documentée dans la
// spec au cas (rare) où DEUX joueurs d'une même équipe seraient non classés
// en même temps : chacun contribue alors avec le même niveau_ancre.
function teamAverageForCalc(teamStates, oppTeamStates) {
  const anchor = opposingAnchor(oppTeamStates);
  const contributions = teamStates.map((s) => (s.hasRanking ? s.score : anchor));
  return (contributions[0] + contributions[1]) / 2;
}

// ─── §4.1-§4.5 + §4.7 : calcule les deltas des 4 joueurs d'un match ────────
// `teamA`/`teamB` : tableaux de 2 `{ playerId, state }` (state = résultat de
// getPlayerRatingState). Retourne `null` si l'un des deux camps n'a pas
// exactement 2 joueurs (garde-fou — voir §5, "match à 3 joueurs" : ce cas
// n'existe pas dans l'usage réel du club, mais on ne calcule jamais de
// ranking sur des données incomplètes plutôt que de risquer un calcul
// faux/biaisé).
function computeFreshDeltas({ teamA, teamB, sets, winningTeam }) {
  if (!teamA || !teamB || teamA.length !== 2 || teamB.length !== 2) return null;

  const statesA = teamA.map((p) => p.state);
  const statesB = teamB.map((p) => p.state);
  const anchorForA = opposingAnchor(statesB); // "niveau_ancre" si un joueur de A est non classé
  const anchorForB = opposingAnchor(statesA); // idem pour B
  const teamAvgA = teamAverageForCalc(statesA, statesB);
  const teamAvgB = teamAverageForCalc(statesB, statesA);
  const expectedA = expectedScore(teamAvgA, teamAvgB);
  const expectedB = 1 - expectedA;
  const marginFactorValue = marginFactorFromSets(sets, winningTeam);

  const entries = {};

  const processTeam = (team, myTeamLabel, expectedForTeam, anchorForTeam) => {
    team.forEach(({ playerId, state }) => {
      const resultat = resultValue(myTeamLabel, winningTeam);
      if (state.hasRanking) {
        // Cas normal — §4.1 à §4.5.
        const k = kFactor(state.reliability);
        const delta = k * (resultat - expectedForTeam) * marginFactorValue;
        const apres = clamp(state.score + delta, RANKING_SCALE_MIN, RANKING_SCALE_MAX);
        entries[playerId] = {
          avant: state.score,
          apres,
          delta,
          attendu: expectedForTeam,
          resultat,
          facteurMarge: marginFactorValue,
          wasBootstrap: false,
        };
      } else {
        // Amorçage (§4.7) — attendu fixé à 0.5, K(0) = K_max, fiabilité → 1.
        const delta = kFactor(0) * (resultat - 0.5) * marginFactorValue;
        const apres = clamp(anchorForTeam + delta, RANKING_SCALE_MIN, RANKING_SCALE_MAX);
        entries[playerId] = {
          avant: null,
          apres,
          delta,
          attendu: 0.5,
          resultat,
          facteurMarge: marginFactorValue,
          wasBootstrap: true,
          niveauAncre: anchorForTeam,
        };
      }
    });
  };

  processTeam(teamA, "A", expectedA, anchorForA);
  processTeam(teamB, "B", expectedB, anchorForB);

  return entries;
}

// ─── §4.8 : annulation d'un ancien ajustement (par rapport à l'état ACTUEL
// du joueur, jamais un retour brut à `avant`) ───────────────────────────────
// Retourne soit `{ reverted: true }` (le match annulé était le match
// d'amorçage de ce joueur — il redevient intégralement "Non classé", voir
// §4.7/§4.8 "cas particulier"), soit `{ reverted: false, newScore,
// newReliability }`.
function cancelOneEntry(currentState, oldEntry) {
  if (oldEntry.wasBootstrap) {
    return { reverted: true };
  }
  const newScore = clamp(
    (currentState.hasRanking ? currentState.score : oldEntry.apres) - oldEntry.delta,
    RANKING_SCALE_MIN,
    RANKING_SCALE_MAX
  );
  const newReliability = Math.max(0, (currentState.hasRanking ? currentState.reliability : 0) - 1);
  return { reverted: false, newScore, newReliability };
}

// Construit, pour un ensemble de joueurs, leur état "après annulation" de
// leur éventuelle entrée dans `previousLevelDeltas`. Les joueurs absents de
// `previousLevelDeltas` (aucun ajustement à annuler) gardent leur état
// Firestore actuel tel quel. Retourne une Map<playerId, state>.
function statesAfterCancellation(playerIds, playersById, previousLevelDeltas) {
  const result = new Map();
  playerIds.forEach((id) => {
    const currentState = getPlayerRatingState(playersById[id]);
    const oldEntry = previousLevelDeltas && previousLevelDeltas[id];
    if (!oldEntry) {
      result.set(id, currentState);
      return;
    }
    const cancelled = cancelOneEntry(currentState, oldEntry);
    if (cancelled.reverted) {
      result.set(id, { score: null, reliability: 0, hasRanking: false });
    } else {
      result.set(id, {
        score: cancelled.newScore,
        reliability: cancelled.newReliability,
        hasRanking: true,
      });
    }
  });
  return result;
}

// Sentinelle utilisée dans `playerUpdates` pour signifier "annuler
// complètement le ranking de ce joueur" (retour à "Non classé" — suppression
// de `internalScore`/`internalScoreReliability`). Les appelants Firestore
// convertissent ceci en `deleteField()` pour les deux champs.
export const UNRANK_PLAYER = "UNRANK_PLAYER";

function stateToPlayerUpdate(state) {
  if (!state.hasRanking) return UNRANK_PLAYER;
  return { internalScore: state.score, internalScoreReliability: state.reliability };
}

// Variante "à partir d'états déjà connus" (plutôt que de documents joueurs
// Firestore) de `computeFreshDeltas` — utilisée à la fois par
// `computeRankingUpdateForMatch` ci-dessous (à partir de l'état ACTUEL, post-
// annulation) ET par le script de backfill (§4.9), qui maintient son propre
// état "en mémoire" au fil du rejeu chronologique plutôt que de relire
// Firestore à chaque match. Retourne `null` dans les mêmes conditions que
// `computeFreshDeltas` (garde-fou 2v2, voir §5). `newStates` contient l'état
// résultant de chacun des 4 joueurs (à reporter tel quel dans l'état
// "en mémoire" de l'appelant, ou à convertir en écriture Firestore).
export function computeFreshRankingForMatch({ teamAIds, teamBIds, statesById, sets, winningTeam }) {
  if (
    !Array.isArray(teamAIds) ||
    !Array.isArray(teamBIds) ||
    teamAIds.length !== 2 ||
    teamBIds.length !== 2
  ) {
    return null;
  }
  const allIds = [...teamAIds, ...teamBIds];
  if (new Set(allIds).size !== 4) return null;
  if (allIds.some((id) => !statesById[id])) return null;

  const teamA = teamAIds.map((id) => ({ playerId: id, state: statesById[id] }));
  const teamB = teamBIds.map((id) => ({ playerId: id, state: statesById[id] }));
  const levelDeltas = computeFreshDeltas({ teamA, teamB, sets, winningTeam });
  if (!levelDeltas) return null;

  const newStates = {};
  allIds.forEach((id) => {
    const entry = levelDeltas[id];
    const prevState = statesById[id];
    newStates[id] = {
      score: entry.apres,
      reliability: (entry.wasBootstrap ? 0 : prevState.reliability) + 1,
      hasRanking: true,
    };
  });
  return { levelDeltas, newStates };
}

// ─── Point d'entrée principal — utilisé par EndMatchModal.jsx,
// PostMatchModal.jsx, ET le script de backfill (§4.9), pour être certain
// d'appliquer exactement la même formule partout (voir §7.2). ──────────────
//
// `teamAIds`/`teamBIds` : tableaux de 2 ids de joueurs.
// `playersById` : { [id]: playerDoc } — doit contenir au moins les 4 ids
// concernés, avec leurs champs `levelSortValue`/`internalScore`/
// `internalScoreReliability` actuels.
// `sets`/`winningTeam` : mêmes conventions que dans matchLogic.js
// (`winningTeam` = "A" | "B" | null pour un vrai match nul — l'appelant ne
// doit appeler cette fonction QUE si un score exploitable a été saisi,
// voir §5 — jamais pour "aucune donnée").
// `previousLevelDeltas` : l'éventuel `match.levelDeltas` existant avant
// cette écriture (ou `null`/`undefined` s'il n'y en a pas) — gère à la fois
// un tout premier encodage ET une correction (§4.8) de façon uniforme.
//
// Retourne `null` si les 4 ids ne forment pas 2 équipes de 2 joueurs
// distincts (garde-fou, §5) — l'appelant ne touche alors à rien côté
// ranking. Sinon, retourne `{ levelDeltas, playerUpdates }` :
// - `levelDeltas` : à écrire tel quel sur `match.levelDeltas`.
// - `playerUpdates` : `{ [playerId]: {internalScore, internalScoreReliability} | UNRANK_PLAYER }`
//   à appliquer sur chaque document joueur concerné.
export function computeRankingUpdateForMatch({
  teamAIds,
  teamBIds,
  playersById,
  sets,
  winningTeam,
  previousLevelDeltas,
}) {
  if (
    !Array.isArray(teamAIds) ||
    !Array.isArray(teamBIds) ||
    teamAIds.length !== 2 ||
    teamBIds.length !== 2
  ) {
    return null;
  }
  const allIds = [...teamAIds, ...teamBIds];
  if (new Set(allIds).size !== 4) return null; // ids dupliqués — donnée incohérente, on ne calcule rien
  if (allIds.some((id) => !playersById[id])) return null; // joueur introuvable — donnée incohérente

  const statesAfterCancel = statesAfterCancellation(allIds, playersById, previousLevelDeltas);
  const statesById = Object.fromEntries(allIds.map((id) => [id, statesAfterCancel.get(id)]));

  const fresh = computeFreshRankingForMatch({ teamAIds, teamBIds, statesById, sets, winningTeam });
  if (!fresh) return null;

  const playerUpdates = {};
  allIds.forEach((id) => {
    playerUpdates[id] = stateToPlayerUpdate(fresh.newStates[id]);
  });

  return { levelDeltas: fresh.levelDeltas, playerUpdates };
}

// Cas "le match devient/reste sans donnée exploitable" (§4.8.B, §5) alors
// qu'il portait déjà un `levelDeltas` : on annule seulement, sans rien
// réappliquer. L'appelant doit ensuite supprimer `match.levelDeltas`
// (deleteField()) en plus d'appliquer `playerUpdates`.
export function cancelRankingForMatch({ previousLevelDeltas, playersById }) {
  if (!previousLevelDeltas) return null;
  const ids = Object.keys(previousLevelDeltas);
  if (ids.length === 0) return null;
  const statesAfterCancel = statesAfterCancellation(ids, playersById, previousLevelDeltas);
  const playerUpdates = {};
  ids.forEach((id) => {
    playerUpdates[id] = stateToPlayerUpdate(statesAfterCancel.get(id));
  });
  return { playerUpdates };
}

// ─── §4.6 : recalibrage lors d'un changement de niveau officiel ───────────
// `currentScore`/`currentReliability` : état ACTUEL du joueur (son
// `internalScore`/`internalScoreReliability` réels si le champ existe déjà,
// sinon `score_base(ancien niveau)` / 0 — voir §3, création paresseuse).
// `oldScoreBase`/`newScoreBase` : résultat de `getScoreBase(...)` pour
// l'ancien et le nouveau `levelSortValue` — l'appelant ne doit invoquer
// cette fonction QUE si les deux sont non-null (deux niveaux RÉELLEMENT
// déclarés, voir la note de fin du §4.6 : le cas "Pas de niveau" → niveau
// déclaré n'est jamais couvert ici, voir §4.7/§3).
// `isAdminEditingOther` : true si c'est l'admin qui modifie la fiche d'un
// AUTRE joueur (jamais true quand l'admin modifie sa PROPRE fiche — voir
// §10, vigilance : comparer l'id du joueur connecté à l'id de la fiche
// éditée, pas seulement `isAdmin`).
export function computeLevelChangeRecalibration({
  currentScore,
  currentReliability,
  oldScoreBase,
  newScoreBase,
  isAdminEditingOther,
}) {
  const distance = Math.abs(newScoreBase - oldScoreBase);
  const poids = clamp(
    RECAL_WEIGHT_MIN + (RECAL_WEIGHT_MAX - RECAL_WEIGHT_MIN) * (distance / 9),
    RECAL_WEIGHT_MIN,
    RECAL_WEIGHT_MAX
  );
  const newScore = clamp(
    currentScore + poids * (newScoreBase - oldScoreBase),
    RANKING_SCALE_MIN,
    RANKING_SCALE_MAX
  );
  const adminFactor = isAdminEditingOther ? RECAL_ADMIN_RELIABILITY_FACTOR : 1;
  const newReliability = Math.max(0, currentReliability * (1 - poids * adminFactor));
  return { newScore, newReliability, poids, distance };
}

// ─── §13 : signal de divergence + suggestion de niveau ────────────────────
// Retourne `null` si le joueur n'a pas de ranking, ou n'a pas de niveau
// officiel réellement déclaré (rien à comparer, voir §13 "Ne s'applique
// évidemment qu'à un joueur qui a déjà un ranking").
export function getDivergence(player) {
  const state = getPlayerRatingState(player);
  if (!state.hasRanking) return null;
  const scoreBase = getScoreBase(player.levelSortValue);
  if (scoreBase == null) return null;
  const divergence = state.score - scoreBase;
  const active =
    Math.abs(divergence) >= DIVERGENCE_THRESHOLD && state.reliability >= DIVERGENCE_MIN_RELIABILITY;
  return { divergence, active, score: state.score, scoreBase, reliability: state.reliability };
}

// Suggestion de nouveau niveau (§13) — simple arrondi au palier LEVELS le
// plus proche du `internalScore` actuel. Volontairement PAS une recherche
// du niveau qui minimiserait l'écart résiduel après recalibrage (§4.6) :
// voir la note technique du §13 (ça favoriserait systématiquement les
// extrêmes P50/P1000 à cause de l'écrêtage de l'échelle).
export function suggestLevelForScore(internalScore) {
  let best = null;
  let bestDistance = Infinity;
  LEVELS.forEach((level) => {
    if (!level.value) return; // "Pas de niveau" exclu — jamais une suggestion valide
    const base = level.value / 10;
    const distance = Math.abs(base - internalScore);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = level;
    }
  });
  return best; // { label, value } ou null si LEVELS ne contient aucun niveau réel
}

// ─── §6 : mini-historique pour la sparkline "Mon profil" / l'historique admin
// Reconstruit, à la volée (aucun champ dédié en base, voir §8), les derniers
// ajustements chronologiques d'un joueur à partir de `match.levelDeltas`.
// Retourne du plus ANCIEN au plus RÉCENT (ordre naturel pour une sparkline).
export function getRecentLevelDeltaHistory(playerId, matches, limit = 10) {
  const relevant = (matches || [])
    .filter((m) => m.levelDeltas && m.levelDeltas[playerId])
    .map((m) => ({ match: m, entry: m.levelDeltas[playerId] }))
    .sort((a, b) => {
      const da = `${a.match.date || ""}T${a.match.time || "00:00"}`;
      const db = `${b.match.date || ""}T${b.match.time || "00:00"}`;
      return da.localeCompare(db);
    });
  return relevant.slice(-limit);
}
