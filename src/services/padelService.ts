import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  addDoc,
  onSnapshot, 
  query, 
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  ClubSettings, 
  Player, 
  PlayerRole,
  Match, 
  MatchCourt, 
  CourtSlot, 
  SlotPosition, 
  CreditorFinanceSummary, 
  PlayerDebtSummary 
} from '../types';

export const DEFAULT_SETTINGS: ClubSettings = {
  courtNames: ["Terrain 1", "Terrain 6"],
  seasonMatchesCount: 44,
  defaultPricePerPlayer: 12.50,
  seasonDayOfWeek: 1, // Lundi
  seasonDefaultTime: "19:00",
  clubName: "Padel Club",
  currency: "€"
};

const POSITIONS: SlotPosition[] = ['teamA_left', 'teamA_right', 'teamB_left', 'teamB_right'];

export function createEmptyCourt(courtId: string, courtName: string): MatchCourt {
  return {
    courtId,
    courtName,
    slots: POSITIONS.map(position => ({
      position,
      playerId: null,
      playerName: null,
      paymentStatus: 'pending',
      paidToCreditorId: null,
      paidAt: null
    }))
  };
}

// ---------------- Settings Service ---------------- //

export function listenSettings(
  callback: (settings: ClubSettings) => void,
  onError?: (error: any) => void
) {
  const settingsDocRef = doc(db, 'settings', 'config');
  return onSnapshot(settingsDocRef, (docSnap) => {
    if (docSnap.exists()) {
      callback({ ...DEFAULT_SETTINGS, ...docSnap.data() } as ClubSettings);
    } else {
      callback(DEFAULT_SETTINGS);
    }
  }, (error) => {
    console.warn("Erreur lors de l'écoute des settings:", error);
    callback(DEFAULT_SETTINGS);
    if (onError) onError(error);
  });
}

export async function saveSettings(settings: ClubSettings): Promise<void> {
  const settingsDocRef = doc(db, 'settings', 'config');
  await setDoc(settingsDocRef, settings, { merge: true });
}

// ---------------- Players Service ---------------- //

export function listenPlayers(
  callback: (players: Player[]) => void,
  onError?: (error: any) => void
) {
  const playersRef = collection(db, 'players');
  return onSnapshot(playersRef, (querySnap) => {
    const players: Player[] = [];
    querySnap.forEach((d) => {
      const data = d.data();
      const isCreditor = data.isCreditor === true || data.role === 'creditor';
      const advance = data.advanceAmount !== undefined 
        ? Number(data.advanceAmount) 
        : (data.creditAmount !== undefined ? Number(data.creditAmount) : 0);

      const userId = data.userId || data.linkedUid || data.authUid || null;
      const userEmail = data.linkedEmail || data.authEmail || data.email || null;

      players.push({
        id: d.id,
        name: data.name || '',
        role: isCreditor ? 'creditor' : 'player',
        status: data.status || (isCreditor ? 'crediteur' : 'actif'),
        advanceAmount: isCreditor ? advance : 0,
        email: data.email || '',
        phone: data.phone || '',
        avatarColor: data.avatarColor || '#E0F2FE',
        userId: userId,
        linkedUid: userId,
        linkedEmail: userEmail,
        authUid: userId || '',
        authEmail: userEmail || '',
        isAdmin: data.isAdmin || false,
        createdAt: data.createdAt || 0
      } as Player);
    });
    // Sort creditors first, then alphabetical by name
    players.sort((a, b) => {
      if (a.role === 'creditor' && b.role !== 'creditor') return -1;
      if (b.role === 'creditor' && a.role !== 'creditor') return 1;
      return a.name.localeCompare(b.name);
    });
    callback(players);
  }, (error) => {
    console.error("Erreur lors de l'écoute des joueurs:", error);
    callback([]);
    if (onError) onError(error);
  });
}

/**
 * Direct Update Player in Firestore with updateDoc
 */
export async function updatePlayer(
  playerId: string,
  data: {
    name: string;
    role?: 'player' | 'creditor';
    isCreditor?: boolean;
    advanceAmount?: number;
    creditAmount?: number;
    phone?: string;
    email?: string;
    avatarColor?: string;
    userId?: string | null;
  }
): Promise<void> {
  const playerRef = doc(db, 'players', playerId);
  const isCreditor = data.isCreditor !== undefined 
    ? data.isCreditor 
    : data.role === 'creditor';
  const amount = data.advanceAmount !== undefined 
    ? Number(data.advanceAmount) 
    : (data.creditAmount !== undefined ? Number(data.creditAmount) : 0);

  const updateData: Record<string, any> = {
    name: data.name.trim(),
    role: isCreditor ? 'creditor' : 'player',
    isCreditor: isCreditor,
    status: isCreditor ? 'crediteur' : 'actif',
    advanceAmount: isCreditor ? amount : 0,
    creditAmount: isCreditor ? amount : 0
  };

  if (data.phone !== undefined) updateData.phone = data.phone.trim();
  if (data.email !== undefined) updateData.email = data.email.trim();
  if (data.avatarColor !== undefined) updateData.avatarColor = data.avatarColor;
  if (data.userId !== undefined) {
    updateData.userId = data.userId;
    updateData.linkedUid = data.userId;
    updateData.authUid = data.userId || '';
  }

  await updateDoc(playerRef, updateData);
}

/**
 * Save / Create / Update player
 */
export async function savePlayer(player: Partial<Player> & { name: string; isCreditor?: boolean; creditAmount?: number }): Promise<string> {
  const isCreditor = player.isCreditor !== undefined 
    ? player.isCreditor 
    : player.role === 'creditor';
  const advance = player.advanceAmount !== undefined 
    ? Number(player.advanceAmount) 
    : (player.creditAmount !== undefined ? Number(player.creditAmount) : 0);

  const payload: Record<string, any> = {
    name: player.name.trim(),
    role: isCreditor ? 'creditor' : 'player',
    isCreditor: isCreditor,
    status: isCreditor ? 'crediteur' : 'actif',
    advanceAmount: isCreditor ? advance : 0,
    creditAmount: isCreditor ? advance : 0,
    email: player.email || '',
    phone: player.phone || '',
    avatarColor: player.avatarColor || getRandomPastelColor(),
    createdAt: player.createdAt || Date.now()
  };

  const uid = player.userId || player.linkedUid || player.authUid;
  if (uid) {
    payload.userId = uid;
    payload.linkedUid = uid;
    payload.authUid = uid;
  }
  const email = player.linkedEmail || player.authEmail || player.email;
  if (email) {
    payload.linkedEmail = email;
    payload.authEmail = email;
  }

  if (player.id) {
    const playerDocRef = doc(db, 'players', player.id);
    await updateDoc(playerDocRef, payload);
    return player.id;
  } else {
    const playersRef = collection(db, 'players');
    const docRef = await addDoc(playersRef, payload);
    return docRef.id;
  }
}

export async function linkPlayerAuth(playerId: string, authUid: string, authEmail?: string): Promise<void> {
  const playerDocRef = doc(db, 'players', playerId);
  const updatePayload: Record<string, any> = {
    userId: authUid,
    linkedUid: authUid,
    authUid: authUid
  };
  if (authEmail) {
    updatePayload.linkedEmail = authEmail;
    updatePayload.authEmail = authEmail;
  }
  await updateDoc(playerDocRef, updatePayload);

  // Local caching to avoid any flicker on instant page reload
  try {
    localStorage.setItem(`padel_linked_uid_${authUid}`, playerId);
    if (authEmail) {
      localStorage.setItem(`padel_linked_email_${authEmail.toLowerCase().trim()}`, playerId);
    }
  } catch (e) {
    // Ignore storage issues
  }
}

export async function unlinkPlayerAuth(playerId: string, authUid?: string): Promise<void> {
  const playerDocRef = doc(db, 'players', playerId);
  await updateDoc(playerDocRef, {
    userId: null,
    linkedUid: null,
    linkedEmail: null,
    authUid: '',
    authEmail: ''
  });

  if (authUid) {
    try {
      localStorage.removeItem(`padel_linked_uid_${authUid}`);
    } catch (e) {
      // Ignore
    }
  }
}

export async function removePlayer(playerId: string): Promise<void> {
  await deleteDoc(doc(db, 'players', playerId));
}

// ---------------- Matches Service ---------------- //

export function listenMatches(
  callback: (matches: Match[]) => void,
  onError?: (error: any) => void
) {
  const matchesRef = collection(db, 'matches');
  return onSnapshot(matchesRef, (querySnap) => {
    const matches: Match[] = [];
    querySnap.forEach((d) => {
      matches.push({ id: d.id, ...d.data() } as Match);
    });
    // Sort by date ascending (or matchNumber)
    matches.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return (a.matchNumber || 0) - (b.matchNumber || 0);
    });
    callback(matches);
  }, (error) => {
    console.error("Erreur lors de l'écoute des matchs:", error);
    callback([]);
    if (onError) onError(error);
  });
}

export async function saveMatch(matchData: Partial<Match>): Promise<string> {
  const matchesRef = collection(db, 'matches');
  const matchId = matchData.id || doc(matchesRef).id;

  const match: Match = {
    id: matchId,
    matchNumber: matchData.matchNumber,
    date: matchData.date || new Date().toISOString().split('T')[0],
    time: matchData.time || '19:00',
    type: matchData.type || 'regular',
    courtCount: matchData.courtCount || 2,
    pricePerPlayer: matchData.pricePerPlayer !== undefined ? Number(matchData.pricePerPlayer) : 12.50,
    status: matchData.status || 'upcoming',
    courts: matchData.courts && matchData.courts.length > 0 
      ? matchData.courts 
      : [
          createEmptyCourt('court_1', 'Terrain 1'),
          createEmptyCourt('court_2', 'Terrain 6')
        ],
    notes: matchData.notes || '',
    createdAt: matchData.createdAt || Date.now()
  };

  await setDoc(doc(db, 'matches', matchId), match, { merge: true });
  return matchId;
}

export async function removeMatch(matchId: string): Promise<void> {
  await deleteDoc(doc(db, 'matches', matchId));
}

export async function updateSlotInMatch(
  match: Match,
  courtId: string,
  position: SlotPosition,
  player: Player | null,
  creditors: Player[],
  manualPaymentStatus?: 'pending' | 'paid',
  manualPaidToCreditorId?: string | null
): Promise<void> {
  const updatedCourts = match.courts.map(court => {
    if (court.courtId !== courtId) return court;
    
    const updatedSlots = court.slots.map(slot => {
      if (slot.position !== position) return slot;

      if (!player) {
        // Clear slot
        return {
          position,
          playerId: null,
          playerName: null,
          paymentStatus: 'pending' as const,
          paidToCreditorId: null,
          paidAt: null
        };
      }

      // If assigning a player
      const isCreditor = player.role === 'creditor';
      
      let paymentStatus: 'pending' | 'paid' = manualPaymentStatus || (isCreditor ? 'paid' : slot.paymentStatus || 'pending');
      let paidToCreditorId: string | null = manualPaidToCreditorId !== undefined 
        ? manualPaidToCreditorId 
        : (isCreditor ? player.id : slot.paidToCreditorId);

      // If creditor auto-debt deduction: automatically mark as paid to self
      if (isCreditor) {
        paymentStatus = 'paid';
        paidToCreditorId = player.id;
      }

      return {
        position,
        playerId: player.id,
        playerName: player.name,
        paymentStatus,
        paidToCreditorId,
        paidAt: paymentStatus === 'paid' ? (slot.paidAt || Date.now()) : null
      };
    });

    return { ...court, slots: updatedSlots };
  });

  await setDoc(doc(db, 'matches', match.id), { ...match, courts: updatedCourts }, { merge: true });
}

export async function setSlotPaymentStatus(
  matchId: string,
  courtId: string,
  position: SlotPosition,
  status: 'pending' | 'paid',
  paidToCreditorId: string | null = null
): Promise<void> {
  const matchDocRef = doc(db, 'matches', matchId);
  const snap = await getDoc(matchDocRef);
  if (!snap.exists()) return;

  const match = snap.data() as Match;
  const updatedCourts = match.courts.map(court => {
    if (court.courtId !== courtId) return court;
    const updatedSlots = court.slots.map(slot => {
      if (slot.position !== position) return slot;
      return {
        ...slot,
        paymentStatus: status,
        paidToCreditorId: status === 'paid' ? paidToCreditorId : null,
        paidAt: status === 'paid' ? Date.now() : null
      };
    });
    return { ...court, slots: updatedSlots };
  });

  await setDoc(matchDocRef, { ...match, courts: updatedCourts }, { merge: true });
}

// ---------------- 44 Season Matches Generator ---------------- //

export async function generateFullSeasonSchedule(
  settings: ClubSettings,
  startDateStr: string,
  overrideExisting: boolean = false
): Promise<number> {
  const matchesRef = collection(db, 'matches');
  const count = settings.seasonMatchesCount || 44;
  const price = settings.defaultPricePerPlayer || 12.50;
  const courtNames = settings.courtNames && settings.courtNames.length >= 2 
    ? settings.courtNames 
    : ["Terrain 1", "Terrain 6"];
  const time = settings.seasonDefaultTime || "19:00";

  let baseDate = new Date(startDateStr);
  if (isNaN(baseDate.getTime())) {
    baseDate = new Date();
  }

  const batch = writeBatch(db);
  let createdCount = 0;

  for (let i = 1; i <= count; i++) {
    const matchDate = new Date(baseDate);
    matchDate.setDate(baseDate.getDate() + (i - 1) * 7);
    const dateFormatted = matchDate.toISOString().split('T')[0];

    const matchId = `season_match_${i}`;
    const newMatch: Match = {
      id: matchId,
      matchNumber: i,
      date: dateFormatted,
      time: time,
      type: 'regular',
      courtCount: courtNames.length,
      pricePerPlayer: price,
      status: 'upcoming',
      courts: courtNames.map((cName, idx) => createEmptyCourt(`court_${idx + 1}`, cName)),
      notes: `Match #${i} de la saison régulière`,
      createdAt: Date.now()
    };

    batch.set(doc(matchesRef, matchId), newMatch);
    createdCount++;
  }

  await batch.commit();
  return createdCount;
}

// ---------------- Financial Calculations Engine ---------------- //

export function calculateCreditorsSummary(
  creditors: Player[],
  matches: Match[]
): CreditorFinanceSummary[] {
  return creditors.map(creditor => {
    const initialAdvance = Number(creditor.advanceAmount) || 0;
    let matchesPlayedCount = 0;
    let consumedByOwnMatches = 0;
    let reimbursementsReceived = 0;

    matches.forEach(match => {
      const matchPrice = Number(match.pricePerPlayer) || 12.50;

      match.courts.forEach(court => {
        court.slots.forEach(slot => {
          if (!slot.playerId) return;

          // 1. Creditor auto-consumption (he played this slot)
          if (slot.playerId === creditor.id) {
            matchesPlayedCount += 1;
            consumedByOwnMatches += matchPrice;
          }

          // 2. Direct reimbursement received from another player
          if (
            slot.playerId !== creditor.id && 
            slot.paymentStatus === 'paid' && 
            slot.paidToCreditorId === creditor.id
          ) {
            reimbursementsReceived += matchPrice;
          }
        });
      });
    });

    const totalRecovered = consumedByOwnMatches + reimbursementsReceived;
    const remainingToReimburse = Math.max(0, initialAdvance - totalRecovered);
    const progressPercentage = initialAdvance > 0 
      ? Math.min(100, Math.round((totalRecovered / initialAdvance) * 100))
      : 100;

    return {
      creditor,
      initialAdvance,
      matchesPlayedCount,
      consumedByOwnMatches,
      reimbursementsReceived,
      remainingToReimburse,
      progressPercentage
    };
  });
}

export function calculatePlayerDebts(
  players: Player[],
  matches: Match[]
): PlayerDebtSummary[] {
  return players
    .filter(p => p.role !== 'creditor') // Standard players can have cash debts
    .map(player => {
      let totalUnpaidAmount = 0;
      let unpaidMatchesCount = 0;
      let paidMatchesCount = 0;
      const matchesDetails: PlayerDebtSummary['matchesDetails'] = [];

      matches.forEach(match => {
        const matchPrice = Number(match.pricePerPlayer) || 12.50;

        match.courts.forEach(court => {
          court.slots.forEach(slot => {
            if (slot.playerId === player.id) {
              if (slot.paymentStatus === 'pending') {
                totalUnpaidAmount += matchPrice;
                unpaidMatchesCount += 1;
              } else if (slot.paymentStatus === 'paid') {
                paidMatchesCount += 1;
              }

              matchesDetails.push({
                matchId: match.id,
                matchDate: match.date,
                matchNumber: match.matchNumber,
                courtName: court.courtName,
                price: matchPrice,
                paymentStatus: slot.paymentStatus,
                paidToCreditorId: slot.paidToCreditorId,
                position: slot.position
              });
            }
          });
        });
      });

      return {
        player,
        totalUnpaidAmount,
        unpaidMatchesCount,
        paidMatchesCount,
        matchesDetails
      };
    })
    .sort((a, b) => b.totalUnpaidAmount - a.totalUnpaidAmount);
}

// ---------------- Demo Seeding ---------------- //

export async function seedInitialDemoData(settings: ClubSettings): Promise<void> {
  const playersRef = collection(db, 'players');
  const matchesRef = collection(db, 'matches');

  const demoPlayersDefs = [
    { name: 'Maxence (Créancier)', role: 'creditor' as PlayerRole, isCreditor: true, advanceAmount: 1100, email: 'maxence@padel.club', avatarColor: '#E0F2FE' },
    { name: 'Thomas (Créancier)', role: 'creditor' as PlayerRole, isCreditor: true, advanceAmount: 1100, email: 'thomas@padel.club', avatarColor: '#F3E8FF' },
    { name: 'Alexandre', role: 'player' as PlayerRole, isCreditor: false, advanceAmount: 0, email: '', avatarColor: '#DCFCE7' },
    { name: 'Julien B.', role: 'player' as PlayerRole, isCreditor: false, advanceAmount: 0, email: '', avatarColor: '#FEF9C3' },
    { name: 'Romain L.', role: 'player' as PlayerRole, isCreditor: false, advanceAmount: 0, email: '', avatarColor: '#FCE7F3' },
    { name: 'David K.', role: 'player' as PlayerRole, isCreditor: false, advanceAmount: 0, email: '', avatarColor: '#E0E7FF' },
    { name: 'Lucas M.', role: 'player' as PlayerRole, isCreditor: false, advanceAmount: 0, email: '', avatarColor: '#CCFBF1' },
    { name: 'Nicolas V.', role: 'player' as PlayerRole, isCreditor: false, advanceAmount: 0, email: '', avatarColor: '#FFEDD5' }
  ];

  const batch = writeBatch(db);
  const createdPlayers: { [key: string]: { id: string; name: string } } = {};

  for (const def of demoPlayersDefs) {
    const newDocRef = doc(playersRef);
    const playerObj = {
      id: newDocRef.id,
      name: def.name,
      role: def.role,
      isCreditor: def.isCreditor,
      status: def.isCreditor ? 'crediteur' : 'actif',
      advanceAmount: def.advanceAmount,
      creditAmount: def.advanceAmount,
      email: def.email || '',
      phone: '',
      avatarColor: def.avatarColor,
      createdAt: Date.now()
    };
    batch.set(newDocRef, playerObj);
    createdPlayers[def.name] = { id: newDocRef.id, name: def.name };
  }

  // 2. Ensure settings
  batch.set(doc(db, 'settings', 'config'), {
    courtNames: ["Terrain 1", "Terrain 6"],
    seasonMatchesCount: 44,
    defaultPricePerPlayer: 12.50,
    seasonDayOfWeek: 1,
    seasonDefaultTime: "19:00",
    clubName: "Padel Manager Club",
    currency: "€"
  });

  // 3. Create first 6 season matches with authentic Firestore IDs
  const maxenceId = createdPlayers['Maxence (Créancier)']?.id;
  const thomasId = createdPlayers['Thomas (Créancier)']?.id;
  const alexId = createdPlayers['Alexandre']?.id;
  const julienId = createdPlayers['Julien B.']?.id;
  const romainId = createdPlayers['Romain L.']?.id;
  const davidId = createdPlayers['David K.']?.id;
  const lucasId = createdPlayers['Lucas M.']?.id;
  const nicolasId = createdPlayers['Nicolas V.']?.id;

  const today = new Date();
  const nextMonday = new Date(today);
  const day = today.getDay();
  const diff = (day <= 1) ? (1 - day) : (8 - day);
  nextMonday.setDate(today.getDate() + diff);

  for (let i = 1; i <= 6; i++) {
    const matchDate = new Date(nextMonday);
    matchDate.setDate(nextMonday.getDate() + (i - 1) * 7);
    const dateFormatted = matchDate.toISOString().split('T')[0];

    const matchDocRef = doc(matchesRef);
    const courts: MatchCourt[] = [
      {
        courtId: 'court_1',
        courtName: 'Terrain 1',
        slots: [
          {
            position: 'teamA_left',
            playerId: maxenceId,
            playerName: 'Maxence (Créancier)',
            paymentStatus: 'paid',
            paidToCreditorId: maxenceId,
            paidAt: Date.now()
          },
          {
            position: 'teamA_right',
            playerId: alexId,
            playerName: 'Alexandre',
            paymentStatus: i === 1 ? 'paid' : 'pending',
            paidToCreditorId: i === 1 ? maxenceId : null,
            paidAt: i === 1 ? Date.now() : null
          },
          {
            position: 'teamB_left',
            playerId: julienId,
            playerName: 'Julien B.',
            paymentStatus: i <= 2 ? 'paid' : 'pending',
            paidToCreditorId: i <= 2 ? maxenceId : null,
            paidAt: i <= 2 ? Date.now() : null
          },
          {
            position: 'teamB_right',
            playerId: romainId,
            playerName: 'Romain L.',
            paymentStatus: 'pending',
            paidToCreditorId: null,
            paidAt: null
          }
        ]
      },
      {
        courtId: 'court_2',
        courtName: 'Terrain 6',
        slots: [
          {
            position: 'teamA_left',
            playerId: thomasId,
            playerName: 'Thomas (Créancier)',
            paymentStatus: 'paid',
            paidToCreditorId: thomasId,
            paidAt: Date.now()
          },
          {
            position: 'teamA_right',
            playerId: davidId,
            playerName: 'David K.',
            paymentStatus: 'pending',
            paidToCreditorId: null,
            paidAt: null
          },
          {
            position: 'teamB_left',
            playerId: lucasId,
            playerName: 'Lucas M.',
            paymentStatus: i === 1 ? 'paid' : 'pending',
            paidToCreditorId: i === 1 ? thomasId : null,
            paidAt: i === 1 ? Date.now() : null
          },
          {
            position: 'teamB_right',
            playerId: nicolasId,
            playerName: 'Nicolas V.',
            paymentStatus: 'pending',
            paidToCreditorId: null,
            paidAt: null
          }
        ]
      }
    ];

    const match: Match = {
      id: matchDocRef.id,
      matchNumber: i,
      date: dateFormatted,
      time: "19:00",
      type: 'regular',
      courtCount: 2,
      pricePerPlayer: 12.50,
      status: i === 1 ? 'completed' : 'upcoming',
      courts,
      notes: i === 1 ? 'Match #1 d\'ouverture de la saison' : `Match régulier #${i}`,
      createdAt: Date.now() - (7 - i) * 86400000
    };

    batch.set(matchDocRef, match);
  }

  await batch.commit();
}

function getRandomPastelColor(): string {
  const pastels = ['#E0F2FE', '#DCFCE7', '#FEF9C3', '#FCE7F3', '#F3E8FF', '#E0E7FF', '#CCFBF1', '#FFEDD5'];
  return pastels[Math.floor(Math.random() * pastels.length)];
}
