// ─────────────────────────────────────────────────────────────────────────
// Manches supplémentaires d'une session (ajouté le 25/09/2026).
//
// Contexte : le jeudi, on commence avec la composition de base (celle du
// match), puis, après environ une heure, les équipes changent. Chaque
// nouvelle composition est une "manche" supplémentaire, rangée dans le champ
// `rounds` (tableau) du MÊME document `matches/{id}` :
//
//   rounds: [
//     { participants: [{ playerId, name, team: "A"|"B", courtSide }],
//       scores: { set1, set2, set3 }, winningTeam: "A"|"B"|null,
//       matchType: "Officiel"|"Amical", levelDeltas?: {...},
//       createdAt, createdBy }
//   ]
//
// RÈGLE D'OR : le champ `participants` du match n'est JAMAIS modifié par une
// manche. La comptabilité, les présences, les convocations, Killer, MVP et
// la Tournée générale continuent donc de lire uniquement la composition de
// base — rien ne change pour eux. Seuls les calculs SPORTIFS (statistiques,
// séries, Top 5, "qui a joué avec qui", niveau) passent par `expandRounds`
// ci-dessous, qui transforme la liste des matchs en liste de "manches".
//
// Fichier PUR : aucune lecture ni écriture Firebase ici.
// ─────────────────────────────────────────────────────────────────────────

// Poids d'une manche 2, 3… dans le calcul du niveau (la manche 1, c'est-à-dire
// le match de base, garde un poids de 1). Décision de Max, 25/09/2026.
export const EXTRA_ROUND_WEIGHT = 0.6;

// Manches supplémentaires d'un match (toujours un tableau, jamais d'erreur
// même si le champ est absent ou dans un format inattendu).
export function getRounds(match) {
  return Array.isArray(match?.rounds)
    ? match.rounds.filter((r) => r && typeof r === "object")
    : [];
}

// 0 pour le match de base, 1 pour la première manche ajoutée, etc.
export function roundIndexOf(m) {
  return Number.isFinite(m?.roundIndex) ? m.roundIndex : 0;
}

// Identifiant du document Firestore d'où vient cette manche.
export function baseIdOf(m) {
  return m?.baseId || m?.id;
}

// Poids dans le calcul du niveau selon le numéro de manche.
export function roundWeight(index) {
  return index > 0 ? EXTRA_ROUND_WEIGHT : 1;
}

// Clé d'une session (même date + même heure + même club) — identique à celle
// de `groupMatchesBySession` dans matchLogic.js.
export function sessionKeyOf(m) {
  return `${m?.date}|${m?.time}|${m?.clubId || "__legacy__"}`;
}

// Transforme une liste de matchs en liste de manches : chaque match reste tel
// quel (manche 1, aucun champ ajouté), suivi d'un objet "virtuel" par manche
// supplémentaire. Une manche virtuelle a la même date, heure, club que son
// match, un identifiant `<id du match>#r<numéro>`, `baseId` (id du document),
// `roundIndex` (1, 2…) et `isExtraRound: true`. Ses équipes sont toujours
// considérées comme fiables (`teamsUnreliable: false`).
export function expandRounds(matches) {
  const out = [];
  (matches || []).forEach((m) => {
    if (!m) return;
    out.push(m);
    getRounds(m).forEach((r, i) => {
      out.push({
        id: `${m.id}#r${i + 1}`,
        baseId: m.id,
        roundIndex: i + 1,
        isExtraRound: true,
        date: m.date,
        time: m.time,
        clubId: m.clubId,
        dateTBD: m.dateTBD,
        location: m.location,
        participants: Array.isArray(r.participants) ? r.participants : [],
        scores: r.scores || {},
        winningTeam: r.winningTeam ?? null,
        matchType: r.matchType || "Officiel",
        teamsUnreliable: false,
        levelDeltas: r.levelDeltas,
      });
    });
  });
  return out;
}
