import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  addDoc, 
  writeBatch,
  getDoc,
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Player, 
  Match, 
  ClubSettings, 
  PasswordRequest, 
  MatchScore, 
  MatchType,
  MatchStatus,
  PLAYER_LEVELS 
} from '../types';

// Helper error handler adhering strictly to Requirement #2
function handleFirestoreError(error: any, operationName: string) {
  const code = error?.code || 'unknown';
  const msg = error?.message || String(error);
  console.error(`[Firestore Error in ${operationName}] Code: ${code} - Message:`, error);
  alert(`ERREUR FIRESTORE [${code}]: ${msg}`);
}

/* =========================================================================
   1. REAL-TIME SUBSCRIPTIONS (onSnapshot)
   ========================================================================= */

/**
 * Real-time listener for Settings (doc "club" in collection "settings")
 */
export function listenSettings(callback: (settings: ClubSettings) => void): () => void {
  const settingsDocRef = doc(db, 'settings', 'club');
  return onSnapshot(
    settingsDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        callback({
          matchFeePerPlayer: data.matchFeePerPlayer !== undefined ? Number(data.matchFeePerPlayer) : 10,
          courtNames: data.courtNames || ['Terrain 1', 'Terrain 2'],
          seasonMatchesCount: data.seasonMatchesCount || 44,
          seasonDayOfWeek: data.seasonDayOfWeek !== undefined ? Number(data.seasonDayOfWeek) : 4,
          seasonDefaultTime: data.seasonDefaultTime || '20:00',
          clubName: data.clubName || 'Padel Manager',
          currency: data.currency || '€'
        });
      } else {
        // Default initial settings
        const defaultSettings: ClubSettings = {
          matchFeePerPlayer: 10,
          courtNames: ['Terrain 1', 'Terrain 2'],
          seasonMatchesCount: 44,
          seasonDayOfWeek: 4,
          seasonDefaultTime: '20:00',
          clubName: 'Padel Manager',
          currency: '€'
        };
        // Attempt lazy creation
        setDoc(settingsDocRef, defaultSettings).catch((err) => {
          console.warn("Lazy creation settings/club info:", err);
        });
        callback(defaultSettings);
      }
    },
    (error) => {
      handleFirestoreError(error, 'listenSettings');
    }
  );
}

/**
 * Real-time listener for Players collection
 */
export function listenPlayers(callback: (players: Player[]) => void): () => void {
  const playersCol = collection(db, 'players');
  return onSnapshot(
    playersCol,
    (snapshot) => {
      const players: Player[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        
        // Calculate level sort value
        const levelStr = data.level || 'Aucun niveau défini';
        const foundLvl = PLAYER_LEVELS.find(l => l.label === levelStr);
        const levelSortValue = data.levelSortValue !== undefined 
          ? Number(data.levelSortValue) 
          : (foundLvl ? foundLvl.sortValue : 0);

        players.push({
          id: d.id,
          name: data.name || '',
          email: data.email || '',
          accessCode: data.accessCode || '',
          isAdmin: data.isAdmin === true,
          isCreditor: data.isCreditor === true,
          creditBalance: data.creditBalance !== undefined 
            ? Number(data.creditBalance) 
            : (data.advanceAmount !== undefined ? Number(data.advanceAmount) : 0),
          emoji: data.emoji || '🎾',
          dominantHand: data.dominantHand || 'Droitier',
          preferredSide: data.preferredSide || 'Polyvalent',
          federation: data.federation || 'Aucune',
          level: levelStr,
          levelSortValue: levelSortValue,
          phone: data.phone || '',
          avatarColor: data.avatarColor || '#E0F2FE',
          createdAt: data.createdAt || 0
        });
      });

      // Sort alphabetically by name
      players.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
      callback(players);
    },
    (error) => {
      handleFirestoreError(error, 'listenPlayers');
    }
  );
}

/**
 * Real-time listener for Matches collection
 */
export function listenMatches(callback: (matches: Match[]) => void): () => void {
  const matchesCol = collection(db, 'matches');
  return onSnapshot(
    matchesCol,
    (snapshot) => {
      const matches: Match[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        matches.push({
          id: d.id,
          date: data.date || '',
          time: data.time || '20:00',
          courtNumber: data.courtNumber !== undefined ? Number(data.courtNumber) : 1,
          status: data.status === 'completed' ? 'completed' : 'scheduled',
          teamA: {
            player1Id: data.teamA?.player1Id || '',
            player2Id: data.teamA?.player2Id || ''
          },
          teamB: {
            player1Id: data.teamB?.player1Id || '',
            player2Id: data.teamB?.player2Id || ''
          },
          payments: data.payments || {},
          score: data.score || null,
          matchType: data.matchType || 'official',
          matchNumber: data.matchNumber || undefined,
          notes: data.notes || '',
          createdAt: data.createdAt || 0
        });
      });

      // Sort by date then time then courtNumber
      matches.sort((a, b) => {
        const dateComp = a.date.localeCompare(b.date);
        if (dateComp !== 0) return dateComp;
        const timeComp = (a.time || '').localeCompare(b.time || '');
        if (timeComp !== 0) return timeComp;
        return a.courtNumber - b.courtNumber;
      });

      callback(matches);
    },
    (error) => {
      handleFirestoreError(error, 'listenMatches');
    }
  );
}

/**
 * Real-time listener for Password Requests (Admin view)
 */
export function listenPasswordRequests(callback: (reqs: PasswordRequest[]) => void): () => void {
  const reqCol = collection(db, 'password_requests');
  return onSnapshot(
    reqCol,
    (snapshot) => {
      const reqs: PasswordRequest[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        reqs.push({
          id: d.id,
          requestType: data.requestType || 'name',
          value: data.value || '',
          playerName: data.playerName || '',
          playerEmail: data.playerEmail || '',
          playerFound: data.playerFound || false,
          createdAt: data.createdAt || '',
          status: data.status || 'pending'
        });
      });
      // Sort newest first
      reqs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(reqs);
    },
    (error) => {
      console.warn("listenPasswordRequests info:", error);
    }
  );
}

/* =========================================================================
   2. SETTINGS OPERATIONS
   ========================================================================= */

export async function updateClubSettings(settings: Partial<ClubSettings>): Promise<void> {
  try {
    const settingsDocRef = doc(db, 'settings', 'club');
    await setDoc(settingsDocRef, settings, { merge: true });
  } catch (error: any) {
    handleFirestoreError(error, 'updateClubSettings');
    throw error;
  }
}

/* =========================================================================
   3. PLAYERS OPERATIONS
   ========================================================================= */

export async function savePlayer(playerData: Partial<Player>): Promise<string> {
  try {
    const levelStr = playerData.level || 'Aucun niveau défini';
    const foundLvl = PLAYER_LEVELS.find(l => l.label === levelStr);
    const levelSortValue = playerData.levelSortValue !== undefined 
      ? Number(playerData.levelSortValue) 
      : (foundLvl ? foundLvl.sortValue : 0);

    const isCreditor = playerData.isCreditor === true;
    const creditBalance = isCreditor ? (Number(playerData.creditBalance) || 0) : 0;

    const payload: Record<string, any> = {
      name: (playerData.name || '').trim(),
      email: (playerData.email || '').trim(),
      accessCode: (playerData.accessCode || '').trim(),
      isAdmin: playerData.isAdmin === true,
      isCreditor: isCreditor,
      creditBalance: creditBalance,
      emoji: playerData.emoji || '🎾',
      dominantHand: playerData.dominantHand || 'Droitier',
      preferredSide: playerData.preferredSide || 'Polyvalent',
      federation: playerData.federation || 'Aucune',
      level: levelStr,
      levelSortValue: levelSortValue,
      phone: (playerData.phone || '').trim(),
      avatarColor: playerData.avatarColor || '#E0F2FE',
      createdAt: playerData.createdAt || Date.now()
    };

    if (playerData.id) {
      const playerRef = doc(db, 'players', playerData.id);
      await updateDoc(playerRef, payload);
      return playerData.id;
    } else {
      const colRef = collection(db, 'players');
      const docRef = await addDoc(colRef, payload);
      return docRef.id;
    }
  } catch (error: any) {
    handleFirestoreError(error, 'savePlayer');
    throw error;
  }
}

export async function updatePlayerProfile(
  playerId: string, 
  profileData: {
    emoji?: string;
    dominantHand?: string;
    preferredSide?: string;
    federation?: string;
    phone?: string;
    email?: string;
  }
): Promise<void> {
  try {
    const playerRef = doc(db, 'players', playerId);
    await updateDoc(playerRef, profileData);
  } catch (error: any) {
    handleFirestoreError(error, 'updatePlayerProfile');
    throw error;
  }
}

export async function deletePlayer(playerId: string): Promise<void> {
  try {
    const playerRef = doc(db, 'players', playerId);
    await deleteDoc(playerRef);
  } catch (error: any) {
    handleFirestoreError(error, 'deletePlayer');
    throw error;
  }
}

/* =========================================================================
   4. PASSWORD REQUESTS (Assistance Code Oublié)
   ========================================================================= */

export async function createPasswordRequest(data: {
  requestType: 'email' | 'name';
  value: string;
  playerName?: string;
  playerEmail?: string;
  playerFound?: boolean;
}): Promise<void> {
  try {
    const colRef = collection(db, 'password_requests');
    await addDoc(colRef, {
      requestType: data.requestType,
      value: data.value.trim(),
      playerName: data.playerName || '',
      playerEmail: data.playerEmail || '',
      playerFound: data.playerFound || false,
      createdAt: new Date().toISOString(),
      status: 'pending'
    });
  } catch (error: any) {
    handleFirestoreError(error, 'createPasswordRequest');
    throw error;
  }
}

export async function resolvePasswordRequest(requestId: string): Promise<void> {
  try {
    const ref = doc(db, 'password_requests', requestId);
    await updateDoc(ref, { status: 'resolved' });
  } catch (error: any) {
    handleFirestoreError(error, 'resolvePasswordRequest');
    throw error;
  }
}

/* =========================================================================
   5. MATCHES OPERATIONS
   ========================================================================= */

export async function saveMatch(matchData: Partial<Match>): Promise<string> {
  try {
    const payload: Record<string, any> = {
      date: matchData.date || new Date().toISOString().split('T')[0],
      time: matchData.time || '20:00',
      courtNumber: matchData.courtNumber !== undefined ? Number(matchData.courtNumber) : 1,
      status: matchData.status || 'scheduled',
      teamA: {
        player1Id: matchData.teamA?.player1Id || '',
        player2Id: matchData.teamA?.player2Id || ''
      },
      teamB: {
        player1Id: matchData.teamB?.player1Id || '',
        player2Id: matchData.teamB?.player2Id || ''
      },
      payments: matchData.payments || {},
      score: matchData.score || null,
      matchType: matchData.matchType || 'official',
      notes: matchData.notes || '',
      createdAt: matchData.createdAt || Date.now()
    };

    if (matchData.matchNumber !== undefined) {
      payload.matchNumber = matchData.matchNumber;
    }

    if (matchData.id) {
      const matchRef = doc(db, 'matches', matchData.id);
      await updateDoc(matchRef, payload);
      return matchData.id;
    } else {
      const colRef = collection(db, 'matches');
      const docRef = await addDoc(colRef, payload);
      return docRef.id;
    }
  } catch (error: any) {
    handleFirestoreError(error, 'saveMatch');
    throw error;
  }
}

/**
 * Quick slot assignment / removal for a court
 */
export async function assignPlayerToSlot(
  matchId: string,
  slotKey: 'teamA_player1' | 'teamA_player2' | 'teamB_player1' | 'teamB_player2',
  playerId: string | ''
): Promise<void> {
  try {
    const matchRef = doc(db, 'matches', matchId);
    let updateField = '';
    if (slotKey === 'teamA_player1') updateField = 'teamA.player1Id';
    else if (slotKey === 'teamA_player2') updateField = 'teamA.player2Id';
    else if (slotKey === 'teamB_player1') updateField = 'teamB.player1Id';
    else if (slotKey === 'teamB_player2') updateField = 'teamB.player2Id';

    const updatePayload: Record<string, any> = {
      [updateField]: playerId
    };

    // If assigning a player, ensure a payment entry is initialized
    if (playerId) {
      updatePayload[`payments.${playerId}.status`] = 'pending';
      updatePayload[`payments.${playerId}.paidToCreditorId`] = null;
      updatePayload[`payments.${playerId}.paidAt`] = null;
    }

    await updateDoc(matchRef, updatePayload);
  } catch (error: any) {
    handleFirestoreError(error, 'assignPlayerToSlot');
    throw error;
  }
}

/**
 * Remove player from a match
 */
export async function removePlayerFromMatch(matchId: string, playerId: string): Promise<void> {
  try {
    const matchRef = doc(db, 'matches', matchId);
    const snap = await getDoc(matchRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const updatePayload: Record<string, any> = {};

    if (data.teamA?.player1Id === playerId) updatePayload['teamA.player1Id'] = '';
    if (data.teamA?.player2Id === playerId) updatePayload['teamA.player2Id'] = '';
    if (data.teamB?.player1Id === playerId) updatePayload['teamB.player1Id'] = '';
    if (data.teamB?.player2Id === playerId) updatePayload['teamB.player2Id'] = '';

    await updateDoc(matchRef, updatePayload);
  } catch (error: any) {
    handleFirestoreError(error, 'removePlayerFromMatch');
    throw error;
  }
}

/**
 * Record payment for a player and deduct from creditor's balance in a transaction
 */
export async function recordPayment(
  matchId: string,
  playerId: string,
  creditorId: string,
  matchFee: number
): Promise<void> {
  try {
    await runTransaction(db, async (transaction) => {
      const matchRef = doc(db, 'matches', matchId);
      const creditorRef = doc(db, 'players', creditorId);

      const [matchSnap, creditorSnap] = await Promise.all([
        transaction.get(matchRef),
        transaction.get(creditorRef)
      ]);

      if (!matchSnap.exists()) {
        throw new Error("Match introuvable");
      }

      // Update match payments
      transaction.update(matchRef, {
        [`payments.${playerId}`]: {
          status: 'paid',
          paidToCreditorId: creditorId,
          paidAt: new Date().toISOString()
        }
      });

      // Update creditor creditBalance if creditor exists
      if (creditorSnap.exists()) {
        const credData = creditorSnap.data();
        const currentBalance = Number(credData.creditBalance) || 0;
        const newBalance = Math.max(0, currentBalance - matchFee);
        transaction.update(creditorRef, {
          creditBalance: newBalance
        });
      }
    });
  } catch (error: any) {
    handleFirestoreError(error, 'recordPayment');
    throw error;
  }
}

/**
 * Revert a payment back to pending
 */
export async function revertPayment(
  matchId: string,
  playerId: string,
  previousCreditorId: string | null,
  matchFee: number
): Promise<void> {
  try {
    await runTransaction(db, async (transaction) => {
      const matchRef = doc(db, 'matches', matchId);
      
      transaction.update(matchRef, {
        [`payments.${playerId}`]: {
          status: 'pending',
          paidToCreditorId: null,
          paidAt: null
        }
      });

      if (previousCreditorId) {
        const creditorRef = doc(db, 'players', previousCreditorId);
        const credSnap = await transaction.get(creditorRef);
        if (credSnap.exists()) {
          const credData = credSnap.data();
          const currentBalance = Number(credData.creditBalance) || 0;
          transaction.update(creditorRef, {
            creditBalance: currentBalance + matchFee
          });
        }
      }
    });
  } catch (error: any) {
    handleFirestoreError(error, 'revertPayment');
    throw error;
  }
}

/**
 * Save match scores & update status
 */
export async function saveMatchScore(
  matchId: string,
  score: MatchScore,
  status: MatchStatus = 'completed',
  matchType: MatchType = 'official'
): Promise<void> {
  try {
    const matchRef = doc(db, 'matches', matchId);
    await updateDoc(matchRef, {
      score,
      status,
      matchType
    });
  } catch (error: any) {
    handleFirestoreError(error, 'saveMatchScore');
    throw error;
  }
}

export async function deleteMatch(matchId: string): Promise<void> {
  try {
    const matchRef = doc(db, 'matches', matchId);
    await deleteDoc(matchRef);
  } catch (error: any) {
    handleFirestoreError(error, 'deleteMatch');
    throw error;
  }
}

/* =========================================================================
   6. AUTOMATIC SEASON GENERATOR (44 consecutive Thursdays, 2 courts each)
   ========================================================================= */

/**
 * Generates 44 consecutive Thursdays starting at the specified date (or default Sep 3, 2026)
 * Creates 2 matches per Thursday (Terrain 1 and Terrain 2)
 */
export async function generateSeasonMatches(
  startDateStr: string = '2026-09-03',
  timeStr: string = '20:00',
  totalThursdays: number = 44
): Promise<{ count: number }> {
  try {
    // Parse starting date
    const [year, month, day] = startDateStr.split('-').map(Number);
    const currentDate = new Date(year, month - 1, day);

    // If starting date is not a Thursday (4), adjust to the next Thursday
    while (currentDate.getDay() !== 4) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    let batch = writeBatch(db);
    let opCount = 0;
    let createdCount = 0;

    for (let i = 0; i < totalThursdays; i++) {
      const matchDateStr = currentDate.toISOString().split('T')[0];
      const sessionNumber = i + 1;

      // Create Court 1 Match
      const match1Ref = doc(collection(db, 'matches'));
      batch.set(match1Ref, {
        date: matchDateStr,
        time: timeStr,
        courtNumber: 1,
        status: 'scheduled',
        teamA: { player1Id: '', player2Id: '' },
        teamB: { player1Id: '', player2Id: '' },
        payments: {},
        score: null,
        matchType: 'official',
        matchNumber: sessionNumber,
        notes: `Séance ${sessionNumber} — Terrain 1`,
        createdAt: Date.now()
      });
      opCount++;
      createdCount++;

      // Create Court 2 Match
      const match2Ref = doc(collection(db, 'matches'));
      batch.set(match2Ref, {
        date: matchDateStr,
        time: timeStr,
        courtNumber: 2,
        status: 'scheduled',
        teamA: { player1Id: '', player2Id: '' },
        teamB: { player1Id: '', player2Id: '' },
        payments: {},
        score: null,
        matchType: 'official',
        matchNumber: sessionNumber,
        notes: `Séance ${sessionNumber} — Terrain 2`,
        createdAt: Date.now()
      });
      opCount++;
      createdCount++;

      // Commit in batches of 400 operations
      if (opCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }

      // Advance by 7 days for next Thursday
      currentDate.setDate(currentDate.getDate() + 7);
    }

    if (opCount > 0) {
      await batch.commit();
    }

    return { count: createdCount };
  } catch (error: any) {
    handleFirestoreError(error, 'generateSeasonMatches');
    throw error;
  }
}

/**
 * Clear all existing matches (Admin only)
 */
export async function clearAllMatches(existingMatches: Match[]): Promise<void> {
  try {
    let batch = writeBatch(db);
    let opCount = 0;

    for (const m of existingMatches) {
      const ref = doc(db, 'matches', m.id);
      batch.delete(ref);
      opCount++;
      if (opCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }
  } catch (error: any) {
    handleFirestoreError(error, 'clearAllMatches');
    throw error;
  }
}

/* =========================================================================
   7. INITIAL SEEDING (Admin & Default Roster)
   ========================================================================= */

export async function seedInitialPlayers(): Promise<void> {
  try {
    const initialRoster: Omit<Player, 'id'>[] = [
      {
        name: 'Maxence',
        email: 'maxence.de.maeyer@gmail.com',
        accessCode: '4812',
        isAdmin: true,
        isCreditor: true,
        creditBalance: 880,
        emoji: '👑',
        dominantHand: 'Droitier',
        preferredSide: 'Joueur de gauche',
        federation: 'AFP',
        level: '⭐⭐⭐ — P300',
        levelSortValue: 3,
        avatarColor: '#DDD6FE',
        createdAt: Date.now()
      },
      {
        name: 'Thomas',
        email: 'thomas@example.com',
        accessCode: '1021',
        isAdmin: false,
        isCreditor: true,
        creditBalance: 880,
        emoji: '⚡',
        dominantHand: 'Droitier',
        preferredSide: 'Joueur de droite',
        federation: 'AFP',
        level: '⭐⭐⭐ — P300',
        levelSortValue: 3,
        avatarColor: '#BAE6FD',
        createdAt: Date.now()
      },
      {
        name: 'Alexandre',
        email: 'alexandre@example.com',
        accessCode: '2032',
        isAdmin: false,
        isCreditor: false,
        creditBalance: 0,
        emoji: '🎾',
        dominantHand: 'Droitier',
        preferredSide: 'Polyvalent',
        federation: 'AFP',
        level: '⭐⭐ — P200',
        levelSortValue: 2,
        avatarColor: '#BBF7D0',
        createdAt: Date.now()
      },
      {
        name: 'Julien',
        email: 'julien@example.com',
        accessCode: '3043',
        isAdmin: false,
        isCreditor: false,
        creditBalance: 0,
        emoji: '🔥',
        dominantHand: 'Gaucher',
        preferredSide: 'Joueur de droite',
        federation: 'AFT',
        level: '⭐⭐ — P200',
        levelSortValue: 2,
        avatarColor: '#FED7AA',
        createdAt: Date.now()
      },
      {
        name: 'Nicolas',
        email: 'nicolas@example.com',
        accessCode: '4054',
        isAdmin: false,
        isCreditor: false,
        creditBalance: 0,
        emoji: '🚀',
        dominantHand: 'Droitier',
        preferredSide: 'Joueur de gauche',
        federation: 'Aucune',
        level: '⭐ — P100',
        levelSortValue: 1,
        avatarColor: '#FBCFE8',
        createdAt: Date.now()
      },
      {
        name: 'Romain',
        email: 'romain@example.com',
        accessCode: '5065',
        isAdmin: false,
        isCreditor: false,
        creditBalance: 0,
        emoji: '🎯',
        dominantHand: 'Droitier',
        preferredSide: 'Polyvalent',
        federation: 'AFP + AFT',
        level: '⭐⭐ — P200',
        levelSortValue: 2,
        avatarColor: '#E9D5FF',
        createdAt: Date.now()
      },
      {
        name: 'Sébastien',
        email: 'sebastien@example.com',
        accessCode: '6076',
        isAdmin: false,
        isCreditor: false,
        creditBalance: 0,
        emoji: '🦁',
        dominantHand: 'Droitier',
        preferredSide: 'Joueur de droite',
        federation: 'AFP',
        level: '⭐⭐ — P200',
        levelSortValue: 2,
        avatarColor: '#FEF08A',
        createdAt: Date.now()
      },
      {
        name: 'Laurent',
        email: 'laurent@example.com',
        accessCode: '7087',
        isAdmin: false,
        isCreditor: false,
        creditBalance: 0,
        emoji: '⭐',
        dominantHand: 'Les deux (Ambidextre)',
        preferredSide: 'Polyvalent',
        federation: 'Aucune',
        level: '⭐ — P100',
        levelSortValue: 1,
        avatarColor: '#CCFBF1',
        createdAt: Date.now()
      }
    ];

    const batch = writeBatch(db);
    for (const p of initialRoster) {
      const ref = doc(collection(db, 'players'));
      batch.set(ref, p);
    }
    await batch.commit();
  } catch (error: any) {
    handleFirestoreError(error, 'seedInitialPlayers');
    throw error;
  }
}
