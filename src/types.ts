export type UserRole = 'admin' | 'user' | 'guest';

export type DominantHand = 'Droitier' | 'Gaucher' | 'Les deux (Ambidextre)';
export type PreferredSide = 'Joueur de gauche' | 'Joueur de droite' | 'Polyvalent';
export type Federation = 'Aucune' | 'AFP' | 'AFT' | 'AFP + AFT';

export type PlayerLevel = 
  | 'Aucun niveau défini'
  | '½ ⭐ — P50'
  | '⭐ — P100'
  | '⭐⭐ — P200'
  | '⭐⭐⭐ — P300'
  | '⭐⭐⭐⭐ — P400'
  | '⭐⭐⭐⭐⭐ — P500';

export interface Player {
  id: string;                 // doc.id Firestore
  name: string;               // Nom du joueur
  email: string;              // Email principal du joueur
  accessCode: string;         // Code unique de connexion (ex: "4812" pour Maxence)
  isAdmin: boolean;           // true pour Maxence, false pour les autres
  isCreditor: boolean;        // true si le joueur peut être créancier
  creditBalance: number;      // Montant total qu'on lui doit (créance restante)
  emoji: string;              // Emoji/Icône (Défaut: "🎾")
  dominantHand: DominantHand | string;  // "Droitier" | "Gaucher" | "Les deux (Ambidextre)"
  preferredSide: PreferredSide | string; // "Joueur de gauche" | "Joueur de droite" | "Polyvalent"
  federation: Federation | string;       // "Aucune" | "AFP" | "AFT" | "AFP + AFT"
  level: PlayerLevel | string;           // "Aucun niveau défini" | "½ ⭐ — P50" ...
  levelSortValue: number;     // 0, 0.5, 1, 2, 3, 4, 5
  phone?: string;
  avatarColor?: string;
  createdAt?: number;
}

export interface MatchScoreSet {
  teamA: number | null;
  teamB: number | null;
}

export interface MatchScore {
  set1: MatchScoreSet;
  set2: MatchScoreSet;
  set3: MatchScoreSet;
}

export interface PlayerPayment {
  status: 'paid' | 'pending';
  paidToCreditorId: string | null;
  paidAt: string | null;
}

export type MatchStatus = 'scheduled' | 'completed';
export type MatchType = 'official' | 'friendly' | 'rotating';

export interface Match {
  id: string;                 // doc.id Firestore
  date: string;               // Format ISO (ex: "2026-09-03")
  time: string;               // "20:00"
  courtNumber: number;        // 1 ou 2
  status: MatchStatus;        // "scheduled" | "completed"
  teamA: { 
    player1Id: string; 
    player2Id: string; 
  };
  teamB: { 
    player1Id: string; 
    player2Id: string; 
  };
  payments: { 
    [playerId: string]: PlayerPayment;
  };
  score: MatchScore | null;
  matchType: MatchType;       // "official" | "friendly" | "rotating"
  matchNumber?: number;
  notes?: string;
  createdAt?: number;
}

export interface ClubSettings {
  matchFeePerPlayer: number;  // Montant unitaire d'un match par joueur (ex: 10)
  courtNames?: string[];
  seasonMatchesCount?: number;
  seasonDayOfWeek?: number;   // 4 = Jeudi
  seasonDefaultTime?: string; // "20:00"
  clubName?: string;
  currency?: string;
}

export interface PasswordRequest {
  id?: string;
  requestType: 'email' | 'name';
  value: string;
  playerName?: string;
  playerEmail?: string;
  playerFound?: boolean;
  createdAt: string;
  status: 'pending' | 'resolved';
}

export const DEFAULT_SETTINGS: ClubSettings = {
  matchFeePerPlayer: 10,
  courtNames: ['Terrain 1', 'Terrain 2'],
  seasonMatchesCount: 44,
  seasonDayOfWeek: 4,
  seasonDefaultTime: '20:00',
  clubName: 'Padel Manager',
  currency: '€'
};

export const PLAYER_LEVELS: { label: PlayerLevel; sortValue: number }[] = [
  { label: 'Aucun niveau défini', sortValue: 0 },
  { label: '½ ⭐ — P50', sortValue: 0.5 },
  { label: '⭐ — P100', sortValue: 1 },
  { label: '⭐⭐ — P200', sortValue: 2 },
  { label: '⭐⭐⭐ — P300', sortValue: 3 },
  { label: '⭐⭐⭐⭐ — P400', sortValue: 4 },
  { label: '⭐⭐⭐⭐⭐ — P500', sortValue: 5 },
];

export const DOMINANT_HANDS: DominantHand[] = [
  'Droitier',
  'Gaucher',
  'Les deux (Ambidextre)'
];

export const PREFERRED_SIDES: PreferredSide[] = [
  'Joueur de gauche',
  'Joueur de droite',
  'Polyvalent'
];

export const FEDERATIONS: Federation[] = [
  'Aucune',
  'AFP',
  'AFT',
  'AFP + AFT'
];
