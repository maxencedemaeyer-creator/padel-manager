// ─────────────────────────────────────────────────────────────────────────
// Recalcul complet du Ranking (bouton admin "Recalcul du ranking") — rejoue
// TOUT l'historique des matchs officiels notés ET (depuis la version 3 du
// calcul) des matchs joués "sans score" (matchType "Amical", qui ne rapportent
// que le bonus d'assiduité), dans l'ordre chronologique, avec les règles du
// code actuellement déployé (voir
// RANKING_ENGINE_VERSION dans src/lib/levelRating.js et
// claude/feature-ranking-v2-progression-assiduite-2026-09-19.md §7).
//
// Fichier PUR (aucune écriture Firebase ici) : `computeFullRecalculation`
// ne fait que calculer ce qui SERAIT écrit. AdminView.jsx s'en sert d'abord
// pour l'aperçu (sans rien écrire), puis pour l'application réelle.
//
// Point de départ : le niveau officiel ACTUEL de chaque joueur (relu depuis
// son libellé `level`, comme le faisait l'ancienne "Étape 1", ce qui répare
// aussi un éventuel `levelSortValue` incohérent). Les recalibrages manuels de
// niveau faits dans le passé ne sont pas rejoués : chaque joueur repart de
// son niveau officiel d'aujourd'hui et rejoue tous ses matchs depuis le
// premier.
// ─────────────────────────────────────────────────────────────────────────
import { LEVELS } from "./constants";
import { computeWinnerFromSets, hasMatchScore } from "./matchLogic";
import { expandRounds, roundIndexOf, roundWeight, baseIdOf, sessionKeyOf } from "./rounds";
import {
  getPlayerRatingState,
  getScoreBase,
  computeFreshRankingForMatch,
  computeBonusOnlyForMatch,
  compareMatchesChronologically,
} from "./levelRating";

const EPSILON = 1e-9;

function officialLevelValue(player) {
  const levelInfo = LEVELS.find((l) => l.label === (player.level || "Pas de niveau"));
  if (levelInfo) return levelInfo.value;
  return typeof player.levelSortValue === "number" ? player.levelSortValue : 0;
}

// Retourne :
// - `playerRows` : une ligne par joueur (pour l'aperçu) — ancien/nouveau
//   ranking, nombre de matchs NOTÉS rejoués (`matchesCount` : les matchs sans
//   score, qui ne rapportent que le bonus d'assiduité, n'y sont pas comptés).
// - `playerWrites` : `{ [playerId]: { levelSortValue?, internalScore?,
//   internalScoreReliability?, unrank? } }` — uniquement les joueurs dont
//   une donnée change réellement. `unrank: true` = supprimer
//   internalScore/internalScoreReliability (retour à "score de base" ou
//   "Non classé").
// - `matchWrites` : `[{ matchId, roundIndex, levelDeltas }]` — manches à
//   (ré)écrire (`roundIndex` 0 = le match de base, 1+ = manches ajoutées, voir
//   rounds.js — v4).
// - `matchClears` : `[{ matchId, roundIndex }]` — manches qui portent un
//   `levelDeltas` devenu sans objet (plus officiel, plus de score, composition
//   incomplète) — à effacer.
// - `matchOps` : la même chose, regroupée par document Firestore, prête à
//   écrire : `[{ matchId, levelDeltas?: objet | null (null = supprimer le
//   champ), rounds?: tableau complet des manches à réécrire }]`.
// - `stats`.
export function computeFullRecalculation({ players, matches }) {
  const statesById = {};
  const historyById = {};
  const startById = {};
  const countById = {}; // tous les matchs rejoués (notés + sans score)
  const scoredCountById = {}; // seulement les matchs notés (affiché dans l'aperçu)
  const levelFixById = {};

  players.forEach((p) => {
    const levelValue = officialLevelValue(p);
    if (p.levelSortValue !== levelValue) levelFixById[p.id] = levelValue;
    // Joueur « Invité » : jamais de Niveau (voir levelRating.js) — toujours
    // « Non classé » ici, même si sa fiche porte encore un ancien niveau.
    const base = p.isGuest === true ? null : getScoreBase(levelValue);
    statesById[p.id] =
      base == null
        ? { score: null, reliability: 0, hasRanking: false }
        : { score: base, reliability: 0, hasRanking: true };
    historyById[p.id] = [];
    startById[p.id] = base;
    countById[p.id] = 0;
    scoredCountById[p.id] = 0;
  });

  // Matchs rejoués : officiels avec score (calcul complet) + matchs joués sans
  // score, confirmés par « Pas de score » (matchType "Amical", bonus seul).
  const isScoredOfficial = (m) => m.matchType === "Officiel" && hasMatchScore(m);
  const isBonusOnly = (m) => m.matchType === "Amical" && !hasMatchScore(m);
  // v4 : les manches supplémentaires sont rejouées comme des matchs à part
  // entière (`expandRounds`), juste après leur match de base.
  const allRounds = expandRounds(matches);
  const eligible = allRounds
    .filter((m) => isScoredOfficial(m) || isBonusOnly(m))
    .sort(compareMatchesChronologically);
  const sessionEntries = new Set(); // "session|joueur" : bonus d'assiduité déjà versé
  const guestIds = new Set(players.filter((p) => p.isGuest === true).map((p) => p.id));

  const matchWrites = [];
  const replayedIds = new Set();
  let skippedIncomplete = 0;

  eligible.forEach((m) => {
    const bonusOnly = isBonusOnly(m);
    const teamAIds = (m.participants || []).filter((p) => p.team === "A").map((p) => p.playerId);
    const teamBIds = (m.participants || []).filter((p) => p.team === "B").map((p) => p.playerId);
    const contextById = {};
    [...teamAIds, ...teamBIds].forEach((id) => {
      if (statesById[id]) {
        contextById[id] = {
          history: historyById[id],
          startRef: startById[id],
          bonusDone: sessionEntries.has(`${sessionKeyOf(m)}|${id}`),
        };
      }
    });
    const fresh = bonusOnly
      ? computeBonusOnlyForMatch({ teamAIds, teamBIds, statesById, contextById })
      : computeFreshRankingForMatch({
          teamAIds,
          teamBIds,
          statesById,
          sets: m.scores || {},
          winningTeam: computeWinnerFromSets(m.scores || {}),
          contextById,
          weight: roundWeight(roundIndexOf(m)),
        });
    if (!fresh) {
      // Un match sans score à la composition incomplète est ignoré sans bruit
      // (d'anciens matchs amicaux peuvent être incomplets) ; on ne compte comme
      // « ignoré » que les matchs notés.
      if (!bonusOnly) skippedIncomplete += 1;
      return;
    }
    // Invité : aucune trace de niveau à son nom (ni dans le match, ni sur sa fiche).
    [...teamAIds, ...teamBIds].forEach((id) => {
      if (guestIds.has(id)) {
        delete fresh.levelDeltas[id];
        delete fresh.newStates[id];
      }
    });
    // Match sans score où aucun des 4 joueurs n'a de ranking : rien à écrire
    // (et un éventuel ancien levelDeltas de ce match sera effacé plus bas).
    if (Object.keys(fresh.levelDeltas).length === 0) return;
    matchWrites.push({
      matchId: baseIdOf(m),
      roundIndex: roundIndexOf(m),
      levelDeltas: fresh.levelDeltas,
    });
    replayedIds.add(m.id);
    Object.entries(fresh.levelDeltas).forEach(([id, entry]) => {
      if (entry.bonus > 0) sessionEntries.add(`${sessionKeyOf(m)}|${id}`);
    });
    Object.entries(fresh.newStates).forEach(([id, state]) => {
      statesById[id] = state;
      historyById[id] = [...historyById[id], state.score];
      if (startById[id] == null) startById[id] = state.score;
      countById[id] += 1;
      if (!bonusOnly) scoredCountById[id] += 1;
    });
  });

  const matchClears = allRounds
    .filter((m) => m.levelDeltas && !replayedIds.has(m.id))
    .map((m) => ({ matchId: baseIdOf(m), roundIndex: roundIndexOf(m) }));

  // Regroupement par document Firestore (un match + ses manches = un document).
  const opsById = new Map();
  const opFor = (matchId) => {
    if (!opsById.has(matchId)) opsById.set(matchId, { matchId, writes: {}, clears: new Set() });
    return opsById.get(matchId);
  };
  matchWrites.forEach((w) => {
    opFor(w.matchId).writes[w.roundIndex] = w.levelDeltas;
  });
  matchClears.forEach((c) => opFor(c.matchId).clears.add(c.roundIndex));
  const matchesById = new Map((matches || []).map((m) => [m.id, m]));
  const matchOps = [];
  opsById.forEach((op) => {
    const source = matchesById.get(op.matchId);
    if (!source) return;
    const out = { matchId: op.matchId };
    if (op.writes[0]) out.levelDeltas = op.writes[0];
    else if (op.clears.has(0)) out.levelDeltas = null;
    const touchesRounds =
      Object.keys(op.writes).some((k) => Number(k) > 0) ||
      [...op.clears].some((k) => k > 0);
    if (touchesRounds && Array.isArray(source.rounds)) {
      out.rounds = source.rounds.map((r, i) => {
        const idx = i + 1;
        const { levelDeltas: _old, ...rest } = r || {};
        return op.writes[idx] ? { ...rest, levelDeltas: op.writes[idx] } : rest;
      });
    }
    matchOps.push(out);
  });

  const playerRows = [];
  const playerWrites = {};
  players.forEach((p) => {
    const before = getPlayerRatingState(p);
    const after = statesById[p.id];
    // Sans aucun match rejoué, le joueur retombe sur son ranking "de base"
    // (calculé à la volée à partir de son niveau officiel) : on supprime les
    // champs stockés plutôt que d'y écrire une valeur redondante.
    const afterScore = after.hasRanking ? after.score : null;
    const afterReliability = after.hasRanking ? after.reliability : 0;
    const write = {};
    if (levelFixById[p.id] !== undefined) write.levelSortValue = levelFixById[p.id];

    const hadStored = typeof p.internalScore === "number";
    if (countById[p.id] > 0) {
      const same =
        hadStored &&
        Math.abs(p.internalScore - afterScore) < EPSILON &&
        Math.abs((p.internalScoreReliability || 0) - afterReliability) < EPSILON;
      if (!same) {
        write.internalScore = afterScore;
        write.internalScoreReliability = afterReliability;
      }
    } else if (hadStored || typeof p.internalScoreReliability === "number") {
      write.unrank = true;
    }
    if (Object.keys(write).length > 0) playerWrites[p.id] = write;

    playerRows.push({
      id: p.id,
      name: p.name,
      level: p.level || "Pas de niveau",
      before: before.hasRanking ? before.score : null,
      after: afterScore,
      matchesCount: scoredCountById[p.id],
      levelFixed: levelFixById[p.id] !== undefined,
    });
  });

  return {
    playerRows,
    playerWrites,
    matchWrites,
    matchClears,
    matchOps,
    stats: {
      matchesReplayed: matchWrites.length,
      matchesSkipped: skippedIncomplete,
      matchesCleared: matchClears.length,
      playersChanged: Object.keys(playerWrites).length,
    },
  };
}
