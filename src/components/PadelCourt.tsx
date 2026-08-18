import React from 'react';
import { MatchCourt, CourtSlot, Player, SlotPosition } from '../types';
import { Clock, Check, Plus, UserCheck, Shield } from 'lucide-react';

interface PadelCourtProps {
  court: MatchCourt;
  matchPrice: number;
  players: Player[];
  onSlotClick: (courtId: string, slot: CourtSlot) => void;
  onQuickTogglePayment?: (courtId: string, slot: CourtSlot, e: React.MouseEvent) => void;
  compact?: boolean;
  readOnly?: boolean;
}

export const PadelCourt: React.FC<PadelCourtProps> = ({
  court,
  matchPrice,
  players,
  onSlotClick,
  onQuickTogglePayment,
  compact = false,
  readOnly = false
}) => {
  const getSlot = (pos: SlotPosition): CourtSlot => {
    return (
      court.slots.find(s => s.position === pos) || {
        position: pos,
        playerId: null,
        playerName: null,
        paymentStatus: 'pending',
        paidToCreditorId: null,
        paidAt: null
      }
    );
  };

  const getPlayerDetails = (playerId: string | null): Player | undefined => {
    if (!playerId) return undefined;
    return players.find(p => p.id === playerId);
  };

  const creditors = players.filter(p => p.role === 'creditor');

  const getCreditorName = (creditorId: string | null) => {
    if (!creditorId) return '';
    const c = creditors.find(cr => cr.id === creditorId);
    return c ? c.name : 'Créancier';
  };

  const assignedCount = court.slots.filter(s => s.playerId !== null).length;
  const isFull = assignedCount === 4;

  /**
   * Quadrant Slot renderer positioned on the padel court
   * @param position Exact SlotPosition enum
   * @param teamName 'Team A' | 'Team B'
   * @param sideRole 'Drive (Droit)' | 'Revers (Gauche)'
   * @param teamColor 'blue' | 'purple'
   */
  const renderCourtQuadrant = (
    position: SlotPosition,
    teamName: string,
    sideRole: string,
    teamColor: 'blue' | 'purple'
  ) => {
    const slot = getSlot(position);
    const player = getPlayerDetails(slot.playerId);
    const isAssigned = !!slot.playerId;
    const isCreditor = player?.role === 'creditor';

    return (
      <div
        id={`slot-${court.courtId}-${position}`}
        onClick={() => {
          if (!readOnly) {
            onSlotClick(court.courtId, slot);
          }
        }}
        className={`group relative rounded-2xl transition-all duration-200 select-none flex flex-col justify-between p-2.5 sm:p-3.5 ${
          readOnly ? 'cursor-default' : 'cursor-pointer'
        } ${
          isAssigned
            ? 'bg-white/95 hover:bg-white text-slate-900 shadow-md hover:shadow-lg border border-white/60 hover:border-white ring-1 ring-black/5 active:scale-[0.985]'
            : 'bg-blue-950/40 hover:bg-blue-900/60 border-2 border-dashed border-white/35 hover:border-white/80 text-white/90 active:scale-[0.985]'
        } ${compact ? 'min-h-[115px]' : 'min-h-[135px]'}`}
      >
        {/* Top bar inside slot card: Role Pill & Payment Status */}
        <div className="flex items-center justify-between gap-1 w-full">
          {/* Position label */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${
              isAssigned
                ? teamColor === 'blue'
                  ? 'bg-sky-100 text-sky-800'
                  : 'bg-indigo-100 text-indigo-800'
                : 'bg-white/15 text-white/80 border border-white/20'
            }`}
          >
            <span>{teamName}</span>
            <span>•</span>
            <span>{sideRole}</span>
          </span>

          {/* Payment / Creditor Badge */}
          {isAssigned && (
            <button
              type="button"
              onClick={(e) => {
                if (!readOnly && onQuickTogglePayment) {
                  e.stopPropagation();
                  onQuickTogglePayment(court.courtId, slot, e);
                }
              }}
              title={
                isCreditor
                  ? 'Compte créancier (auto-déduit)'
                  : slot.paymentStatus === 'paid'
                  ? `Payé à ${getCreditorName(slot.paidToCreditorId)}`
                  : 'Paiement en attente (cliquez pour basculer)'
              }
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-2xs transition-transform ${
                !readOnly ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-default'
              } ${
                slot.paymentStatus === 'paid'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-amber-100 text-amber-900 border border-amber-300'
              }`}
            >
              {slot.paymentStatus === 'paid' ? (
                <>
                  <Check className="w-3 h-3 text-emerald-700 stroke-[2.5]" />
                  <span>{isCreditor ? 'Avance' : 'Payé'}</span>
                </>
              ) : (
                <>
                  <Clock className="w-3 h-3 text-amber-700 stroke-[2.5]" />
                  <span>Attente</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Center: Player Info or Free Slot Button */}
        {isAssigned ? (
          <div className="flex items-center gap-2.5 my-1.5 w-full min-w-0">
            {/* Player Avatar Circle with initials */}
            <div
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-black text-xs sm:text-sm text-slate-800 shrink-0 shadow-2xs border border-black/10"
              style={{ backgroundColor: player?.avatarColor || '#E0E7FF' }}
            >
              {slot.playerName?.slice(0, 2).toUpperCase() || 'P'}
            </div>

            {/* Name and details */}
            <div className="flex-1 min-w-0 text-left">
              <h5 className="text-xs sm:text-sm font-bold text-slate-900 truncate leading-tight">
                {slot.playerName}
              </h5>
              <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium truncate mt-0.5">
                {isCreditor ? (
                  <span className="inline-flex items-center gap-0.5 text-purple-700 font-bold">
                    <Shield className="w-2.5 h-2.5" />
                    Créancier
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-slate-500">
                    <UserCheck className="w-2.5 h-2.5 text-slate-400" />
                    Joueur
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center my-1.5 py-1 text-center">
            <div className="w-8 h-8 rounded-full bg-white/20 group-hover:bg-white/30 border border-white/40 flex items-center justify-center text-white mb-1 shadow-2xs transition-colors">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-white group-hover:text-white drop-shadow-xs">
              {readOnly ? 'Emplacement libre' : '+ Rejoindre le slot'}
            </span>
          </div>
        )}

        {/* Bottom subtle indicator */}
        <div className="flex items-center justify-between text-[9px] w-full pt-1 border-t border-black/5">
          <span className={isAssigned ? 'text-slate-400 font-semibold' : 'text-white/60'}>
            {isAssigned ? 'Cliquer pour modifier' : 'Place disponible'}
          </span>
          <span className={isAssigned ? 'text-slate-400' : 'text-white/60'}>
            {matchPrice.toFixed(2)} €
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden p-4 sm:p-5 space-y-3.5">
      {/* Court Header Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-600 shadow-xs" />
          <h4 className="text-sm sm:text-base font-bold text-slate-800">
            {court.courtName}
          </h4>
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">
            ({matchPrice.toFixed(2)} € / joueur)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-0.5 rounded-full text-xs font-bold ${
              isFull
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : assignedCount === 0
                ? 'bg-slate-100 text-slate-600'
                : 'bg-sky-100 text-sky-800 border border-sky-200'
            }`}
          >
            {assignedCount}/4 joueurs {isFull && '• Complet'}
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* REALISTIC PADEL COURT CONTAINER (BORDURES VITRÉES & LIGNES BLANCHES AU SOL) */}
      {/* ========================================================================= */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-[#1d4ed8] via-[#1e40af] to-[#1e3a8a] p-3 sm:p-4 border-2 sm:border-3 border-blue-900 shadow-inner">
        {/* Court Glass Walls Top Bar (Paroi Vitrée de fond Côté Haut) */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-b from-sky-200/40 via-sky-300/20 to-transparent pointer-events-none" />
        
        {/* Court Perimeter White Lines (Lignes extérieures du terrain) */}
        <div className="relative border-2 border-white/75 rounded-xl p-2.5 sm:p-3 space-y-3">
          
          {/* TEAM A (CÔTÉ HAUT DU FILET) */}
          <div className="relative space-y-2">
            {/* Team A Header Badge */}
            <div className="flex items-center justify-between px-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-blue-950/70 text-blue-200 border border-blue-400/30 backdrop-blur-xs">
                Côté Haut — Team A
              </span>
              <span className="text-[10px] font-bold text-white/70">
                Service Haut
              </span>
            </div>

            {/* Ligne de service Team A (Fond blanc translucide) */}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {/* Case Haut-Gauche: Joueur DROITE de la Team A */}
              {renderCourtQuadrant('teamA_right', 'Team A', 'Drive (Droit)', 'blue')}

              {/* Case Haut-Droite: Joueur GAUCHE de la Team A */}
              {renderCourtQuadrant('teamA_left', 'Team A', 'Revers (Gauche)', 'blue')}
            </div>

            {/* Ligne de service transversale blanche (Team A Service Line) */}
            <div className="w-full h-0.5 bg-white/60 mt-1 shadow-2xs" />
          </div>

          {/* ========================================================================= */}
          {/* FILET CENTRAL (NET) HORIZONTAL RÉALISTE */}
          {/* ========================================================================= */}
          <div className="relative my-2 sm:my-3 py-1 flex items-center justify-center">
            {/* Poteau métallique gauche */}
            <div className="absolute -left-3 sm:-left-3.5 w-2 h-6 bg-slate-200 border border-slate-400 rounded-sm shadow-xs z-20" />

            {/* Structure du Filet (Mesh Pattern + White Upper Band) */}
            <div className="w-full relative flex items-center">
              {/* Ligne blanche supérieure du filet (Upper Net Cord) */}
              <div className="w-full h-1.5 bg-white rounded-full shadow-md border-b border-slate-300" />
            </div>

            {/* Central Net Badge */}
            <div className="absolute z-10 bg-slate-950 text-white border border-slate-600 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-md flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Filet • Net</span>
            </div>

            {/* Poteau métallique droit */}
            <div className="absolute -right-3 sm:-right-3.5 w-2 h-6 bg-slate-200 border border-slate-400 rounded-sm shadow-xs z-20" />
          </div>

          {/* TEAM B (CÔTÉ BAS DU FILET) */}
          <div className="relative space-y-2">
            {/* Ligne de service transversale blanche (Team B Service Line) */}
            <div className="w-full h-0.5 bg-white/60 mb-1 shadow-2xs" />

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {/* Case Bas-Gauche: Joueur GAUCHE de la Team B */}
              {renderCourtQuadrant('teamB_left', 'Team B', 'Revers (Gauche)', 'purple')}

              {/* Case Bas-Droite: Joueur DROITE de la Team B */}
              {renderCourtQuadrant('teamB_right', 'Team B', 'Drive (Droit)', 'purple')}
            </div>

            {/* Team B Footer Badge */}
            <div className="flex items-center justify-between px-1 pt-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-indigo-950/70 text-indigo-200 border border-indigo-400/30 backdrop-blur-xs">
                Côté Bas — Team B
              </span>
              <span className="text-[10px] font-bold text-white/70">
                Service Bas
              </span>
            </div>
          </div>

        </div>

        {/* Court Glass Walls Bottom Bar (Paroi Vitrée de fond Côté Bas) */}
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t from-sky-200/40 via-sky-300/20 to-transparent pointer-events-none" />
      </div>
    </div>
  );
};
