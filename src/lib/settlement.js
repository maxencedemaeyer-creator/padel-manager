// ─────────────────────────────────────────────────────────────────────────
// Bilan d'un abonnement, remise à l'équilibre et clôture (chantier du
// 30/10/2026, demande de Max après le cas réel de Donald).
//
// Principe : pour UN abonnement, on regarde chaque place de chaque terrain
// et on note qui a réellement l'argent de cette place :
// - place « payée » à un créancier  → perçue par ce créancier ;
// - place d'un créancier de la session → couverte par sa propre créance ;
// - place d'un match joué, pas encore payée → impayé (encore attendu) ;
// - place d'un match à venir → encore attendue ;
// - place vide sur un match joué → personne n'a payé (perte du terrain).
//
// Pour chaque personne : reste à récupérer =
//   créance − couvert − perçu + versé − reçu
// (exactement la même formule que le grand bloc bleu « Reste net à
// récupérer » de sa comptabilité, mais limitée à CET abonnement).
//
// Pour remettre à l'équilibre, on retire de ce reste ce qui va encore
// arriver normalement (places attendues) et les places vides de ses propres
// terrains : ce qui reste est l'écart réel, à régler par des versements
// entre créanciers. Si toutes les créances ont été encodées au prix exact
// des terrains, la somme de tous les écarts vaut 0 (ligne de contrôle).
//
// Aucune lecture Firebase : tout est calculé à partir des matchs et des
// abonnements déjà chargés par l'app.
// ─────────────────────────────────────────────────────────────────────────
import { COURT_SLOT_DEFS } from "./constants";
import { getMatchTiming, groupMatchesBySession, getSessionCreditorIds } from "./matchLogic";
import { participantsOf, round2, getAbonnementTransfers } from "./stats";

const SEATS_PER_COURT = COURT_SLOT_DEFS.length; // 4 places par terrain
const EPS = 0.005;

function nameOf(players, id) {
  return (players || []).find((p) => p.id === id)?.name || "Joueur supprimé";
}

function courtLabel(match) {
  if (match.court != null && String(match.court).trim() !== "") return `T${match.court}`;
  const m = String(match.location || "").match(/(\d+)\s*$/);
  return m ? `T${m[1]}` : match.location || "Terrain";
}

function sessionSortKey(m) {
  return `${m.date || ""}T${m.time || "00:00"}`;
}

// Versements suggérés : ceux qui ont trop encaissé versent à ceux qui n'ont
// pas assez récupéré, en commençant par les plus gros montants (le moins de
// versements possible dans les cas courants).
export function suggestTransfers(rows) {
  const payers = rows
    .filter((r) => r.balance < -EPS)
    .map((r) => ({ id: r.playerId, left: round2(-r.balance) }))
    .sort((a, b) => b.left - a.left);
  const receivers = rows
    .filter((r) => r.balance > EPS)
    .map((r) => ({ id: r.playerId, left: round2(r.balance) }))
    .sort((a, b) => b.left - a.left);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < payers.length && j < receivers.length) {
    const amount = round2(Math.min(payers[i].left, receivers[j].left));
    if (amount > EPS) out.push({ fromId: payers[i].id, toId: receivers[j].id, amount });
    payers[i].left = round2(payers[i].left - amount);
    receivers[j].left = round2(receivers[j].left - amount);
    if (payers[i].left <= EPS) i += 1;
    if (receivers[j].left <= EPS) j += 1;
  }
  return out;
}

// Calcul complet, en direct, du bilan d'un abonnement.
export function computeAbonnementBilan(abonnement, allMatches, players, now = new Date()) {
  const matches = allMatches || [];
  const sessionGroups = groupMatchesBySession(matches);
  const fallbackCreditorIds = new Set(
    (players || []).filter((p) => p.isCreditor === true).map((p) => p.id)
  );
  const abonnementCreditorIds = (abonnement.creditors || []).map((c) => c.playerId);

  const rowsById = new Map();
  const rowOf = (playerId) => {
    if (!rowsById.has(playerId)) {
      rowsById.set(playerId, {
        playerId,
        name: nameOf(players, playerId),
        isAbonnementCreditor: abonnementCreditorIds.includes(playerId),
        advanced: 0,
        covered: 0,
        coveredCount: 0,
        received: 0,
        receivedCount: 0,
        transfersIn: 0,
        transfersOut: 0,
        pending: 0, // places encore attendues (impayés + matchs à venir)
        emptyLoss: 0, // places vides sur ses terrains déjà joués
      });
    }
    return rowsById.get(playerId);
  };

  (abonnement.creditors || []).forEach((c) => {
    if (!c.playerId) return;
    rowOf(c.playerId).advanced += Number(c.advancedAmount) || 0;
  });

  const related = matches
    .filter((m) => m.abonnementId === abonnement.id && m.type === "Saison")
    .sort((a, b) => sessionSortKey(a).localeCompare(sessionSortKey(b)));

  let courtValue = 0;
  let unpaidAmount = 0;
  let unpaidCount = 0;
  let upcomingAmount = 0;
  let upcomingSeats = 0;
  let unfinishedCount = 0;
  let emptyAmount = 0;
  let emptyCount = 0;
  const sessionsMap = new Map();

  related.forEach((m) => {
    const fee = Number(m.matchFeePerPlayer) || 0;
    const timing = getMatchTiming(m, now);
    const finished = timing === "finished";
    if (!finished) unfinishedCount += 1;
    courtValue += fee * SEATS_PER_COURT;

    const sessionCreditorIds =
      getSessionCreditorIds(m, matches, sessionGroups) || fallbackCreditorIds;
    const courtCreditorIds =
      Array.isArray(m.creditorIds) && m.creditorIds.length > 0
        ? m.creditorIds
        : abonnementCreditorIds;
    // Une place encore attendue (ou une place vide) revient au(x)
    // créancier(s) de CE terrain, à parts égales s'ils sont plusieurs.
    const shareToCourtCreditors = (amount, field) => {
      if (courtCreditorIds.length === 0) return;
      const part = amount / courtCreditorIds.length;
      courtCreditorIds.forEach((id) => {
        rowOf(id)[field] += part;
      });
    };

    const seats = [];
    const people = participantsOf(m).filter((p) => p && p.playerId);
    people.forEach((p) => {
      const name = nameOf(players, p.playerId) || p.name;
      if (p.paidStatus === "paid" && p.creditorId) {
        const r = rowOf(p.creditorId);
        r.received += fee;
        r.receivedCount += 1;
        seats.push({
          playerId: p.playerId,
          name,
          status: "paid",
          toId: p.creditorId,
          toName: nameOf(players, p.creditorId),
          self: p.creditorId === p.playerId,
        });
      } else if (sessionCreditorIds.has(p.playerId)) {
        const r = rowOf(p.playerId);
        r.covered += fee;
        r.coveredCount += 1;
        seats.push({ playerId: p.playerId, name, status: "covered" });
      } else if (finished) {
        unpaidAmount += fee;
        unpaidCount += 1;
        const owedTo = p.paidStatus === "owed" && p.creditorId ? p.creditorId : null;
        if (owedTo) rowOf(owedTo).pending += fee;
        else shareToCourtCreditors(fee, "pending");
        seats.push({
          playerId: p.playerId,
          name,
          status: "unpaid",
          toId: owedTo,
          toName: owedTo ? nameOf(players, owedTo) : null,
        });
      } else {
        upcomingAmount += fee;
        upcomingSeats += 1;
        shareToCourtCreditors(fee, "pending");
        seats.push({ playerId: p.playerId, name, status: "upcoming" });
      }
    });

    const emptySeats = Math.max(0, SEATS_PER_COURT - people.length);
    if (emptySeats > 0) {
      if (finished) {
        emptyAmount += fee * emptySeats;
        emptyCount += emptySeats;
        shareToCourtCreditors(fee * emptySeats, "emptyLoss");
      } else {
        upcomingAmount += fee * emptySeats;
        upcomingSeats += emptySeats;
        shareToCourtCreditors(fee * emptySeats, "pending");
      }
    }

    const key = `${m.date}|${m.time}|${m.clubId || "__legacy__"}`;
    if (!sessionsMap.has(key)) {
      sessionsMap.set(key, {
        key,
        date: m.date || null,
        time: m.time || "",
        tbd: Boolean(m.dateTBD),
        courts: [],
      });
    }
    sessionsMap.get(key).courts.push({
      matchId: m.id,
      label: courtLabel(m),
      location: m.location || "",
      fee,
      timing,
      creditorNames: courtCreditorIds.map((id) => nameOf(players, id)),
      seats,
      emptySeats,
    });
  });

  const transfers = getAbonnementTransfers(abonnement)
    .map((t) => ({
      ...t,
      amount: round2(t.amount),
      fromName: nameOf(players, t.fromId),
      toName: nameOf(players, t.toId),
    }))
    .sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  transfers.forEach((t) => {
    rowOf(t.fromId).transfersOut += t.amount;
    rowOf(t.toId).transfersIn += t.amount;
  });

  const rows = [...rowsById.values()]
    .map((r) => {
      const remaining = round2(
        r.advanced - r.covered - r.received + r.transfersOut - r.transfersIn
      );
      return {
        ...r,
        advanced: round2(r.advanced),
        covered: round2(r.covered),
        received: round2(r.received),
        transfersIn: round2(r.transfersIn),
        transfersOut: round2(r.transfersOut),
        pending: round2(r.pending),
        emptyLoss: round2(r.emptyLoss),
        remaining,
        // Écart réel, une fois retirées les places encore attendues et les
        // places vides de ses propres terrains : > 0 = il doit encore
        // recevoir ce montant d'un autre créancier ; < 0 = il a trop
        // encaissé et doit verser ce montant à un autre créancier.
        balance: round2(remaining - r.pending - r.emptyLoss),
      };
    })
    // Les créanciers de l'abonnement d'abord, puis les autres.
    .sort(
      (a, b) =>
        Number(b.isAbonnementCreditor) - Number(a.isAbonnementCreditor) ||
        b.advanced - a.advanced ||
        a.name.localeCompare(b.name)
    );

  const totalAdvanced = round2(rows.reduce((s, r) => s + r.advanced, 0));
  const totalBalance = round2(rows.reduce((s, r) => s + r.balance, 0));
  // Ligne de contrôle : si les créances encodées correspondent exactement au
  // prix des terrains, la somme de tous les écarts vaut 0. Sinon, la
  // différence vient de la créance elle-même (montant encodé ≠ prix des
  // terrains), pas des paiements.
  const controlDiff = round2(totalAdvanced - courtValue);
  const balanced = rows.every((r) => Math.abs(r.balance) <= EPS);
  const suggestions = suggestTransfers(rows).map((s) => ({
    ...s,
    fromName: nameOf(players, s.fromId),
    toName: nameOf(players, s.toId),
  }));

  const sessions = [...sessionsMap.values()];

  const totals = {
    advanced: totalAdvanced,
    courtValue: round2(courtValue),
    covered: round2(rows.reduce((s, r) => s + r.covered, 0)),
    received: round2(rows.reduce((s, r) => s + r.received, 0)),
    transfers: round2(transfers.reduce((s, t) => s + t.amount, 0)),
    unpaidAmount: round2(unpaidAmount),
    unpaidCount,
    upcomingAmount: round2(upcomingAmount),
    upcomingSeats,
    emptyAmount: round2(emptyAmount),
    emptyCount,
    totalBalance,
    controlDiff,
  };

  return {
    abonnementId: abonnement.id,
    matchCount: related.length,
    sessionCount: sessions.length,
    unfinishedCount,
    readyToClose: related.length > 0 && unfinishedCount === 0 && unpaidCount === 0,
    balanced,
    rows,
    totals,
    transfers,
    suggestions,
    sessions,
    signature: bilanSignature(rows, transfers, totals),
  };
}

// Empreinte d'un bilan : sert à savoir si les chiffres ont bougé depuis la
// dernière version enregistrée (« Bilan modifié depuis la clôture »).
export function bilanSignature(rows, transfers, totals) {
  return JSON.stringify({
    r: rows.map((r) => [r.playerId, r.advanced, r.covered, r.received, r.remaining, r.pending]),
    t: (transfers || []).map((t) => t.id || `${t.fromId}>${t.toId}:${t.amount}`),
    u: [totals.unpaidCount, totals.upcomingSeats, totals.emptyCount],
  });
}

// Photo figée d'un bilan, prête à être enregistrée dans
// `abonnement.bilans[]`. Les noms sont recopiés en toutes lettres pour que
// le bilan reste lisible même si un joueur est renommé ou supprimé plus tard.
export function makeBilanSnapshot(bilan, { version, createdBy, forced }) {
  return {
    version,
    createdAt: new Date().toISOString(),
    createdBy: createdBy || null,
    forced: Boolean(forced),
    matchCount: bilan.matchCount,
    sessionCount: bilan.sessionCount,
    unfinishedCount: bilan.unfinishedCount,
    balanced: bilan.balanced,
    rows: bilan.rows,
    totals: bilan.totals,
    transfers: bilan.transfers,
    suggestions: bilan.suggestions,
    sessions: bilan.sessions,
    signature: bilan.signature,
  };
}

export function getSavedBilans(abonnement) {
  return Array.isArray(abonnement?.bilans)
    ? [...abonnement.bilans].sort((a, b) => (a.version || 0) - (b.version || 0))
    : [];
}

// Le bilan enregistré le plus récent ne correspond plus aux chiffres en
// direct (ex. le match déplacé a été joué et payé après la clôture).
export function isBilanOutdated(abonnement, liveBilan) {
  const saved = getSavedBilans(abonnement);
  if (saved.length === 0) return false;
  return saved[saved.length - 1].signature !== liveBilan.signature;
}

export function newTransferId() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
