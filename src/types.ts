export type PlayerRole = 'player' | 'creditor';

export type UserRole = 'admin' | 'user' | 'guest';

export type PaymentStatus = 'pending' | 'paid';

export type MatchType = 'regular' | 'friendly';

export type MatchStatus = 'upcoming' | 'in_progress' | 'completed';

export type SlotPosition = 'teamA_left' | 'teamA_right' | 'teamB_left' | 'teamB_right';

export interface Player {
  id: string;
  name: string;
  role: PlayerRole;
  status?: string; // 'actif', 'inactif', etc.
  advanceAmount: number; // Montant total avancé en € pour un créancier (0 pour joueur)
  email?: string;
  phone?: string;
  avatarColor?: string;
  userId?: string | null; // ID Firebase Auth / Google
  linkedUid?: string | null; // ID Google du joueur
  linkedEmail?: string | null; // Email Google du joueur
  authUid?: string; // Compatibilité authUid
  authEmail?: string;
  isAdmin?: boolean; // Droits d'administration spécifiques
  createdAt?: number;
}

export interface CourtSlot {
  position: SlotPosition;
  playerId: string | null;
  playerName: string | null;
  paymentStatus: PaymentStatus;
  paidToCreditorId: string | null;
  paidAt?: number | null;
}

export interface MatchCourt {
  courtId: string;
  courtName: string;
  slots: CourtSlot[];
}

export interface Match {
  id: string;
  matchNumber?: number;
  date: string; // ISO date string (YYYY-MM-DD) or ISO datetime
  time?: string; // HH:mm
  type: MatchType;
  courtCount: number; // 1 or 2
  pricePerPlayer: number;
  status: MatchStatus;
  courts: MatchCourt[];
  notes?: string;
  createdAt?: number;
}

export interface ClubSettings {
  courtNames: string[];
  seasonMatchesCount: number;
  defaultPricePerPlayer: number;
  seasonDayOfWeek?: number; // 1 = Lundi, 2 = Mardi...
  seasonDefaultTime?: string; // "19:00"
  clubName?: string;
  currency?: string;
}

export interface CreditorFinanceSummary {
  creditor: Player;
  initialAdvance: number;
  matchesPlayedCount: number;
  consumedByOwnMatches: number;
  reimbursementsReceived: number;
  remainingToReimburse: number;
  progressPercentage: number;
}

export interface PlayerDebtSummary {
  player: Player;
  totalUnpaidAmount: number;
  unpaidMatchesCount: number;
  paidMatchesCount: number;
  matchesDetails: {
    matchId: string;
    matchDate: string;
    matchNumber?: number;
    courtName: string;
    price: number;
    paymentStatus: PaymentStatus;
    paidToCreditorId: string | null;
    position: SlotPosition;
  }[];
}
