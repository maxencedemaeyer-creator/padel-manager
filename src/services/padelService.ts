import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  ClubSettings, 
  Player, 
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

export function listenSettings(callback: (settings: ClubSettings) => void) {
  const settingsDocRef = doc(db, 'settings', 'config');
  return onSnapshot(settingsDocRef, (docSnap) => {
    if (docSnap.exists()) {
      callback({ ...DEFAULT_SETTINGS, ...docSnap.data() } as ClubSettings);
    } else {
      // Initialize default settings in firestore
      setDoc(settingsDocRef, DEFAULT_SETTINGS).catch(console.error);
      callback(DEFAULT_SETTINGS);
    }
  }, (error) => {
    console.error("Erreur lors de l'écoute des settings:", error);
    callback(DEFAULT_SETTINGS);
  });
}

export async function saveSettings(settings: ClubSettings): Promise<void> {
  const settingsDocRef = doc(db, 'settings', 'config');
  await setDoc(settingsDocRef, settings, { merge: true });
}

// ---------------- Players Service ---------------- //

export function listenPlayers(callback: (players: Player[]) => void) {
  const playersRef = collection(db, 'players');
  return onSnapshot(playersRef, (querySnap) => {
    const players: Player[] = [];
    querySnap.forEach((d) => {
      players.push({ id: d.id, ...d.data() } as Player);
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
  });
}

export async function savePlayer(player: Partial<Player> & { name: string }): Promise<string> {
  const playersRef = collection(db, 'players');
  const playerId = player.id || doc(playersRef).id;
  
  const payload: Partial<Player> = {
    id: playerId,
    name: player.name.trim(),
    role: player.role || 'player',
    status: player.status || (player.role === 'creditor' ? 'crediteur' : 'actif'),
    advanceAmount: Number(player.advanceAmount) || 0,
    email: player.email || '',
    phone: player.phone || '',
    avatarColor: player.avatarColor || getRandomPastelColor(),
    createdAt: player.createdAt || Date.now()
  };

  if (player.linkedUid !== undefined) {
    payload.linkedUid = player.linkedUid;
    payload.authUid = player.linkedUid || '';
  } else if (player.authUid !== undefined) {
    payload.linkedUid = player.authUid;
    payload.authUid = player.authUid;
  }

  if (player.linkedEmail !== undefined) {
    payload.linkedEmail = player.linkedEmail;
    payload.authEmail = player.linkedEmail || '';
  } else if (player.authEmail !== undefined) {
    payload.linkedEmail = player.authEmail;
    payload.authEmail = player.authEmail;
  }

  await setDoc(doc(db, 'players', playerId), payload, { merge: true });
  return playerId;
}

export async function linkPlayerAuth(playerId: string, authUid: string, authEmail?: string): Promise<void> {
  const playerDocRef = doc(db, 'players', playerId);
  await updateDoc(playerDocRef, {
    linkedUid: authUid,
    linkedEmail: authEmail || '',
    authUid,
    authEmail: authEmail || ''
  });
}

export async function unlinkPlayerAuth(playerId: string): Promise<void> {
  const playerDocRef = doc(db, 'players', playerId);
  await updateDoc(playerDocRef, {
    linkedUid: null,
    linkedEmail: null,
    authUid: '',
    authEmail: ''
  });
}

export async function removePlayer(playerId: string): Promise<void> {
  await deleteDoc(doc(db, 'players', playerId));
}

// ---------------- Matches Service ---------------- //

export function listenMatches(callback: (matches: Match[]) => void) {
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
  const batch = writeBatch(db);

  // 1. Create sample creditors and players
  const demoPlayers: Player[] = [
    {
      id: 'creditor_maxence',
      name: 'Maxence (Créancier)',
      role: 'creditor',
      advanceAmount: 1100,
      email: 'maxence@padel.club',
      avatarColor: '#E0F2FE', // pastel sky
      createdAt: Date.now()
    },
    {
      id: 'creditor_thomas',
      name: 'Thomas (Créancier)',
      role: 'creditor',
      advanceAmount: 1100,
      email: 'thomas@padel.club',
      avatarColor: '#F3E8FF', // pastel purple
      createdAt: Date.now()
    },
    {
      id: 'player_alex',
      name: 'Alexandre',
      role: 'player',
      advanceAmount: 0,
      avatarColor: '#DCFCE7', // pastel emerald
      createdAt: Date.now()
    },
    {
      id: 'player_julien',
      name: 'Julien B.',
      role: 'player',
      advanceAmount: 0,
      avatarColor: '#FEF9C3', // pastel amber
      createdAt: Date.now()
    },
    {
      id: 'player_romain',
      name: 'Romain L.',
      role: 'player',
      advanceAmount: 0,
      avatarColor: '#FCE7F3', // pastel rose
      createdAt: Date.now()
    },
    {
      id: 'player_david',
      name: 'David K.',
      role: 'player',
      advanceAmount: 0,
      avatarColor: '#E0E7FF', // pastel indigo
      createdAt: Date.now()
    },
    {
      id: 'player_lucas',
      name: 'Lucas M.',
      role: 'player',
      advanceAmount: 0,
      avatarColor: '#CCFBF1', // pastel teal
      createdAt: Date.now()
    },
    {
      id: 'player_nicolas',
      name: 'Nicolas V.',
      role: 'player',
      advanceAmount: 0,
      avatarColor: '#FFEDD5', // pastel orange
      createdAt: Date.now()
    }
  ];

  demoPlayers.forEach(p => {
    batch.set(doc(db, 'players', p.id), p);
  });

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

  // 3. Create first 6 season matches with some realistic attendances
  const today = new Date();
  const nextMonday = new Date(today);
  const day = today.getDay();
  const diff = (day <= 1) ? (1 - day) : (8 - day);
  nextMonday.setDate(today.getDate() + diff);

  for (let i = 1; i <= 6; i++) {
    const matchDate = new Date(nextMonday);
    matchDate.setDate(nextMonday.getDate() + (i - 1) * 7);
    const dateFormatted = matchDate.toISOString().split('T')[0];

    const matchId = `match_demo_${i}`;
    const courts: MatchCourt[] = [
      {
        courtId: 'court_1',
        courtName: 'Terrain 1',
        slots: [
          {
            position: 'teamA_left',
            playerId: 'creditor_maxence',
            playerName: 'Maxence (Créancier)',
            paymentStatus: 'paid',
            paidToCreditorId: 'creditor_maxence',
            paidAt: Date.now()
          },
          {
            position: 'teamA_right',
            playerId: 'player_alex',
            playerName: 'Alexandre',
            paymentStatus: i === 1 ? 'paid' : 'pending',
            paidToCreditorId: i === 1 ? 'creditor_maxence' : null,
            paidAt: i === 1 ? Date.now() : null
          },
          {
            position: 'teamB_left',
            playerId: 'player_julien',
            playerName: 'Julien B.',
            paymentStatus: i <= 2 ? 'paid' : 'pending',
            paidToCreditorId: i <= 2 ? 'creditor_maxence' : null,
            paidAt: i <= 2 ? Date.now() : null
          },
          {
            position: 'teamB_right',
            playerId: 'player_romain',
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
            playerId: 'creditor_thomas',
            playerName: 'Thomas (Créancier)',
            paymentStatus: 'paid',
            paidToCreditorId: 'creditor_thomas',
            paidAt: Date.now()
          },
          {
            position: 'teamA_right',
            playerId: 'player_david',
            playerName: 'David K.',
            paymentStatus: 'pending',
            paidToCreditorId: null,
            paidAt: null
          },
          {
            position: 'teamB_left',
            playerId: 'player_lucas',
            playerName: 'Lucas M.',
            paymentStatus: i === 1 ? 'paid' : 'pending',
            paidToCreditorId: i === 1 ? 'creditor_thomas' : null,
            paidAt: i === 1 ? Date.now() : null
          },
          {
            position: 'teamB_right',
            playerId: 'player_nicolas',
            playerName: 'Nicolas V.',
            paymentStatus: 'pending',
            paidToCreditorId: null,
            paidAt: null
          }
        ]
      }
    ];

    const match: Match = {
      id: matchId,
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

    batch.set(doc(db, 'matches', matchId), match);
  }

  await batch.commit();
}

function getRandomPastelColor(): string {
  const pastels = ['#E0F2FE', '#DCFCE7', '#FEF9C3', '#FCE7F3', '#F3E8FF', '#E0E7FF', '#CCFBF1', '#FFEDD5'];
  return pastels[Math.floor(Math.random() * pastels.length)];
}
