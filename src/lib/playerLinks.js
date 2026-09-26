// ─────────────────────────────────────────────────────────────────────────
// Outil "Liens entre joueurs" (Administration) — logique pure, sans Firestore
// ni React. Voir claude/spec-outil-liens-joueurs-simulateur-2026-09-19.md
// dans le projet Claude pour le cahier des charges complet.
//
// RÈGLE ABSOLUE : cet outil est purement CONSULTATIF. Rien ici ne lit une
// composition en cours et rien n'écrit dans les matchs : on lit seulement les
// matchs déjà joués pour compter "qui a joué avec / contre qui", puis on
// compare avec les préférences que l'admin a encodées lui-même.
//
// Ce qui compte comme "match joué" : exactement la même règle que le
// "Face-à-face" de l'onglet Statistiques (computeHeadToHead) — match terminé,
// équipes fiables (pas de changement en cours de match), et joueurs placés
// dans l'équipe A ou B. Le score n'est pas nécessaire. Un match futur, en
// cours, ou reporté "à une date inconnue" ne compte pas.
// ─────────────────────────────────────────────────────────────────────────
import { getMatchTiming } from "./matchLogic";
import { participantsOf } from "./stats";
import { expandRounds, sessionKeyOf } from "./rounds";

export const PARTNER_MODES = ["indifferent", "varied", "stable"];

export const MODE_LABELS = {
  indifferent: "Indifférent",
  varied: "Varié",
  stable: "Stable",
};

export const MODE_HELP = {
  indifferent: "J'aime bien jouer avec tout le monde.",
  varied: "J'aime bien changer régulièrement de coéquipier.",
  stable: "J'aime bien jouer avec les mêmes coéquipiers.",
};

// ─── Comptage des liens ───────────────────────────────────────────────────

// Clé unique d'une paire de joueurs, quel que soit l'ordre.
export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Parcourt les matchs joués et retourne :
//   pairs  : Map<pairKey, { withDates: string[], againstDates: string[] }>
//   played : Map<playerId, nombre de sessions comptées>
//
// Depuis le 25/09/2026, les manches supplémentaires (voir lib/rounds.js) sont
// prises en compte, mais chaque lien ne compte qu'UNE FOIS PAR SESSION : si
// deux joueurs sont partenaires (ou adversaires) dans deux manches du même
// jour, la paire compte 1 — l'outil mesure la variété des paires d'un jour,
// pas le nombre de manches. Avec une seule manche par session, rien ne change.
export function computePlayerLinks(matches) {
  const pairs = new Map();
  const played = new Map();
  const seenLinks = new Set(); // session|paire|avec ou contre
  const seenPlayed = new Set(); // session|joueur

  expandRounds(matches).forEach((m) => {
    if (getMatchTiming(m) !== "finished" || m.teamsUnreliable) return;
    const session = sessionKeyOf(m);

    const seen = new Set();
    const placed = participantsOf(m).filter((p) => {
      if (!p || !p.playerId || (p.team !== "A" && p.team !== "B")) return false;
      if (seen.has(p.playerId)) return false;
      seen.add(p.playerId);
      return true;
    });

    placed.forEach((p) => {
      const playedKey = `${session}|${p.playerId}`;
      if (seenPlayed.has(playedKey)) return;
      seenPlayed.add(playedKey);
      played.set(p.playerId, (played.get(p.playerId) || 0) + 1);
    });

    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const key = pairKey(placed[i].playerId, placed[j].playerId);
        const together = placed[i].team === placed[j].team;
        const linkKey = `${session}|${key}|${together ? "with" : "against"}`;
        if (seenLinks.has(linkKey)) continue; // déjà compté pour cette session
        seenLinks.add(linkKey);
        if (!pairs.has(key)) pairs.set(key, { withDates: [], againstDates: [] });
        const entry = pairs.get(key);
        if (together) entry.withDates.push(m.date || "");
        else entry.againstDates.push(m.date || "");
      }
    }
  });

  return { pairs, played };
}

function lastOf(dates) {
  if (!dates.length) return null;
  return [...dates].sort().pop() || null;
}

export function getPairCounts(links, a, b) {
  const entry = links.pairs.get(pairKey(a, b));
  if (!entry) return { withCount: 0, againstCount: 0, lastWith: null, lastAgainst: null };
  return {
    withCount: entry.withDates.length,
    againstCount: entry.againstDates.length,
    lastWith: lastOf(entry.withDates),
    lastAgainst: lastOf(entry.againstDates),
  };
}

// Nombre de matchs joués ENSEMBLE (même équipe) à partir d'une date incluse
// ("AAAA-MM-JJ") — sert à afficher "depuis l'activation du mode Stable".
export function countWithSince(links, a, b, sinceDate) {
  const entry = links.pairs.get(pairKey(a, b));
  if (!entry || !sinceDate) return 0;
  return entry.withDates.filter((d) => d >= sinceDate).length;
}

// Joueurs affichés dans l'outil : ni comptes de test, ni joueurs archivés (le
// contexte de l'app ne fournit déjà que les joueurs actifs). Les joueurs
// occasionnels sont inclus dès qu'ils ont au moins un match compté. Tri par
// nom.
export function getShownPlayers(players, links) {
  return (players || [])
    .filter((p) => !p.isTest && (!p.isOccasional || (links.played.get(p.id) || 0) > 0))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr"));
}

// Contexte de calcul partagé par la grille, les fiches et le simulateur.
// `means` = pour chaque joueur, nombre moyen de matchs "avec" et "contre"
// par autre joueur affiché : sert de repère pour dire si un chiffre est
// élevé POUR CE JOUEUR (3 fois contre quelqu'un n'a pas le même poids pour
// un joueur à 5 matchs que pour un joueur à 20).
export function buildLinkContext(matches, players) {
  const links = computePlayerLinks(matches);
  const shown = getShownPlayers(players, links);
  const ids = shown.map((p) => p.id);
  const means = new Map();
  ids.forEach((id) => {
    let withTotal = 0;
    let againstTotal = 0;
    ids.forEach((other) => {
      if (other === id) return;
      const c = getPairCounts(links, id, other);
      withTotal += c.withCount;
      againstTotal += c.againstCount;
    });
    const n = Math.max(ids.length - 1, 1);
    means.set(id, { withMean: withTotal / n, againstMean: againstTotal / n });
  });
  return { links, shown, ids, means, playersById: new Map((players || []).map((p) => [p.id, p])) };
}

// Niveau de "chaleur" d'un compteur par rapport à la moyenne :
//   0 = jamais, 1 = plutôt rare, 2 = dans la moyenne, 3 = nettement élevé.
// "Nettement élevé" exige au moins 3 occurrences ET 1,5 fois la moyenne, pour
// ne pas crier au loup sur un joueur qui a très peu joué.
export function heatLevel(count, mean) {
  if (count <= 0) return 0;
  if (!(mean > 0)) return 2;
  const ratio = count / mean;
  if (count >= 3 && ratio >= 1.5) return 3;
  if (ratio <= 0.75) return 1;
  return 2;
}

// Moyenne de repère d'une paire = moyenne des deux joueurs, pour que la grille
// reste symétrique (la case A/B a la même couleur que la case B/A).
export function pairHeat(ctx, a, b, type) {
  const c = getPairCounts(ctx.links, a, b);
  const key = type === "with" ? "withMean" : "againstMean";
  const ma = ctx.means.get(a)?.[key] || 0;
  const mb = ctx.means.get(b)?.[key] || 0;
  const count = type === "with" ? c.withCount : c.againstCount;
  return { count, level: heatLevel(count, (ma + mb) / 2) };
}

// ─── Préférences et incompatibilités ──────────────────────────────────────

export function defaultPrefs() {
  return { mode: "indifferent", modeSince: null, favorites: [], avoid: [] };
}

// `relations` = { [playerId]: fiche } telle que renvoyée par api/admin-relations.
export function getPrefs(relations, playerId) {
  const raw = (relations && relations[playerId]) || {};
  return {
    mode: PARTNER_MODES.includes(raw.mode) ? raw.mode : "indifferent",
    modeSince: typeof raw.modeSince === "string" ? raw.modeSince : null,
    favorites: Array.isArray(raw.favorites) ? raw.favorites : [],
    avoid: Array.isArray(raw.avoid) ? raw.avoid.filter((e) => e && e.playerId) : [],
  };
}

// La paire (a, b) est-elle à éviter ? Vaut dans les DEUX sens : si Adrien veut
// éviter Jean, la paire est à éviter même si Jean n'a rien demandé. Comme
// partenaires, toujours ; comme adversaires, seulement si l'entrée porte
// "alsoOpponent". Retourne null ou { requestedBy: [ids], since }.
export function findAvoid(relations, a, b, role) {
  const found = [];
  [
    [a, b],
    [b, a],
  ].forEach(([by, target]) => {
    const entry = getPrefs(relations, by).avoid.find((e) => e.playerId === target);
    if (entry && (role === "partner" || entry.alsoOpponent === true)) {
      found.push({ by, since: entry.since || null });
    }
  });
  if (!found.length) return null;
  const sinces = found.map((f) => f.since).filter(Boolean).sort();
  return { requestedBy: found.map((f) => f.by), since: sinces[0] || null };
}

// ─── Simulateur : 4 joueurs → 3 répartitions possibles ────────────────────

// Statuts d'un lien (du plus grave au moins grave) : "avoid" (à éviter),
// "red", "orange", puis "gray" (neutre) et "green".
export const ATTENTION_STATUSES = ["avoid", "red", "orange"];

// Avis d'un joueur `i` sur son partenaire `j` selon son mode :
//   "good" | "bad" | "neutral", avec une courte raison lisible.
function partnerOpinion(ctx, relations, i, j, nameOf) {
  const prefs = getPrefs(relations, i);
  const { count, level } = pairHeat(ctx, i, j, "with");

  if (prefs.mode === "varied") {
    if (level === 3) return { mode: "varied", verdict: "bad", reason: `${nameOf(i)} veut varier (déjà ${count} fois ensemble)` };
    if (level <= 1) {
      return {
        mode: "varied",
        verdict: "good",
        reason: count === 0 ? `Jamais joué ensemble (${nameOf(i)} veut varier)` : `Rarement ensemble (${nameOf(i)} veut varier)`,
      };
    }
    return { mode: "varied", verdict: "neutral", reason: null };
  }

  if (prefs.mode === "stable") {
    if (prefs.favorites.length > 0) {
      if (prefs.favorites.includes(j)) {
        return { mode: "stable", verdict: "good", reason: `${nameOf(j)} fait partie des partenaires souhaités de ${nameOf(i)}`, wantsPartner: true };
      }
      return { mode: "stable", verdict: "neutral", reason: null };
    }
    // Stable sans liste : la stabilité se déduit des matchs passés.
    if (count > 0 && level >= 2) {
      return { mode: "stable", verdict: "good", reason: `${nameOf(i)} veut de la stabilité (${count} match${count > 1 ? "s" : ""} déjà ensemble)`, wantsPartner: true };
    }
    return { mode: "stable", verdict: "neutral", reason: null };
  }

  return { mode: "indifferent", verdict: "neutral", reason: null };
}

function evaluatePartnerLink(ctx, relations, x, y, nameOf) {
  const counts = getPairCounts(ctx.links, x, y);
  const base = { kind: "partner", players: [x, y], count: counts.withCount, lastDate: counts.lastWith };

  const avoid = findAvoid(relations, x, y, "partner");
  if (avoid) {
    return { ...base, status: "avoid", label: "À éviter", notes: [], avoid, penalty: 1000 };
  }

  const ox = partnerOpinion(ctx, relations, x, y, nameOf);
  const oy = partnerOpinion(ctx, relations, y, x, nameOf);
  const opinions = [ox, oy];
  const anyGood = opinions.some((o) => o.verdict === "good");
  const anyBad = opinions.some((o) => o.verdict === "bad");
  const notes = opinions.filter((o) => o.reason).map((o) => o.reason);

  // Désaccord : l'un veut rester avec l'autre, mais l'autre veut varier sans
  // que ce lien soit nouveau pour lui.
  const stableWantsOther = (a, b) => a.wantsPartner === true && b.mode === "varied" && b.verdict !== "good";
  const divergent = (anyGood && anyBad) || stableWantsOther(ox, oy) || stableWantsOther(oy, ox);

  if (divergent) {
    return { ...base, status: "orange", label: "Souhaits divergents", notes, penalty: 3 };
  }
  if (anyBad) {
    const bothVaried = ox.mode === "varied" && oy.mode === "varied";
    if (bothVaried && ox.verdict === "bad" && oy.verdict === "bad") {
      return { ...base, status: "red", label: "Trop souvent ensemble", notes, penalty: 6 };
    }
    return { ...base, status: "orange", label: "Déjà très fréquent", notes, penalty: 3 };
  }
  if (anyGood) {
    return { ...base, status: "green", label: "Souhait respecté", notes, penalty: 0 };
  }
  return { ...base, status: "gray", label: "Neutre", notes: [], penalty: 0 };
}

function evaluateOpponentLink(ctx, relations, x, y, nameOf) {
  const counts = getPairCounts(ctx.links, x, y);
  const { level } = pairHeat(ctx, x, y, "against");
  const base = { kind: "opponent", players: [x, y], count: counts.againstCount, lastDate: counts.lastAgainst };

  const avoid = findAvoid(relations, x, y, "opponent");
  if (avoid) {
    return { ...base, status: "avoid", label: "À éviter", notes: [], avoid, penalty: 1000 };
  }

  // Tous les joueurs veulent varier leurs adversaires. Un joueur Indifférent
  // reste concerné, mais avec le poids le plus faible : si les DEUX sont
  // Indifférents, le point d'attention pèse moitié moins.
  const bothIndifferent =
    getPrefs(relations, x).mode === "indifferent" && getPrefs(relations, y).mode === "indifferent";

  if (level === 3) {
    return {
      ...base,
      status: "red",
      label: "Souvent adversaires",
      notes: [`${nameOf(x)} et ${nameOf(y)} se sont déjà affrontés ${counts.againstCount} fois`],
      penalty: bothIndifferent ? 1 : 2,
    };
  }
  if (level <= 1) {
    return {
      ...base,
      status: "green",
      label: counts.againstCount === 0 ? "Jamais affrontés" : "Rarement affrontés",
      notes: [],
      penalty: 0,
    };
  }
  return { ...base, status: "gray", label: "Neutre", notes: [], penalty: 0 };
}

// Tous les moyens de couper une liste en paires (appariements parfaits) :
// 3 pour 4 éléments, 105 pour 8.
function perfectMatchings(items) {
  if (items.length === 0) return [[]];
  const [first, ...rest] = items;
  const out = [];
  rest.forEach((partner, i) => {
    const remaining = rest.filter((_, j) => j !== i);
    perfectMatchings(remaining).forEach((m) => out.push([[first, partner], ...m]));
  });
  return out;
}

// Nombre de joueurs acceptés par le simulateur : 4 (un match) ou 8 (une
// session de deux matchs, la situation habituelle du club).
export const SIMULATOR_SIZES = [4, 8];

// Évalue toutes les façons de répartir 4 joueurs (1 match : 3 combinaisons) ou
// 8 joueurs (2 matchs : 315 combinaisons = 105 façons de former 4 paires ×
// 3 façons d'opposer ces paires deux à deux) et les classe de la plus
// harmonieuse à la moins harmonieuse. NE PLACE PERSONNE et ne modifie rien :
// c'est un simple calcul de lecture.
//
// Chaque combinaison = { matches: [{ teams: [[a,b],[c,d]], partnerLinks,
// opponentLinks }], attentionCount, hasAvoid, greenCount, score, best }.
//
// Classement : toute combinaison qui contient une paire "à éviter" passe en
// dernier ; ensuite, somme de pénalités (un désaccord ou une paire trop
// fréquente pèse plus qu'un adversaire trop fréquent, et un adversaire
// fréquent entre deux joueurs Indifférents pèse le moins) ; à égalité, celle
// qui a le plus de liens verts passe devant. Deux joueurs placés dans deux
// matchs différents ne se rencontrent pas : seuls les liens DANS un même
// match comptent.
export function evaluateConfigurations(ctx, relations, ids, nameOf) {
  if (!Array.isArray(ids) || !SIMULATOR_SIZES.includes(ids.length)) return [];

  const evaluated = [];
  perfectMatchings(ids).forEach((pairs) => {
    // Les paires sont ensuite opposées deux à deux pour former les matchs.
    perfectMatchings(pairs.map((_, i) => i)).forEach((grouping) => {
      const matches = grouping.map(([i, j]) => {
        const [a, b] = pairs[i];
        const [c, d] = pairs[j];
        return {
          teams: [
            [a, b],
            [c, d],
          ],
          partnerLinks: [
            evaluatePartnerLink(ctx, relations, a, b, nameOf),
            evaluatePartnerLink(ctx, relations, c, d, nameOf),
          ],
          opponentLinks: [
            evaluateOpponentLink(ctx, relations, a, c, nameOf),
            evaluateOpponentLink(ctx, relations, a, d, nameOf),
            evaluateOpponentLink(ctx, relations, b, c, nameOf),
            evaluateOpponentLink(ctx, relations, b, d, nameOf),
          ],
        };
      });
      const all = matches.flatMap((m) => [...m.partnerLinks, ...m.opponentLinks]);
      evaluated.push({
        index: evaluated.length,
        matches,
        attentionCount: all.filter((l) => ATTENTION_STATUSES.includes(l.status)).length,
        hasAvoid: all.some((l) => l.status === "avoid"),
        greenCount: all.filter((l) => l.status === "green").length,
        score: all.reduce((sum, l) => sum + l.penalty, 0),
      });
    });
  });

  evaluated.sort((s1, s2) => {
    if (s1.score !== s2.score) return s1.score - s2.score;
    if (s1.greenCount !== s2.greenCount) return s2.greenCount - s1.greenCount;
    return s1.index - s2.index;
  });

  // "La plus harmonieuse" seulement quand elle se détache réellement.
  return evaluated.map((s, i) => ({
    ...s,
    best: i === 0 && (evaluated[1].score > s.score || evaluated[1].greenCount < s.greenCount),
  }));
}

// ─── Fiche par joueur ─────────────────────────────────────────────────────

// Une ligne par autre joueur affiché : compteurs avec / contre, niveaux de
// chaleur, et repère "à éviter" (dans un sens ou dans l'autre).
export function getPlayerRows(ctx, relations, playerId) {
  return ctx.ids
    .filter((id) => id !== playerId)
    .map((otherId) => {
      const counts = getPairCounts(ctx.links, playerId, otherId);
      return {
        playerId: otherId,
        withCount: counts.withCount,
        againstCount: counts.againstCount,
        lastWith: counts.lastWith,
        withLevel: pairHeat(ctx, playerId, otherId, "with").level,
        againstLevel: pairHeat(ctx, playerId, otherId, "against").level,
        avoidPartner: findAvoid(relations, playerId, otherId, "partner"),
        avoidOpponent: findAvoid(relations, playerId, otherId, "opponent"),
      };
    });
}

// Petit encadré de synthèse d'un joueur : jamais joué avec, et adversaires les
// plus fréquents (au moins 2 fois, du plus au moins fréquent).
export function getPlayerSummary(rows) {
  const neverWith = rows.filter((r) => r.withCount === 0).map((r) => r.playerId);
  const topAgainst = rows
    .filter((r) => r.againstCount >= 2)
    .sort((a, b) => b.againstCount - a.againstCount)
    .slice(0, 3);
  return { neverWith, topAgainst };
}
