// ─────────────────────────────────────────────────────────────────────────
// Calculs de statistiques et de comptabilité — dérivés en direct depuis
// les matchs, jamais depuis un compteur stocké qui pourrait dériver.
// ─────────────────────────────────────────────────────────────────────────
import { getMatchStart, getMatchTiming } from "./matchLogic";

export function getCreditorAccounting(creditorId, matches) {
  let totalPaidAllTime = 0; // tout paiement confirmé, peu importe la date du match
  let totalPaidPastMatches = 0; // uniquement les matchs déjà passés
  let selfReimbursed = 0; // matchs déjà joués par le créancier lui-même
  const paymentsReceived = [];

  matches
    .filter((m) => m.type === "Saison")
    .forEach((m) => {
      const fee = m.matchFeePerPlayer || 0;
      const finished = getMatchTiming(m) === "finished";
      (m.participants || []).forEach((p) => {
        if (p.paidStatus === "paid" && p.creditorId === creditorId) {
          totalPaidAllTime += fee;
          if (finished) {
            totalPaidPastMatches += fee;
            paymentsReceived.push({ matchId: m.id, date: m.date, name: p.name, fee });
          }
        }
        if (p.playerId === creditorId && finished) {
          selfReimbursed += fee;
        }
      });
    });

  paymentsReceived.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { totalPaidAllTime, totalPaidPastMatches, selfReimbursed, paymentsReceived };
}

// Statistiques d'un joueur — uniquement sur les matchs déjà terminés.
// Coéquipier/adversaire ne sont comptabilisés que si l'équipe (team: "A"/"B")
// a été renseignée lors de l'assignation ; victoire/défaite uniquement si
// l'équipe gagnante a aussi été renseignée en fin de match. Utilise aussi la
// position fixe sur le terrain (Droite/Gauche) enregistrée à l'assignation.
export function computePlayerStats(playerId, matches) {
  let played = 0;
  let wins = 0;
  let losses = 0;
  const partnerCounts = new Map();
  const partnerWins = new Map();
  const opponentCounts = new Map();
  const positionCounts = { Droite: 0, Gauche: 0 };
  const positionResults = { Droite: { wins: 0, losses: 0 }, Gauche: { wins: 0, losses: 0 } };
  const history = [];

  matches.forEach((m) => {
    if (getMatchTiming(m) !== "finished") return;
    const participants = m.participants || [];
    const me = participants.find((p) => p.playerId === playerId);
    if (!me) return;
    played += 1;

    // Équipes changées en cours de match : le match compte comme joué, mais
    // aucune donnée d'équipe n'est fiable (coéquipier/adversaire/victoire).
    // On l'enregistre quand même dans l'historique (résultat inconnu) pour
    // qu'une série de victoires/défaites s'arrête correctement dessus.
    if (m.teamsUnreliable) {
      history.push({ date: m.date, time: m.time, result: null });
      return;
    }

    let result = null; // "win" | "loss" | null (non renseigné)
    if (me.team && m.winningTeam) {
      result = me.team === m.winningTeam ? "win" : "loss";
      if (result === "win") wins += 1;
      else losses += 1;
    }

    if (me.courtSide === "Droite" || me.courtSide === "Gauche") {
      positionCounts[me.courtSide] += 1;
      if (result === "win") positionResults[me.courtSide].wins += 1;
      else if (result === "loss") positionResults[me.courtSide].losses += 1;
    }

    if (me.team) {
      participants.forEach((p) => {
        if (p.playerId === playerId || !p.team) return;
        if (p.team === me.team) {
          partnerCounts.set(p.playerId, (partnerCounts.get(p.playerId) || 0) + 1);
          if (result === "win") {
            partnerWins.set(p.playerId, (partnerWins.get(p.playerId) || 0) + 1);
          }
        } else {
          opponentCounts.set(p.playerId, (opponentCounts.get(p.playerId) || 0) + 1);
        }
      });
    }

    history.push({ date: m.date, time: m.time, result });
  });

  const topOf = (map) => {
    let best = null;
    map.forEach((count, id) => {
      if (!best || count > best.count) best = { id, count };
    });
    return best;
  };

  // Duo gagnant : partenaire avec le meilleur taux de victoire (min. 2 matchs ensemble).
  let bestDuo = null;
  partnerCounts.forEach((count, id) => {
    if (count < 2) return;
    const w = partnerWins.get(id) || 0;
    const rate = Math.round((w / count) * 100);
    if (!bestDuo || rate > bestDuo.rate || (rate === bestDuo.rate && count > bestDuo.count)) {
      bestDuo = { id, count, wins: w, rate };
    }
  });

  // Série en cours : du match le plus récent vers le plus ancien, tant que
  // le résultat (victoire/défaite) reste identique.
  history.sort(
    (a, b) =>
      new Date(`${b.date}T${b.time || "00:00"}`) - new Date(`${a.date}T${a.time || "00:00"}`)
  );
  let streak = 0;
  let streakType = null;
  for (const entry of history) {
    if (!entry.result) break;
    if (streakType === null) {
      streakType = entry.result;
      streak = 1;
    } else if (entry.result === streakType) {
      streak += 1;
    } else break;
  }

  const favoritePosition =
    positionCounts.Droite === 0 && positionCounts.Gauche === 0
      ? null
      : positionCounts.Droite === positionCounts.Gauche
      ? "Équilibré"
      : positionCounts.Droite > positionCounts.Gauche
      ? "Droite"
      : "Gauche";

  // Meilleur ratio de victoires par position (min. 1 match décidé sur ce côté).
  const positionRate = (side) => {
    const { wins: w, losses: l } = positionResults[side];
    const decided = w + l;
    return decided > 0 ? Math.round((w / decided) * 100) : null;
  };
  const droiteRate = positionRate("Droite");
  const gaucheRate = positionRate("Gauche");
  let bestPositionRatio = null;
  if (droiteRate != null || gaucheRate != null) {
    if (droiteRate == null) bestPositionRatio = { side: "Gauche", rate: gaucheRate };
    else if (gaucheRate == null) bestPositionRatio = { side: "Droite", rate: droiteRate };
    else if (droiteRate === gaucheRate) bestPositionRatio = { side: "Égalité", rate: droiteRate };
    else
      bestPositionRatio =
        droiteRate > gaucheRate
          ? { side: "Droite", rate: droiteRate }
          : { side: "Gauche", rate: gaucheRate };
  }

  const decided = wins + losses;
  return {
    played,
    wins,
    losses,
    winRate: decided > 0 ? Math.round((wins / decided) * 100) : 0,
    topPartner: topOf(partnerCounts),
    topOpponent: topOf(opponentCounts),
    bestDuo,
    favoritePosition,
    positionRates: { Droite: droiteRate, Gauche: gaucheRate },
    bestPositionRatio,
    positionCounts,
    streak,
    streakType,
  };
}

// Série des 10 derniers matchs (du plus ancien au plus récent) — V (victoire),
// R (revers/défaite), ou X (match sans résultat exploitable : pas de score,
// ou équipes changées en cours de match).
export function getRecentForm(playerId, matches, limit = 10) {
  const relevant = matches
    .filter(
      (m) =>
        getMatchTiming(m) === "finished" &&
        (m.participants || []).some((p) => p.playerId === playerId)
    )
    .sort((a, b) => getMatchStart(a) - getMatchStart(b));

  return relevant.slice(-limit).map((m) => {
    const me = m.participants.find((p) => p.playerId === playerId);
    let result = "X";
    if (!m.teamsUnreliable && me?.team && m.winningTeam) {
      result = me.team === m.winningTeam ? "V" : "D";
    }
    return { id: m.id, date: m.date, result };
  });
}

// Face-à-face entre deux joueurs choisis : équipiers et adversaires,
// uniquement sur les matchs terminés avec une composition d'équipe fiable.
export function computeHeadToHead(idA, idB, matches) {
  let asOpponents = 0;
  let winsA = 0;
  let winsB = 0;
  let undecided = 0;
  let asPartners = 0;
  let partnerWins = 0;

  matches.forEach((m) => {
    if (getMatchTiming(m) !== "finished" || m.teamsUnreliable) return;
    const participants = m.participants || [];
    const pa = participants.find((p) => p.playerId === idA);
    const pb = participants.find((p) => p.playerId === idB);
    if (!pa || !pb || !pa.team || !pb.team) return;

    if (pa.team === pb.team) {
      asPartners += 1;
      if (m.winningTeam && m.winningTeam === pa.team) partnerWins += 1;
    } else {
      asOpponents += 1;
      if (!m.winningTeam) undecided += 1;
      else if (m.winningTeam === pa.team) winsA += 1;
      else winsB += 1;
    }
  });

  return { asOpponents, winsA, winsB, undecided, asPartners, partnerWins };
}

// Garde l'affichage à jour minute par minute (un match "à venir" doit basculer
// tout seul en "terminé" sans que personne n'ait à rafraîchir la page).
