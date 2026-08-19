import React, { useState, useMemo } from 'react';
import { Player } from '../types';
import { assignPlayerToSlot } from '../services/padelService';
import { UserCheck, Search, X, Loader2, Plus, Sparkles } from 'lucide-react';

interface AssignPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  slotKey: 'teamA_player1' | 'teamA_player2' | 'teamB_player1' | 'teamB_player2';
  courtNumber: number;
  players: Player[];
  currentPlayer: Player | null;
  isAdmin: boolean;
}

export const AssignPlayerModal: React.FC<AssignPlayerModalProps> = ({
  isOpen,
  onClose,
  matchId,
  slotKey,
  courtNumber,
  players,
  currentPlayer,
  isAdmin
}) => {
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const teamName = slotKey.startsWith('teamA') ? 'Team A' : 'Team B';

  const filteredPlayers = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return players;
    return players.filter(p => 
      p.name.toLowerCase().includes(q) || 
      (p.email && p.email.toLowerCase().includes(q))
    );
  }, [players, search]);

  const handleAssign = async (playerId: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await assignPlayerToSlot(matchId, slotKey, playerId);
      onClose();
    } catch (error: any) {
      console.error("Erreur assignation joueur:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">
              Assigner un joueur
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Terrain {courtNumber} • {teamName}
            </p>
          </div>
        </div>

        {/* Quick Assign Self for logged-in user */}
        {currentPlayer && (
          <div className="mb-4">
            <button
              onClick={() => handleAssign(currentPlayer.id)}
              disabled={isSubmitting}
              className="w-full p-3.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-2xl flex items-center justify-between text-left transition-all group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {currentPlayer.emoji || '🎾'}
                </div>
                <div>
                  <span className="text-xs font-extrabold text-emerald-950 block">
                    M'inscrire sur ce créneau ({currentPlayer.name})
                  </span>
                  <span className="text-[11px] text-emerald-700 font-medium">
                    Inscription immédiate en 1 clic
                  </span>
                </div>
              </div>
              <Plus className="w-5 h-5 text-emerald-700 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        )}

        {/* Admin or full roster selection */}
        <div>
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un joueur..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          <div className="overflow-y-auto space-y-1.5 max-h-60 pr-1">
            {filteredPlayers.length === 0 ? (
              <p className="text-center py-6 text-xs text-slate-400">
                Aucun joueur trouvé
              </p>
            ) : (
              filteredPlayers.map((player) => (
                <button
                  key={player.id}
                  onClick={() => handleAssign(player.id)}
                  disabled={isSubmitting}
                  className="w-full p-2.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 flex items-center justify-between transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div 
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-slate-800 shrink-0"
                      style={{ backgroundColor: player.avatarColor || '#E0F2FE' }}
                    >
                      {player.emoji || '🎾'}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block leading-tight">
                        {player.name}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {player.dominantHand} • {player.level.split('—')[0].trim()}
                      </span>
                    </div>
                  </div>

                  <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                    Choisir
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
