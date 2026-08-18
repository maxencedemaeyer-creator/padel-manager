import React from 'react';
import { MatchCourt, CourtSlot, Player, SlotPosition } from '../types';
import { Clock, Check, Users } from 'lucide-react';

interface PadelCourtProps {
  court: MatchCourt;
  matchPrice: number;
  players: Player[];
  onSlotClick: (courtId: string, slot: CourtSlot) => void;
  onQuickTogglePayment?: (courtId: string, slot: CourtSlot, e: React.MouseEvent) => void;
  compact?: boolean;
}

export const PadelCourt: React.FC<PadelCourtProps> = ({
  court,
  matchPrice,
  players,
  onSlotClick,
  onQuickTogglePayment,
  compact = false
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

  const renderSlotCard = (position: SlotPosition, playerNumber: string, sideLabel: string, teamTheme: 'teamA' | 'teamB') => {
    const slot = getSlot(position);
    const player = getPlayerDetails(slot.playerId);
    const isAssigned = !!slot.playerId;
    const isCreditor = player?.role === 'creditor';

    return (
      <div
        id={`slot-${court.courtId}-${position}`}
        onClick={() => onSlotClick(court.courtId, slot)}
        className={`relative rounded-xl border p-2.5 sm:p-3 flex flex-col items-center justify-center text-center gap-1.5 transition-all cursor-pointer select-none ${
          isAssigned
            ? 'bg-white/95 backdrop-blur-xs border-emerald-300 hover:bg-white shadow-2xs hover:shadow-xs active:scale-98'
            : 'bg-white/70 border-dashed border-slate-300 hover:bg-white hover:border-emerald-400 active:scale-98'
        } ${compact ? 'min-h-[96px]' : 'min-h-[114px]'}`}
      >
        {/* Payment / Creditor Badge on top corner if assigned */}
        {isAssigned && (
          <div className="absolute top-2 right-2 z-10">
            <span
              onClick={(e) => {
                if (onQuickTogglePayment) {
                  e.stopPropagation();
                  onQuickTogglePayment(court.courtId, slot, e);
                }
              }}
              title={
                isCreditor 
                  ? 'Auto-déduit de son avance' 
                  : slot.paymentStatus === 'paid' 
                    ? `Payé à ${getCreditorName(slot.paidToCreditorId)}` 
                    : 'Paiement en attente'
              }
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold transition-transform hover:scale-105 ${
                slot.paymentStatus === 'paid'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-100 text-amber-900 border border-amber-200'
              }`}
            >
              {slot.paymentStatus === 'paid' ? (
                <>
                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                  <span>{isCreditor ? 'Avance' : 'Payé'}</span>
                </>
              ) : (
                <>
                  <Clock className="w-2.5 h-2.5 text-amber-600" />
                  <span>Attente</span>
                </>
              )}
            </span>
          </div>
        )}

        {/* Position Tag */}
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <span className={teamTheme === 'teamA' ? 'text-blue-700' : 'text-purple-700'}>
            {playerNumber}
          </span>
          <span>•</span>
          <span>{sideLabel}</span>
        </div>

        {/* Avatar circle */}
        {isAssigned ? (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shadow-2xs text-slate-700 mt-0.5"
            style={{ backgroundColor: player?.avatarColor || '#DBEAFE' }}
          >
            {slot.playerName?.slice(0, 2).toUpperCase() || 'P'}
          </div>
        ) : (
          <div className="w-10 h-10 bg-slate-100/90 border-2 border-dashed border-slate-300 rounded-full flex items-center justify-center text-slate-400 font-bold text-sm mt-0.5">
            +
          </div>
        )}

        {/* Player Name / Empty text */}
        <div className="w-full px-1 truncate">
          <span className={`text-xs font-bold block truncate ${isAssigned ? 'text-slate-900' : 'text-slate-400'}`}>
            {isAssigned ? slot.playerName : 'Emplacement libre'}
          </span>
        </div>
      </div>
    );
  };

  const assignedCount = court.slots.filter(s => s.playerId !== null).length;
  const isFull = assignedCount === 4;

  return (
    <div className="w-full bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden p-4 sm:p-5 space-y-3">
      {/* Court Header Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm sm:text-base font-bold text-slate-800">
            {court.courtName}
          </h4>
          <span className="text-xs text-slate-400 font-medium">
            ({matchPrice.toFixed(2)} €/j)
          </span>
        </div>

        <span
          className={`px-3 py-0.5 rounded-full text-xs font-semibold ${
            isFull
              ? 'bg-emerald-100 text-emerald-700'
              : assignedCount === 0
              ? 'bg-slate-100 text-slate-600'
              : 'bg-sky-100 text-sky-700'
          }`}
        >
          {assignedCount}/4 joueurs
        </span>
      </div>

      {/* Graphical Padel Court with Two Distinct Sides separated by Net */}
      <div className="relative bg-emerald-50/90 rounded-2xl border-2 border-emerald-200/80 p-3 sm:p-4 overflow-hidden">
        {/* Côté 1 : Équipe A */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100/80 text-blue-800 border border-blue-200/60">
              <Users className="w-3 h-3 text-blue-600" />
              Côté 1 — Équipe A
            </span>
            <span className="text-[10px] font-semibold text-slate-400">
              Joueur A1 & A2 ensemble
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {renderSlotCard('teamA_left', 'Joueur A1', 'Revers (Gauche)', 'teamA')}
            {renderSlotCard('teamA_right', 'Joueur A2', 'Drive (Droit)', 'teamA')}
          </div>
        </div>

        {/* Filet Central (Net) Divider */}
        <div className="relative my-3 sm:my-3.5 flex items-center justify-center">
          <div className="w-full h-1 bg-emerald-300 rounded-full border-t border-emerald-400/50 shadow-2xs" />
          <div className="absolute bg-slate-900 text-white border border-slate-700 px-3.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider shadow-sm flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Filet Central (Net)</span>
          </div>
        </div>

        {/* Côté 2 : Équipe B */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {renderSlotCard('teamB_left', 'Joueur B1', 'Revers (Gauche)', 'teamB')}
            {renderSlotCard('teamB_right', 'Joueur B2', 'Drive (Droit)', 'teamB')}
          </div>

          <div className="flex items-center justify-between px-1 pt-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100/80 text-purple-800 border border-purple-200/60">
              <Users className="w-3 h-3 text-purple-600" />
              Côté 2 — Équipe B
            </span>
            <span className="text-[10px] font-semibold text-slate-400">
              Joueur B1 & B2 ensemble
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
