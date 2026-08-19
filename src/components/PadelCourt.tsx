import React, { useState } from 'react';
import { Match, Player } from '../types';
import { Trophy, Plus, Check, Clock, UserMinus, UserCheck } from 'lucide-react';
import { PaymentModal } from './PaymentModal';
import { ScoreModal } from './ScoreModal';

interface PadelCourtProps {
  match: Match;
  players: Player[];
  matchFee: number;
  isAdmin: boolean;
  isGuest: boolean;
  currentPlayerId: string | null;
  onSlotClick?: (matchId: string, slotKey: 'teamA_player1' | 'teamA_player2' | 'teamB_player1' | 'teamB_player2') => void;
  onRemovePlayer?: (matchId: string, playerId: string) => void;
}

export const PadelCourt: React.FC<PadelCourtProps> = ({
  match,
  players,
  matchFee,
  isAdmin,
  isGuest,
  currentPlayerId,
  onSlotClick,
  onRemovePlayer
}) => {
  const [selectedPaymentPlayerId, setSelectedPaymentPlayerId] = useState<string | null>(null);
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);

  const getPlayer = (id: string | undefined): Player | undefined => {
    if (!id) return undefined;
    return players.find(p => p.id === id);
  };

  const pA1 = getPlayer(match.teamA?.player1Id);
  const pA2 = getPlayer(match.teamA?.player2Id);
  const pB1 = getPlayer(match.teamB?.player1Id);
  const pB2 = getPlayer(match.teamB?.player2Id);

  // Check if current user is part of this court or is admin
  const isPlayerOnCourt = currentPlayerId && (
    match.teamA?.player1Id === currentPlayerId ||
    match.teamA?.player2Id === currentPlayerId ||
    match.teamB?.player1Id === currentPlayerId ||
    match.teamB?.player2Id === currentPlayerId
  );
  const canEditScore = !isGuest && (isAdmin || isPlayerOnCourt);

  const renderSlot = (
    player: Player | undefined,
    slotKey: 'teamA_player1' | 'teamA_player2' | 'teamB_player1' | 'teamB_player2',
    teamColor: 'blue' | 'rose'
  ) => {
    if (!player) {
      return (
        <button
          type="button"
          onClick={() => onSlotClick && onSlotClick(match.id, slotKey)}
          disabled={isGuest}
          className={`h-24 w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-2.5 transition-all group ${
            teamColor === 'blue' 
              ? 'border-blue-200/80 bg-blue-50/40 hover:bg-blue-100/50 hover:border-blue-400' 
              : 'border-rose-200/80 bg-rose-50/40 hover:bg-rose-100/50 hover:border-rose-400'
          } ${isGuest ? 'cursor-default opacity-70' : 'cursor-pointer active:scale-98'}`}
        >
          <div className="w-8 h-8 rounded-xl bg-white/80 flex items-center justify-center text-slate-400 group-hover:text-slate-700 shadow-2xs mb-1 transition-colors">
            <Plus className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-bold text-slate-500 group-hover:text-slate-800">
            {isGuest ? 'Emplacement libre' : '+ Rejoindre'}
          </span>
        </button>
      );
    }

    const payment = match.payments?.[player.id];
    const isPaid = payment?.status === 'paid';
    const isCurrentLoggedIn = currentPlayerId === player.id;

    return (
      <div 
        className={`h-24 w-full rounded-2xl p-2.5 flex flex-col justify-between border shadow-2xs relative transition-all ${
          isCurrentLoggedIn 
            ? 'ring-2 ring-emerald-500 bg-white border-emerald-300' 
            : 'bg-white border-slate-200/90 hover:border-slate-300'
        }`}
      >
        {/* Top: Emoji + Name + Remove */}
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <div 
              className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 text-slate-800"
              style={{ backgroundColor: player.avatarColor || '#E0F2FE' }}
            >
              {player.emoji || '🎾'}
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-slate-900 block truncate leading-tight">
                {player.name}
              </span>
              <span className="text-[10px] text-slate-500 font-medium truncate block">
                {player.dominantHand || 'Droitier'}
              </span>
            </div>
          </div>

          {/* Remove button for admin or current player */}
          {(isAdmin || isCurrentLoggedIn) && !isGuest && (
            <button
              onClick={() => onRemovePlayer && onRemovePlayer(match.id, player.id)}
              title="Retirer du match"
              className="text-slate-300 hover:text-rose-600 p-0.5 rounded-md hover:bg-rose-50 transition-colors"
            >
              <UserMinus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Bottom: Payment Badge */}
        <div className="flex items-center justify-between mt-1">
          <button
            type="button"
            onClick={() => setSelectedPaymentPlayerId(player.id)}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
              isPaid
                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                : 'bg-amber-100 text-amber-900 hover:bg-amber-200 active:scale-95'
            }`}
            title={isPaid ? "Part payée (cliquer pour voir détails)" : "Paiement en attente (cliquer pour enregistrer)"}
          >
            {isPaid ? (
              <>
                <Check className="w-2.5 h-2.5 text-emerald-700 stroke-[3]" />
                <span>Payé ({matchFee}€)</span>
              </>
            ) : (
              <>
                <Clock className="w-2.5 h-2.5 text-amber-700" />
                <span>En attente ({matchFee}€)</span>
              </>
            )}
          </button>

          {player.level && player.level !== 'Aucun niveau défini' && (
            <span className="text-[9px] font-semibold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-md">
              {player.level.split('—')[0].trim()}
            </span>
          )}
        </div>
      </div>
    );
  };

  const hasScore = match.score && (
    match.score.set1?.teamA !== null || 
    match.score.set2?.teamA !== null
  );

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-sm">
      {/* Court Header */}
      <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <h3 className="font-extrabold text-sm tracking-wide">
            Terrain {match.courtNumber}
          </h3>
          {match.status === 'completed' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Terminé
            </span>
          )}
        </div>

        {/* Score Trigger */}
        {canEditScore ? (
          <button
            onClick={() => setIsScoreModalOpen(true)}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>{hasScore ? 'Modifier score' : 'Saisir score'}</span>
          </button>
        ) : hasScore ? (
          <div className="px-2.5 py-1 bg-white/10 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" />
            <span>Score enregistré</span>
          </div>
        ) : null}
      </div>

      {/* Court Canvas / Area */}
      <div className="p-4 bg-slate-50/70">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 relative">
          {/* Team A Area */}
          <div className="bg-blue-50/40 border border-blue-200/70 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2 pb-1 border-b border-blue-200/60">
              <span className="text-xs font-extrabold text-blue-900 uppercase tracking-wider">
                Team A
              </span>
              {hasScore && (
                <div className="flex gap-1.5 text-xs font-black text-blue-950">
                  {match.score?.set1?.teamA !== null && <span>{match.score?.set1?.teamA}</span>}
                  {match.score?.set2?.teamA !== null && <span>/ {match.score?.set2?.teamA}</span>}
                  {match.score?.set3?.teamA !== null && <span>/ {match.score?.set3?.teamA}</span>}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {renderSlot(pA1, 'teamA_player1', 'blue')}
              {renderSlot(pA2, 'teamA_player2', 'blue')}
            </div>
          </div>

          {/* Team B Area */}
          <div className="bg-rose-50/40 border border-rose-200/70 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2 pb-1 border-b border-rose-200/60">
              <span className="text-xs font-extrabold text-rose-900 uppercase tracking-wider">
                Team B
              </span>
              {hasScore && (
                <div className="flex gap-1.5 text-xs font-black text-rose-950">
                  {match.score?.set1?.teamB !== null && <span>{match.score?.set1?.teamB}</span>}
                  {match.score?.set2?.teamB !== null && <span>/ {match.score?.set2?.teamB}</span>}
                  {match.score?.set3?.teamB !== null && <span>/ {match.score?.set3?.teamB}</span>}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {renderSlot(pB1, 'teamB_player1', 'rose')}
              {renderSlot(pB2, 'teamB_player2', 'rose')}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {selectedPaymentPlayerId && (
        <PaymentModal
          isOpen={true}
          onClose={() => setSelectedPaymentPlayerId(null)}
          match={match}
          playerId={selectedPaymentPlayerId}
          players={players}
          matchFee={matchFee}
        />
      )}

      {isScoreModalOpen && (
        <ScoreModal
          isOpen={isScoreModalOpen}
          onClose={() => setIsScoreModalOpen(false)}
          match={match}
          players={players}
        />
      )}
    </div>
  );
};
