// ─────────────────────────────────────────────────────────────────────────
// Remise dans l'ordre d'une soirée (ajouté le 04/10/2026).
//
// Problème corrigé : quand un score est encodé « dans le désordre » (ex. la
// manche 2 avant la manche 1, ou une correction de la manche 1 alors que la
// manche 2 est déjà calculée), le niveau de chaque joueur était calculé dans
// l'ordre de SAISIE et non dans l'ordre du jeu : l'historique affichait des
// « Avant → Après » qui ne se suivaient pas.
//
// Solution : juste après chaque enregistrement d'un score, si une manche
// POSTÉRIEURE de la même soirée (même date, heure et club) a déjà un niveau
// calculé pour un des joueurs concernés, on rejoue toute la soirée dans
// l'ordre chronologique, exactement comme le fait le bouton admin « Recalcul
// du niveau » (src/lib/rankingRecalc.js), mais limité à cette soirée.
//
// Coût Firebase : AUCUNE lecture en plus (tout est déjà chargé dans l'app).
// Écritures : 0 dans le cas normal (manche 1 puis manche 2…), et seulement
// quand l'ordre était inversé : quelques documents de match + les joueurs de
// la soirée, ajoutés au MÊME writeBatch que la saisie du score (atomique).
//
// Le calcul est pur ; seule `addSessionResyncToBatch` touche à Firestore.
// ─────────────────────────────────────────────────────────────────────────
import { doc, deleteField } from "firebase/firestore";
import { db } from "../firebase";
import { computeWinnerFromSets, hasMatchScore } from "./matchLogic";
import { expandRounds, roundIndexOf, baseIdOf, sessionKeyOf, roundWeight } from "./rounds";
import {
  getPlayerRatingState,
  getScoreBase,
  computeFreshRankingForMatch,
  computeBonusOnlyForMatch,
  compareMatchesChronologically,
  UNRANK_PLAYER,
  RANKING_SCALE_MIN,
  RANKING_SCALE_MAX,
} from "./levelRating";

const EPS = 1e-9;
const chronoKey = (m) => `${m.date || ""}T${m.time || "00:00"}`;
const hasData = (d) => Boolean(d) && Object.keys(d).length > 0;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Deux `levelDeltas` identiques (à 1e-9 près sur les nombres) ?
function sameDeltas(a, b) {
  if (!hasData(a) && !hasData(b)) return true;
  if (!hasData(a) || !hasData(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((id) => {
    const x = a[id];
    const y = b[id];
    if (!x || !y) return false;
    const fields = new Set([...Object.keys(x), ...Object.keys(y)]);
    return [...fields].every((f) => {
      const u = x[f];
      const v = y[f];
      if (isNum(u) && isNum(v)) return Math.abs(u - v) < EPS;
      return u === v || (u == null && v == null);
    });
  });
}

// `patch.levelDeltas === null` / `patch.rounds === null` = champ supprimé.
function patchMatch(match, patch) {
  const out = { ...match, ...patch };
  if (patch.levelDeltas === null) delete out.levelDeltas;
  if (patch.rounds === null) delete out.rounds;
  return out;
}

// Calcul pur. Paramètres :
// - `matches`, `players` : l'état de l'app AVANT l'enregistrement.
// - `matchId`, `roundIndex` : la manche qui vient d'être enregistrée (0 = match
//   de base, 1+ = manche ajoutée) ou supprimée.
// - `matchPatch` : ce que l'enregistrement change sur le document du match
//   (valeurs simples, `null` = champ supprimé).
// - `rankingResult` : le résultat `{ playerUpdates }` déjà calculé par la
//   fenêtre de saisie (peut être null).
// Retourne `null` (rien à faire) ou `{ matchOps, playerUpdates }`.
export function computeSessionResync({
  matches,
  players,
  matchId,
  roundIndex = 0,
  matchPatch,
  rankingResult,
}) {
  const refDoc = (matches || []).find((m) => m.id === matchId);
  if (!refDoc) return null;
  const idOf = (idx) => (idx > 0 ? `${matchId}#r${idx}` : matchId);
  const refId = idOf(roundIndex);

  const before = expandRounds(matches);
  const matchesAfter = matches.map((m) => (m.id === matchId ? patchMatch(m, matchPatch || {}) : m));
  const after = expandRounds(matchesAfter);
  const refBefore = before.find((m) => m.id === refId);
  const refAfter = after.find((m) => m.id === refId);

  const sk = sessionKeyOf(refDoc);
  const refKey = chronoKey(refDoc);

  // Joueurs directement concernés par la manche enregistrée.
  const affected = new Set([
    ...Object.keys((refBefore && refBefore.levelDeltas) || {}),
    ...((refAfter && refAfter.participants) || []).map((p) => p.playerId),
  ]);

  const isLater = (r) =>
    chronoKey(r) > refKey || (chronoKey(r) === refKey && roundIndexOf(r) > roundIndex);

  // Déclencheur : une manche POSTÉRIEURE de la soirée a déjà un niveau calculé
  // pour l'un de ces joueurs. Sinon (cas normal) : rien à faire, 0 écriture.
  const needsResync = after.some(
    (r) =>
      sessionKeyOf(r) === sk &&
      r.id !== refId &&
      isLater(r) &&
      hasData(r.levelDeltas) &&
      Object.keys(r.levelDeltas).some((id) => affected.has(id))
  );
  if (!needsResync) return null;

  // Joueurs après l'écriture déjà prévue par la fenêtre de saisie.
  const playersAfter = players.map((p) => {
    const u = rankingResult && rankingResult.playerUpdates && rankingResult.playerUpdates[p.id];
    if (!u) return p;
    const copy = { ...p };
    if (u === UNRANK_PLAYER) {
      delete copy.internalScore;
      delete copy.internalScoreReliability;
    } else {
      Object.assign(copy, u);
    }
    return copy;
  });
  const playersById = Object.fromEntries(playersAfter.map((p) => [p.id, p]));

  const sessRounds = after.filter((r) => sessionKeyOf(r) === sk).sort(compareMatchesChronologically);

  const sessionIds = new Set();
  sessRounds.forEach((r) => {
    (r.participants || []).forEach((p) => sessionIds.add(p.playerId));
    Object.keys(r.levelDeltas || {}).forEach((id) => sessionIds.add(id));
  });
  // Joueur introuvable (supprimé) : données incohérentes, on ne touche à rien.
  for (const id of sessionIds) if (!playersById[id]) return null;

  // État de chaque joueur AVANT la soirée = état actuel moins ses entrées de la soirée.
  const statesById = {};
  const startById = {};
  const historyById = {};
  const guestIds = new Set();
  sessionIds.forEach((id) => {
    const p = playersById[id];
    const isGuest = p.isGuest === true;
    if (isGuest) guestIds.add(id);
    const cur = getPlayerRatingState(p);
    const entries = sessRounds.map((r) => r.levelDeltas && r.levelDeltas[id]).filter(Boolean);
    let pre;
    if (isGuest || entries.some((e) => e.wasBootstrap)) {
      pre = { score: null, reliability: 0, hasRanking: false };
    } else if (!cur.hasRanking || entries.length === 0) {
      pre = cur;
    } else {
      const sumDelta = entries.reduce((a, e) => a + (isNum(e.delta) ? e.delta : 0), 0);
      const sumWeight = entries.reduce(
        (a, e) => a + (e.bonusOnly ? 0 : isNum(e.poids) ? e.poids : 1),
        0
      );
      pre = {
        score: clamp(cur.score - sumDelta, RANKING_SCALE_MIN, RANKING_SCALE_MAX),
        reliability: Math.max(0, cur.reliability - sumWeight),
        hasRanking: true,
      };
    }
    statesById[id] = pre;
    historyById[id] = isGuest
      ? []
      : after
          .filter(
            (m) =>
              sessionKeyOf(m) !== sk &&
              chronoKey(m) < refKey &&
              m.levelDeltas &&
              m.levelDeltas[id]
          )
          .sort(compareMatchesChronologically)
          .map((m) => m.levelDeltas[id].apres)
          .filter(isNum);
    const base = isGuest ? null : getScoreBase(p.levelSortValue);
    startById[id] = base != null ? base : historyById[id].length ? historyById[id][0] : null;
  });

  // Rejeu chronologique de la soirée (mêmes règles que rankingRecalc.js).
  const isScoredOfficial = (m) => m.matchType === "Officiel" && hasMatchScore(m);
  const isBonusOnly = (m) => m.matchType === "Amical" && !hasMatchScore(m);
  const eligible = sessRounds.filter((m) => isScoredOfficial(m) || isBonusOnly(m));
  const bonusDone = new Set();
  const replayedCount = {};
  const desired = {}; // id de manche -> levelDeltas

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
          bonusDone: bonusDone.has(id),
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
    if (!fresh) return;
    [...teamAIds, ...teamBIds].forEach((id) => {
      if (guestIds.has(id)) {
        delete fresh.levelDeltas[id];
        delete fresh.newStates[id];
      }
    });
    if (Object.keys(fresh.levelDeltas).length === 0) return;
    desired[m.id] = fresh.levelDeltas;
    Object.entries(fresh.levelDeltas).forEach(([id, entry]) => {
      if (entry.bonus > 0) bonusDone.add(id);
    });
    Object.entries(fresh.newStates).forEach(([id, state]) => {
      statesById[id] = state;
      historyById[id] = [...historyById[id], state.score];
      if (startById[id] == null) startById[id] = state.score;
      replayedCount[id] = (replayedCount[id] || 0) + 1;
    });
  });

  // Écritures de matchs : uniquement les documents dont un levelDeltas change.
  const matchOps = [];
  const baseIds = new Set(sessRounds.map((r) => baseIdOf(r)));
  baseIds.forEach((bid) => {
    const d = matchesAfter.find((m) => m.id === bid);
    if (!d) return;
    const op = { matchId: bid };
    let changed = false;
    const des0 = desired[d.id];
    if (!sameDeltas(d.levelDeltas, des0)) {
      op.levelDeltas = hasData(des0) ? des0 : null;
      changed = true;
    }
    const rs = Array.isArray(d.rounds) ? d.rounds : [];
    let roundsChanged = false;
    const newRounds = rs.map((r, i) => {
      const des = desired[`${d.id}#r${i + 1}`];
      if (sameDeltas(r && r.levelDeltas, des)) return r;
      roundsChanged = true;
      const { levelDeltas: _old, ...rest } = r || {};
      return hasData(des) ? { ...rest, levelDeltas: des } : rest;
    });
    if (roundsChanged) {
      op.rounds = newRounds;
      changed = true;
    }
    if (changed) matchOps.push(op);
  });

  // Écritures de joueurs : uniquement ceux dont le niveau final diffère.
  const playerUpdates = {};
  sessionIds.forEach((id) => {
    if (guestIds.has(id)) return;
    const p = playersById[id];
    const fin = statesById[id];
    const hadStored = typeof p.internalScore === "number";
    if (!fin.hasRanking) {
      if (hadStored || typeof p.internalScoreReliability === "number") {
        playerUpdates[id] = UNRANK_PLAYER;
      }
      return;
    }
    const same =
      hadStored &&
      Math.abs(p.internalScore - fin.score) < EPS &&
      Math.abs((p.internalScoreReliability || 0) - fin.reliability) < EPS;
    if (same) return;
    if (!hadStored && !replayedCount[id]) return; // niveau « de base » calculé à la volée
    playerUpdates[id] = { internalScore: fin.score, internalScoreReliability: fin.reliability };
  });

  if (matchOps.length === 0 && Object.keys(playerUpdates).length === 0) return null;
  return { matchOps, playerUpdates };
}

// Ajoute les écritures de remise en ordre au `writeBatch` de la fenêtre de
// saisie (appeler JUSTE AVANT `batch.commit()`). Ne bloque jamais
// l'enregistrement : en cas de problème, on ignore simplement la remise en
// ordre (le « Recalcul du niveau » admin reste disponible). Retourne le nombre
// d'écritures ajoutées.
export function addSessionResyncToBatch({ batch, ...params }) {
  try {
    const res = computeSessionResync(params);
    if (!res) return 0;
    let count = 0;
    res.matchOps.forEach((op) => {
      const update = {};
      if (op.levelDeltas !== undefined) {
        update.levelDeltas = op.levelDeltas === null ? deleteField() : op.levelDeltas;
      }
      if (op.rounds !== undefined) update.rounds = op.rounds;
      batch.update(doc(db, "matches", op.matchId), update);
      count += 1;
    });
    Object.entries(res.playerUpdates).forEach(([playerId, update]) => {
      const ref = doc(db, "players", playerId);
      if (update === UNRANK_PLAYER) {
        batch.update(ref, {
          internalScore: deleteField(),
          internalScoreReliability: deleteField(),
        });
      } else {
        batch.update(ref, update);
      }
      count += 1;
    });
    return count;
  } catch (error) {
    console.warn("Remise en ordre de la soirée ignorée :", error);
    return 0;
  }
}
