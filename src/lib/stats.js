// ─────────────────────────────────────────────────────────────────────────
// Calculs de statistiques et de comptabilité — dérivés en direct depuis
// les matchs, jamais depuis un compteur stocké qui pourrait dériver.
// ─────────────────────────────────────────────────────────────────────────
import { getMatchStart, getMatchTiming } from "./matchLogic";

// Petit garde-fou : un très ancien match (créé avant que le format actuel
// de "participants" se stabilise, ou une donnée corrompue par un souci
// réseau lors d'une écriture) peut avoir un champ "participants" absent ou
// dans un format inattendu (pas un tableau). Les méthodes de tableau
// (.filter/.some/.forEach/.find...) plantent immédiatement dans ce cas — et
// comme l'app n'a pas de filet de sécurité au niveau de l'affichage, une
// seule donnée de ce genre suffisait à faire disparaître tout l'écran
// (Comptabilité, Stats...) pour tout le monde, pas seulement pour le match
// concerné. On s'assure ici de toujours retomber sur un tableau (vide au
// pire) avant d'itérer dessus.
export function participantsOf(match) {
  return Array.isArray(match?.participants) ? match.participants : [];
}

export function getCreditorAccounting(creditorId, matches) {
  let totalPaidAllTime = 0; // tout paiement confirmé, peu importe la date du match
  let totalPaidPastMatches = 0; // uniquement les matchs déjà passés
  let totalPaidUpcomingMatches = 0; // payé D'AVANCE, pour des matchs pas encore joués
  let selfReimbursed = 0; // matchs déjà joués par le créancier lui-même
  const paymentsReceived = []; // détail nominatif — matchs passés
  const paymentsReceivedUpcoming = []; // détail nominatif — matchs à venir, payés d'avance

  matches
    .filter((m) => m.type === "Saison")
    .forEach((m) => {
      const fee = m.matchFeePerPlayer || 0;
      const finished = getMatchTiming(m) === "finished";
      participantsOf(m).forEach((p) => {
        if (p.paidStatus === "paid" && p.creditorId === creditorId) {
          totalPaidAllTime += fee;
          // Détail complet (pas seulement le total) pour permettre l'affichage
          // nominatif "qui a remboursé quel match" dans CreditorPaymentsModal,
          // groupé par joueur — playerId est indispensable pour retrouver son
          // avatar, date/heure/lieu pour identifier le match sans ambiguïté.
          const entry = {
            key: `${m.id}-${p.playerId}`,
            matchId: m.id,
            playerId: p.playerId,
            name: p.name,
            fee,
            date: m.date,
            time: m.time || "",
            location: m.location || "Terrain",
          };
          if (finished) {
            totalPaidPastMatches += fee;
            paymentsReceived.push(entry);
          } else {
            totalPaidUpcomingMatches += fee;
            paymentsReceivedUpcoming.push(entry);
          }
        }
        if (p.playerId === creditorId && finished) {
          selfReimbursed += fee;
        }
      });
    });

  // Passés : le plus récent en premier. À venir : le plus proche en premier.
  paymentsReceived.sort((a, b) => new Date(b.date) - new Date(a.date));
  paymentsReceivedUpcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
  return {
    totalPaidAllTime,
    totalPaidPastMatches,
    totalPaidUpcomingMatches,
    selfReimbursed,
    paymentsReceived,
    paymentsReceivedUpcoming,
  };
}

// Paiements effectués PAR un joueur (peu importe son rôle — joueur normal,
// créancier ou admin, voir "Mes paiements" dans StatsView.jsx) — le miroir
// de getCreditorAccounting côté payeur plutôt que côté créancier. Un
// créancier peut lui aussi apparaître ici : rien n'empêche qu'il rembourse
// un AUTRE créancier pour un match donné (ex. via PaymentModal.jsx), ce
// n'est alors plus une consommation personnelle "gratuite" mais un vrai
// paiement à tracer. Toujours filtré sur `p.paidStatus === "paid"` avec un
// `creditorId` renseigné — la consommation personnelle silencieuse d'un
// créancier sur son propre abonnement (voir `selfReimbursed` ci-dessus)
// n'utilise jamais ces deux champs et n'apparaît donc jamais ici.
export function getPlayerPayments(playerId, matches) {
  const payments = [];
  let total = 0;

  matches
    .filter((m) => m.type === "Saison")
    .forEach((m) => {
      const fee = m.matchFeePerPlayer || 0;
      participantsOf(m).forEach((p) => {
        if (p.playerId === playerId && p.paidStatus === "paid" && p.creditorId) {
          total += fee;
          payments.push({
            key: `${m.id}-${p.playerId}`,
            matchId: m.id,
            creditorId: p.creditorId,
            fee,
            date: m.date,
            time: m.time || "",
            location: m.location || "Terrain",
          });
        }
      });
    });

  // Le plus récent en premier — cohérent avec paymentsReceived côté créancier.
  payments.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { total, payments };
}

// Tous les joueurs à traiter comme "créancier" pour l'affichage/l'attribution
// de paiement — pas seulement ceux ACTUELLEMENT cochés "Créancier" sur leur
// fiche (`player.isCreditor`), mais aussi ceux qui ont financé un abonnement
// par le passé (présents dans `abonnement.creditors[]`) même si la case a
// depuis été décochée. Corrigé le 02/09/2026 (audit paiements) : décocher
// "Créancier" sur un joueur le faisait disparaître de PaymentModal.jsx (plus
// moyen de lui attribuer un paiement pour ses anciens matchs déjà financés)
// et de la liste "Soldes des créanciers" d'AdminView.jsx, alors que ses
// créances/paiements historiques restaient bien réels dans les données.
export function getAllCreditorPlayerIds(players, abonnements) {
  const ids = new Set((players || []).filter((p) => p.isCreditor === true).map((p) => p.id));
  (abonnements || []).forEach((a) => {
    (a.creditors || []).forEach((c) => {
      if (c.playerId) ids.add(c.playerId);
    });
  });
  return ids;
}

// Créances de départ d'un créancier — une par abonnement où il apparaît
// dans `abonnement.creditors[]` (voir CreateSeasonModal.jsx : les
// créanciers et leur montant avancé sont désormais définis À LA GÉNÉRATION
// d'un abonnement, pas via un champ unique sur la fiche joueur). Un même
// créancier peut cumuler plusieurs abonnements (ex. deux terrains
// différents, ou une reconduction) — d'où une LISTE de créances plutôt
// qu'un seul montant. Le nombre de matchs couverts par chaque créance est
// désormais un décompte EXACT (les matchs générés portent `abonnementId`),
// et non plus une estimation par période de dates.
export function getCreditorClaims(creditorId, abonnements, matches) {
  const claims = (abonnements || [])
    .filter((a) => (a.creditors || []).some((c) => c.playerId === creditorId))
    .map((a) => {
      const entry = a.creditors.find((c) => c.playerId === creditorId);
      const coveredMatches = matches.filter((m) => m.abonnementId === a.id).length;
      return {
        abonnementId: a.id,
        label: a.label || null,
        clubId: a.clubId || null,
        courts: a.courts || [],
        startDate: a.startDate || null,
        endDate: a.endDate || null,
        amount: entry?.advancedAmount || 0,
        coveredMatches,
      };
    })
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  const total = claims.reduce((s, c) => s + (c.amount || 0), 0);
  return { claims, total };
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
    const participants = participantsOf(m);
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
        participantsOf(m).some((p) => p.playerId === playerId)
    )
    .sort((a, b) => getMatchStart(a) - getMatchStart(b));

  return relevant.slice(-limit).map((m) => {
    const me = participantsOf(m).find((p) => p.playerId === playerId);
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
    const participants = participantsOf(m);
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
