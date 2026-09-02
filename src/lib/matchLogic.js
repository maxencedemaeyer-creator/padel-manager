// ─────────────────────────────────────────────────────────────────────────
// Logique pure autour des matchs : horaires, statut, sets/score, places sur
// le terrain, regroupement par session. Aucune donnée Firestore ici.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { MATCH_DURATION_MINUTES, COURT_SLOT_DEFS } from "./constants";

export function getMatchStart(match) {
  return new Date(`${match.date}T${match.time || "00:00"}:00`);
}
export function getMatchEnd(match) {
  return new Date(getMatchStart(match).getTime() + MATCH_DURATION_MINUTES * 60000);
}

export function daysUntilMatch(match, now) {
  const start = getMatchStart(match);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((startDay - nowDay) / (1000 * 60 * 60 * 24));
}

// Le statut n'est plus déclenché manuellement par un bouton : il est calculé
// automatiquement à partir de l'heure de début encodée et de sa durée fixe.
export function getMatchTiming(match, now = new Date()) {
  const start = getMatchStart(match);
  const end = getMatchEnd(match);
  if (now < start) return "upcoming";
  if (now < end) return "ongoing";
  return "finished";
}

// Un set peut être l'ancien format (chaîne "6-4") ou le nouveau ({a,b}) —
// on affiche les deux de la même façon.
export function getSetDisplay(set) {
  if (!set) return null;
  if (typeof set === "string") return set || null;
  if (typeof set === "object" && set.a !== "" && set.a != null && set.b !== "" && set.b != null) {
    return `${set.a}-${set.b}`;
  }
  return null;
}
// Le vainqueur est déduit automatiquement des sets encodés — pas de choix
// manuel : l'équipe qui remporte le plus de sets gagne le match.
export function computeWinnerFromSets(sets) {
  let winsA = 0;
  let winsB = 0;
  ["set1", "set2", "set3"].forEach((k) => {
    const set = sets[k];
    if (!set || typeof set !== "object") return;
    const a = Number(set.a);
    const b = Number(set.b);
    if (set.a === "" || set.b === "" || !Number.isFinite(a) || !Number.isFinite(b)) return;
    if (a > b) winsA += 1;
    else if (b > a) winsB += 1;
  });
  if (winsA > winsB) return "A";
  if (winsB > winsA) return "B";
  return null;
}
export function hasMatchScore(match) {
  const s = match.scores || {};
  return Boolean(getSetDisplay(s.set1) || getSetDisplay(s.set2) || getSetDisplay(s.set3));
}

export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}


// Place chaque participant dans SA case fixe (team + côté). Les anciennes
// données qui n'ont qu'une équipe (sans côté) ou rien du tout se replacent
// automatiquement dans la première case encore libre, pour ne rien perdre
// à l'affichage.
export function getCourtSlots(match) {
  const participants = match.participants || [];
  const bySlot = {};

  COURT_SLOT_DEFS.forEach((def) => {
    bySlot[def.key] =
      participants.find((p) => p.team === def.team && p.courtSide === def.side) || null;
  });

  const legacyWithTeamOnly = participants.filter(
    (p) => (p.team === "A" || p.team === "B") && !p.courtSide && !Object.values(bySlot).includes(p)
  );
  legacyWithTeamOnly.forEach((p) => {
    const def = COURT_SLOT_DEFS.find((d) => d.team === p.team && !bySlot[d.key]);
    if (def) bySlot[def.key] = p;
  });

  const untracked = participants.filter(
    (p) => p.team !== "A" && p.team !== "B" && !Object.values(bySlot).includes(p)
  );
  untracked.forEach((p) => {
    const def = COURT_SLOT_DEFS.find((d) => !bySlot[d.key]);
    if (def) bySlot[def.key] = p;
  });

  return bySlot; // { topLeft, topRight, bottomLeft, bottomRight }
}


// Détermine l'ordre d'affichage des terrains d'une même session (le plus
// petit numéro en premier / à gauche), même si Firestore les renvoie dans un
// ordre différent d'une session à l'autre. Un match généré via un abonnement
// (voir CreateSeasonModal.jsx) porte désormais un champ structuré
// `match.court` — on s'appuie dessus en priorité. Pour un match plus ancien
// sans ce champ, on retombe sur l'ancienne méthode (extraire le numéro en
// fin de `location`, ex. "Club VG — Terrain 6" → 6), et à défaut sur un tri
// alphabétique du lieu, pour rester stable et prévisible.
function courtSortKey(match) {
  if (match.court != null && String(match.court).trim() !== "") {
    const n = Number(match.court);
    return { num: Number.isFinite(n) ? n : null, location: String(match.court) };
  }
  const location = match.location || "";
  const numMatch = location.match(/(\d+)\s*$/);
  return {
    num: numMatch ? Number(numMatch[1]) : null,
    location,
  };
}

function compareByCourt(a, b) {
  const ka = courtSortKey(a);
  const kb = courtSortKey(b);
  if (ka.num != null && kb.num != null && ka.num !== kb.num) return ka.num - kb.num;
  if (ka.num != null && kb.num == null) return -1;
  if (ka.num == null && kb.num != null) return 1;
  return ka.location.localeCompare(kb.location);
}

export function groupMatchesBySession(matches) {
  const map = new Map();
  matches.forEach((m) => {
    // Le club (clubId) fait désormais partie de la clé de regroupement, en
    // plus de la date et de l'heure : depuis que plusieurs abonnements
    // peuvent coexister sur la même période (voir CreateSeasonModal.jsx), il
    // est possible d'avoir deux clubs différents actifs à la même date/heure
    // — il ne faut jamais les fusionner sous une seule session. Les anciens
    // matchs sans clubId (créés avant cette fonctionnalité) partagent tous
    // le même repère "__legacy__" pour continuer à se regrouper exactement
    // comme avant (aucune régression sur les données existantes).
    const key = `${m.date}|${m.time}|${m.clubId || "__legacy__"}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  });
  return [...map.values()].map((group) => [...group].sort(compareByCourt));
}
