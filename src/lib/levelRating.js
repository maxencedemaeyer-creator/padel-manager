// ─────────────────────────────────────────────────────────────────────────
// Moteur de calcul du "Ranking" (score interne au club, échelle 1-10) — voir
// claude/feature-ranking-padel-manager.md (spec de base) ET
// claude/feature-ranking-v2-progression-assiduite-2026-09-19.md (règles v2,
// en vigueur depuis le 19/09/2026). Fichier PUR : aucune dépendance
// Firestore ici (voir §7.2/§11 de la spec) — les composants appelants
// (EndMatchModal.jsx, PostMatchModal.jsx, et le recalcul admin dans
// src/lib/rankingRecalc.js + AdminView.jsx) sont seuls responsables des
// lectures/écritures Firebase, à partir de ce que ce fichier calcule.
//
// Vocabulaire (voir §1 de la spec) : "Ranking" = le score interne construit
// ici (jamais montré ailleurs dans le code sous ce nom technique — les
// champs restent `internalScore` / `internalScoreReliability` en base).
// "Niveau officiel" = l'AUTRE donnée, déjà existante (LEVELS, constants.js).
//
// Règles v2 par rapport à la v1 (toutes ajustables via les constantes
// ci-dessous — c'est le SEUL endroit à toucher, puis incrémenter
// RANKING_ENGINE_VERSION pour que l'admin voie "Recalcul conseillé") :
//   1. Marge : si l'équipe favorite gagne, facteur de marge fixé à 0,7.
//   2. Force d'équipe : moyenne − 0,15 × écart entre les deux partenaires.
//   3. Gains : tout gain de base est multiplié par 1,2.
//   4. Plafond souple : progression sur 40 matchs libre jusqu'à +1,0 puis
//      dégressive jusqu'à 0 à +2,5 (s'applique aux gains ET au bonus).
//   5. Bonus d'assiduité : petit bonus à chaque match officiel noté
//      (victoire ou défaite), qui s'éteint quand le joueur est déjà bien
//      au-dessus de son niveau officiel de départ.
//   6. (v3, 21/09/2026) Le bonus d'assiduité s'applique AUSSI à un match joué
//      « sans score » (bouton « Pas de score », matchType "Amical") : c'est un
//      entraînement, donc une progression comme un autre match. Ce match
//      donne le MÊME bonus (même extinction, même plafond) mais ne change ni
//      la fiabilité ni rien d'autre : aucune victoire/défaite n'est comptée.
//      Un joueur "Non classé" n'a pas de niveau de référence : rien pour lui.
//   7. (v4, 25/09/2026) Manches supplémentaires d'une session (voir
//      src/lib/rounds.js) : le bonus d'assiduité n'est versé qu'UNE SEULE FOIS
//      par joueur et par session (sur sa première manche) ; le résultat de
//      chaque manche 2, 3… compte avec un poids de 0,6 (la manche 1 : 1), sur
//      le calcul ET sur la fiabilité.
// ─────────────────────────────────────────────────────────────────────────
import { LEVELS } from "./constants";
import { expandRounds, roundIndexOf, roundWeight, sessionKeyOf } from "./rounds";

// Numéro de version du calcul — à incrémenter à CHAQUE changement de règle
// ci-dessous. L'admin compare ce numéro à celui du dernier recalcul appliqué
// (stocké dans settings/appConfig) pour afficher "Recalcul conseillé".
export const RANKING_ENGINE_VERSION = 4;

// ─── Constantes (voir §4.2, §4.4, §4.6, §13 de la spec — ajustées par
// simulation, voir claude/feature-ranking-padel-manager.md §12 et
// claude/feature-ranking-v2-progression-assiduite-2026-09-19.md §11) ────────
export const RANKING_SCALE_MIN = 1;
export const RANKING_SCALE_MAX = 10;

const K_MAX = 0.55;
const K_MIN = 0.06;
const K_TAU = 18;
const ELO_DIVISOR = 3;

const MARGIN_FLOOR = 0.7;
const MARGIN_CEIL = 1.3;
const MARGIN_SLOPE = 1.2;

// v2 — règle 1 : facteur de marge quand l'équipe favorite gagne.
const FAVOURITE_WIN_MARGIN = 0.7;
// v2 — règle 2 : pénalité de déséquilibre entre les deux partenaires.
const PARTNER_GAP_WEIGHT = 0.15;
// v2 — règle 3 : multiplicateur des gains (deltas positifs).
const WIN_GAIN_MULTIPLIER = 1.2;
// v2 — règle 4 : plafond souple de progression.
const CAP_WINDOW_MATCHES = 40; // fenêtre = une saison de 40 matchs officiels
const CAP_FREE_PROGRESSION = 1.0; // libre jusqu'à +1,0
const CAP_ZERO_PROGRESSION = 2.5; // gains annulés à partir de +2,5
// v2 — règle 5 : bonus d'assiduité (par match noté, victoire ou défaite).
const BONUS_AT_LOW_RANKING = 0.015; // ranking ≤ 3
const BONUS_AT_HIGH_RANKING = 0.006; // ranking ≥ 8
const BONUS_LOW_RANKING = 3;
const BONUS_RANKING_SPAN = 5;
const BONUS_TAPER_FULL = 0.5; // bonus complet tant que ranking − départ ≤ 0,5
const BONUS_TAPER_END = 1.0; // bonus nul dès ranking − départ ≥ 1,0

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

// ─── v2 : contexte de progression d'un joueur (règles 4 et 5) ─────────────
// `history` : ses rankings APRÈS chacun de ses matchs officiels notés
// précédents, du plus ancien au plus récent. `startRef` : son point de
// départ de référence — le ranking de son niveau officiel déclaré, ou, pour
// un joueur "Non classé", son ranking après son tout premier match noté.
// Si le contexte manque (ne devrait pas arriver), on retombe sur "aucune
// progression connue" : plafond inactif et bonus complet.
function progressionOf(state, context) {
  const history = (context && context.history) || [];
  const startRef =
    context && typeof context.startRef === "number" ? context.startRef : state.score;
  const windowRef =
    history.length >= CAP_WINDOW_MATCHES ? history[history.length - CAP_WINDOW_MATCHES] : startRef;
  return {
    windowProgression: Math.max(0, state.score - windowRef),
    overStart: state.score - startRef,
  };
}

// Règle 4 : facteur du plafond souple (1 = libre, 0 = gains annulés).
export function capFactorFromProgression(windowProgression) {
  if (windowProgression <= CAP_FREE_PROGRESSION) return 1;
  return Math.max(
    0,
    (CAP_ZERO_PROGRESSION - windowProgression) / (CAP_ZERO_PROGRESSION - CAP_FREE_PROGRESSION)
  );
}

// Règle 5 : bonus d'assiduité de base pour un ranking donné (plus petit
// quand le ranking est déjà élevé), avant extinction et plafond.
export function attendanceBonusBase(score) {
  const t = clamp((score - BONUS_LOW_RANKING) / BONUS_RANKING_SPAN, 0, 1);
  return BONUS_AT_LOW_RANKING - (BONUS_AT_LOW_RANKING - BONUS_AT_HIGH_RANKING) * t;
}
function attendanceTaper(overStart) {
  if (overStart <= BONUS_TAPER_FULL) return 1;
  if (overStart >= BONUS_TAPER_END) return 0;
  return (BONUS_TAPER_END - overStart) / (BONUS_TAPER_END - BONUS_TAPER_FULL);
}

// Force d'une équipe pour le résultat attendu (règle 2) : moyenne des deux
// rankings, moins 0,15 × l'écart entre les deux partenaires.
function teamStrength(contributions) {
  const mean = (contributions[0] + contributions[1]) / 2;
  return mean - PARTNER_GAP_WEIGHT * Math.abs(contributions[0] - contributions[1]);
}

// Contributions individuelles d'une équipe : le ranking de chaque joueur,
// ou `niveau_ancre` pour un joueur "Non classé" (§4.7).
function teamContributions(teamStates, oppTeamStates) {
  const anchor = opposingAnchor(oppTeamStates);
  return teamStates.map((s) => (s.hasRanking ? s.score : anchor));
}

// ─── §4.1-§4.5 + §4.7 + règles v2 : calcule les deltas des 4 joueurs ───────
// `teamA`/`teamB` : tableaux de 2 `{ playerId, state }` (state = résultat de
// getPlayerRatingState). `contextById` : `{ [playerId]: { history, startRef } }`
// (voir progressionOf ci-dessus). Retourne `null` si l'un des deux camps n'a
// pas exactement 2 joueurs (garde-fou — voir §5, "match à 3 joueurs" : ce
// cas n'existe pas dans l'usage réel du club, mais on ne calcule jamais de
// ranking sur des données incomplètes plutôt que de risquer un calcul
// faux/biaisé).
//
// Ordre de calcul pour un joueur classé : marge → delta de base
// K·(résultat − attendu)·marge → ×1,2 si gain → plafond souple si gain →
// + bonus d'assiduité (lui aussi plafonné) → écrêtage 1..10. `delta` stocké
// = variation TOTALE (bonus compris), pour que l'annulation d'une correction
// (§4.8) retire exactement ce qui a été ajouté.
function computeFreshDeltas({ teamA, teamB, sets, winningTeam, contextById, weight = 1 }) {
  if (!teamA || !teamB || teamA.length !== 2 || teamB.length !== 2) return null;

  const statesA = teamA.map((p) => p.state);
  const statesB = teamB.map((p) => p.state);
  const anchorForA = opposingAnchor(statesB); // "niveau_ancre" si un joueur de A est non classé
  const anchorForB = opposingAnchor(statesA); // idem pour B
  const strengthA = teamStrength(teamContributions(statesA, statesB));
  const strengthB = teamStrength(teamContributions(statesB, statesA));
  const expectedA = expectedScore(strengthA, strengthB);
  const expectedB = 1 - expectedA;

  // Règle 1 : l'équipe favorite qui gagne obtient le facteur de marge minimal.
  let marginFactorValue = marginFactorFromSets(sets, winningTeam);
  const favouriteWon =
    (winningTeam === "A" && expectedA > 0.5) || (winningTeam === "B" && expectedB > 0.5);
  if (favouriteWon) marginFactorValue = FAVOURITE_WIN_MARGIN;

  const entries = {};
  const contexts = contextById || {};

  const processTeam = (team, myTeamLabel, expectedForTeam, anchorForTeam) => {
    team.forEach(({ playerId, state }) => {
      const resultat = resultValue(myTeamLabel, winningTeam);
      if (state.hasRanking) {
        // Cas normal — §4.1 à §4.5 + règles v2 3, 4 et 5.
        const k = kFactor(state.reliability);
        let delta = k * (resultat - expectedForTeam) * marginFactorValue * weight;
        const { windowProgression, overStart } = progressionOf(state, contexts[playerId]);
        const capFactor = capFactorFromProgression(windowProgression);
        if (delta > 0) delta = delta * WIN_GAIN_MULTIPLIER * capFactor;
        // v4 : le bonus d'assiduité n'est versé qu'une fois par session.
        const bonusDone = Boolean(contexts[playerId] && contexts[playerId].bonusDone);
        const bonus = bonusDone
          ? 0
          : attendanceBonusBase(state.score) * attendanceTaper(overStart) * capFactor;
        delta += bonus;
        const apres = clamp(state.score + delta, RANKING_SCALE_MIN, RANKING_SCALE_MAX);
        entries[playerId] = {
          avant: state.score,
          apres,
          delta,
          attendu: expectedForTeam,
          resultat,
          facteurMarge: marginFactorValue,
          bonus,
          facteurPlafond: capFactor,
          wasBootstrap: false,
          poids: weight,
        };
      } else {
        // Amorçage (§4.7) — attendu fixé à 0.5, K(0) = K_max, fiabilité → 1.
        // Pas de plafond ni de bonus (aucun historique), gain ×1,2 comme
        // pour les autres joueurs.
        let delta = kFactor(0) * (resultat - 0.5) * marginFactorValue * weight;
        if (delta > 0) delta *= WIN_GAIN_MULTIPLIER;
        const apres = clamp(anchorForTeam + delta, RANKING_SCALE_MIN, RANKING_SCALE_MAX);
        entries[playerId] = {
          avant: null,
          apres,
          delta,
          attendu: 0.5,
          resultat,
          facteurMarge: marginFactorValue,
          bonus: 0,
          facteurPlafond: 1,
          wasBootstrap: true,
          poids: weight,
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
  // v3 : un match "bonus seul" (sans score) n'avait pas touché à la fiabilité,
  // donc son annulation ne la baisse pas non plus.
  const currentReliability = currentState.hasRanking ? currentState.reliability : 0;
  const newReliability = oldEntry.bonusOnly
    ? currentReliability
    : Math.max(0, currentReliability - (typeof oldEntry.poids === "number" ? oldEntry.poids : 1));
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
export function computeFreshRankingForMatch({
  teamAIds,
  teamBIds,
  statesById,
  sets,
  winningTeam,
  contextById,
  weight = 1,
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
  if (new Set(allIds).size !== 4) return null;
  if (allIds.some((id) => !statesById[id])) return null;

  const teamA = teamAIds.map((id) => ({ playerId: id, state: statesById[id] }));
  const teamB = teamBIds.map((id) => ({ playerId: id, state: statesById[id] }));
  const levelDeltas = computeFreshDeltas({ teamA, teamB, sets, winningTeam, contextById, weight });
  if (!levelDeltas) return null;

  const newStates = {};
  allIds.forEach((id) => {
    const entry = levelDeltas[id];
    const prevState = statesById[id];
    newStates[id] = {
      score: entry.apres,
      reliability: (entry.wasBootstrap ? 0 : prevState.reliability) + weight,
      hasRanking: true,
    };
  });
  return { levelDeltas, newStates };
}

// ─── v3 : match joué SANS score ("Pas de score", matchType "Amical") ──────
// Chaque joueur qui a un ranking reçoit uniquement le bonus d'assiduité (règle
// 5, avec extinction et plafond souple comme pour un match noté). La
// fiabilité ne change pas (aucune information sur le niveau) et les équipes
// n'ont aucune importance (personne ne gagne ni ne perd). Un joueur "Non
// classé" ne reçoit rien (pas de niveau de référence) et n'apparaît donc pas
// dans le résultat. Même garde-fou 2v2 que computeFreshRankingForMatch.
// Retourne `null` si la composition est incomplète/incohérente, sinon
// `{ levelDeltas, newStates }` (les deux peuvent être vides si aucun des 4
// joueurs n'a de ranking). Les entrées portent `bonusOnly: true`.
export function computeBonusOnlyForMatch({ teamAIds, teamBIds, statesById, contextById }) {
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

  const contexts = contextById || {};
  const levelDeltas = {};
  const newStates = {};
  allIds.forEach((id) => {
    const state = statesById[id];
    if (!state.hasRanking) return;
    // v4 : bonus d'assiduité déjà versé plus tôt dans cette session.
    if (contexts[id] && contexts[id].bonusDone) return;
    const { windowProgression, overStart } = progressionOf(state, contexts[id]);
    const capFactor = capFactorFromProgression(windowProgression);
    const bonus = attendanceBonusBase(state.score) * attendanceTaper(overStart) * capFactor;
    const apres = clamp(state.score + bonus, RANKING_SCALE_MIN, RANKING_SCALE_MAX);
    levelDeltas[id] = {
      avant: state.score,
      apres,
      delta: bonus,
      attendu: null,
      resultat: null,
      facteurMarge: null,
      bonus,
      facteurPlafond: capFactor,
      wasBootstrap: false,
      bonusOnly: true,
    };
    newStates[id] = { score: apres, reliability: state.reliability, hasRanking: true };
  });
  return { levelDeltas, newStates };
}

// ─── v2 : contexte de progression construit depuis les matchs existants ───
// Clé chronologique d'un match (même convention que
// getRecentLevelDeltaHistory plus bas et que getMatchStart de matchLogic.js).
function matchChronoKey(match) {
  return `${match.date || ""}T${match.time || "00:00"}`;
}
// Tri chronologique unique, partagé avec le recalcul admin (rankingRecalc.js)
// pour que le rejeu et la saisie en direct ordonnent les matchs pareil.
export function compareMatchesChronologically(a, b) {
  const diff = matchChronoKey(a).localeCompare(matchChronoKey(b));
  if (diff !== 0) return diff;
  // v4 : à date/heure égales, la manche 1 (match de base) précède la manche 2…
  const roundDiff = roundIndexOf(a) - roundIndexOf(b);
  if (roundDiff !== 0) return roundDiff;
  return String(a.id).localeCompare(String(b.id));
}

// Pour chaque joueur de `playerIds` : `{ history, startRef, bonusDone }` (voir
// progressionOf). `history` = ses rankings APRÈS ses manches/matchs
// (portant un `levelDeltas` à son nom) STRICTEMENT antérieurs au match
// `currentMatch` (lui-même exclu), dans l'ordre chronologique — les manches
// supplémentaires (voir rounds.js) sont incluses. `startRef` = ranking de son
// niveau officiel déclaré, ou — sans niveau déclaré ("Non classé") — son
// ranking après son tout premier match noté. `bonusDone` (v4) = true si le
// joueur a déjà une entrée de niveau plus tôt dans la MÊME session : le bonus
// d'assiduité ne doit alors pas être versé une deuxième fois.
export function buildRankingContext({ playerIds, playersById, matches, currentMatch }) {
  const currentKey = currentMatch ? matchChronoKey(currentMatch) : null;
  const currentId = currentMatch ? currentMatch.id : null;
  const currentRound = currentMatch ? roundIndexOf(currentMatch) : 0;
  const currentSession = currentMatch ? sessionKeyOf(currentMatch) : null;
  const all = expandRounds(matches);
  const contextById = {};
  playerIds.forEach((id) => {
    const before = all
      .filter((m) => {
        if (m.id === currentId || !m.levelDeltas || !m.levelDeltas[id]) return false;
        if (currentKey === null) return true;
        const key = matchChronoKey(m);
        if (key !== currentKey) return key < currentKey;
        return roundIndexOf(m) <= currentRound;
      })
      .sort(compareMatchesChronologically);
    const history = before.map((m) => m.levelDeltas[id].apres).filter((v) => typeof v === "number");
    // Bonus déjà versé dans cette session (par une AUTRE manche, avant ou après :
    // une manche peut être ajoutée avant que le score de base ne soit encodé).
    const bonusDone =
      currentSession !== null &&
      all.some(
        (m) =>
          m.id !== currentId &&
          sessionKeyOf(m) === currentSession &&
          m.levelDeltas &&
          m.levelDeltas[id] &&
          m.levelDeltas[id].bonus > 0
      );
    const base = getScoreBase(playersById[id] && playersById[id].levelSortValue);
    contextById[id] = {
      history,
      startRef: base != null ? base : history.length ? history[0] : null,
      bonusDone,
    };
  });
  return contextById;
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
// `matches` + `match` (v2) : tous les matchs connus et le match en cours de
// saisie — servent à reconstituer l'historique de chaque joueur (plafond
// souple et bonus d'assiduité, voir buildRankingContext). Sans eux, ces deux
// règles se comportent comme si le joueur n'avait aucun historique.
//
// `bonusOnly` (v3) : true pour un match joué SANS score ("Pas de score") — seul
// le bonus d'assiduité est appliqué (voir computeBonusOnlyForMatch), `sets` et
// `winningTeam` sont alors ignorés. Un éventuel ancien ajustement de ce match
// (ex. il avait un score avant correction) est annulé comme d'habitude.
//
// Retourne `null` si les 4 ids ne forment pas 2 équipes de 2 joueurs
// distincts (garde-fou, §5) — l'appelant ne touche alors à rien côté
// ranking. Sinon, retourne `{ levelDeltas, playerUpdates }` :
// - `levelDeltas` : à écrire tel quel sur `match.levelDeltas` (peut être VIDE
//   en mode `bonusOnly` si aucun des 4 joueurs n'a de ranking : l'appelant
//   supprime alors le champ plutôt que d'écrire un objet vide).
// - `playerUpdates` : `{ [playerId]: {internalScore, internalScoreReliability} | UNRANK_PLAYER }`
//   à appliquer sur chaque document joueur concerné.
export function computeRankingUpdateForMatch({
  teamAIds,
  teamBIds,
  playersById,
  sets,
  winningTeam,
  previousLevelDeltas,
  matches,
  match,
  bonusOnly = false,
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

  // Joueur « Invité » (25/09/2026) : une personne différente à chaque fois,
  // donc jamais de Niveau. Il est calculé comme « Non classé » (les 3 autres
  // joueurs sont notés normalement, comme avec n'importe quel joueur sans
  // niveau) mais rien n'est jamais écrit à son nom — ni sur sa fiche, ni dans
  // `levelDeltas` du match.
  const isGuest = (id) => Boolean(playersById[id] && playersById[id].isGuest === true);
  allIds.forEach((id) => {
    if (isGuest(id)) statesById[id] = { score: null, reliability: 0, hasRanking: false };
  });

  const contextById = buildRankingContext({
    playerIds: allIds,
    playersById,
    matches,
    currentMatch: match,
  });
  const fresh = bonusOnly
    ? computeBonusOnlyForMatch({ teamAIds, teamBIds, statesById, contextById })
    : computeFreshRankingForMatch({
        teamAIds,
        teamBIds,
        statesById,
        sets,
        winningTeam,
        contextById,
        weight: roundWeight(roundIndexOf(match)), // v4 : manche 2, 3… à 60 %
      });
  if (!fresh) return null;

  // Match noté : les 4 joueurs ont un nouvel état. Match sans score : seuls les
  // joueurs classés en ont un ; un joueur non classé n'est touché que si un
  // ancien ajustement de ce match vient d'être annulé (retour éventuel à
  // "Non classé" après annulation d'un amorçage).
  const playerUpdates = {};
  const levelDeltas = { ...fresh.levelDeltas };
  allIds.forEach((id) => {
    if (isGuest(id)) {
      // Jamais de niveau pour un invité ; s'il en portait un d'un ancien
      // calcul de ce match, on le remet à « Non classé ».
      delete levelDeltas[id];
      if (previousLevelDeltas && previousLevelDeltas[id]) playerUpdates[id] = UNRANK_PLAYER;
      return;
    }
    if (fresh.newStates[id]) {
      playerUpdates[id] = stateToPlayerUpdate(fresh.newStates[id]);
    } else if (previousLevelDeltas && previousLevelDeltas[id]) {
      playerUpdates[id] = stateToPlayerUpdate(statesById[id]);
    }
  });

  return { levelDeltas, playerUpdates };
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
// v3 : par défaut, les matchs "bonus seul" (sans score, entrée `bonusOnly`)
// sont exclus — la sparkline et le "Dernier : ▲ +0,3" de "Mon profil" parlent
// de vrais résultats. L'historique admin passe `includeBonusOnly = true`.
export function getRecentLevelDeltaHistory(playerId, matches, limit = 10, includeBonusOnly = false) {
  const relevant = expandRounds(matches)
    .filter(
      (m) =>
        m.levelDeltas &&
        m.levelDeltas[playerId] &&
        (includeBonusOnly || !m.levelDeltas[playerId].bonusOnly)
    )
    .map((m) => ({ match: m, entry: m.levelDeltas[playerId] }))
    .sort((a, b) => compareMatchesChronologically(a.match, b.match));
  return relevant.slice(-limit);
}
