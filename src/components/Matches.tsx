import React, { useState, useMemo } from 'react';
import { Match, Player, ClubSettings } from '../types';
import { PadelCourt } from './PadelCourt';
import { AssignPlayerModal } from './AssignPlayerModal';
import { saveMatch, deleteMatch, removePlayerFromMatch } from '../services/padelService';
import { 
  Calendar, 
  Plus, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  Edit3, 
  X, 
  Loader2, 
  CheckCircle2, 
  Clock 
} from 'lucide-react';

interface MatchesProps {
  matches: Match[];
  players: Player[];
  settings: ClubSettings;
  isAdmin: boolean;
  isGuest: boolean;
  currentPlayer: Player | null;
}

export const Matches: React.FC<MatchesProps> = ({
  matches,
  players,
  settings,
  isAdmin,
  isGuest,
  currentPlayer
}) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'scheduled' | 'completed'>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [search, setSearch] = useState('');

  const [assignModalData, setAssignModalData] = useState<{
    matchId: string;
    slotKey: 'teamA_player1' | 'teamA_player2' | 'teamB_player1' | 'teamB_player2';
    courtNumber: number;
  } | null>(null);

  // New / Edit Match Modal (Admin)
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formTime, setFormTime] = useState('20:00');
  const [formCourt, setFormCourt] = useState<number>(1);
  const [formNotes, setFormNotes] = useState('');
  const [isSubmittingMatch, setIsSubmittingMatch] = useState(false);

  const matchFee = settings.matchFeePerPlayer || 10;

  // Group matches by date
  const dateGroups = useMemo(() => {
    const map = new Map<string, Match[]>();

    let filtered = [...matches];
    if (filterStatus !== 'all') {
      filtered = filtered.filter(m => m.status === filterStatus);
    }
    if (selectedDate) {
      filtered = filtered.filter(m => m.date === selectedDate);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      filtered = filtered.filter(m => {
        const p1 = players.find(p => p.id === m.teamA.player1Id)?.name.toLowerCase() || '';
        const p2 = players.find(p => p.id === m.teamA.player2Id)?.name.toLowerCase() || '';
        const p3 = players.find(p => p.id === m.teamB.player1Id)?.name.toLowerCase() || '';
        const p4 = players.find(p => p.id === m.teamB.player2Id)?.name.toLowerCase() || '';
        return p1.includes(q) || p2.includes(q) || p3.includes(q) || p4.includes(q) || m.date.includes(q);
      });
    }

    filtered.forEach(m => {
      const existing = map.get(m.date) || [];
      existing.push(m);
      map.set(m.date, existing);
    });

    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [matches, filterStatus, selectedDate, search, players]);

  const handleOpenAdd = () => {
    setEditingMatch(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormTime('20:00');
    setFormCourt(1);
    setFormNotes('');
    setIsMatchModalOpen(true);
  };

  const handleOpenEdit = (m: Match) => {
    setEditingMatch(m);
    setFormDate(m.date);
    setFormTime(m.time || '20:00');
    setFormCourt(m.courtNumber);
    setFormNotes(m.notes || '');
    setIsMatchModalOpen(true);
  };

  const handleSaveMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingMatch) return;

    setIsSubmittingMatch(true);
    try {
      await saveMatch({
        id: editingMatch ? editingMatch.id : undefined,
        date: formDate,
        time: formTime,
        courtNumber: formCourt,
        notes: formNotes.trim()
      });
      setIsMatchModalOpen(false);
    } catch (err) {
      console.error("Erreur enregistrement match:", err);
    } finally {
      setIsSubmittingMatch(false);
    }
  };

  const handleDeleteMatch = async (matchId: string, date: string, court: number) => {
    if (!confirm(`Supprimer le match du ${date} (Terrain ${court}) ?`)) return;
    try {
      await deleteMatch(matchId);
    } catch (err) {
      console.error("Erreur suppression match:", err);
    }
  };

  const handleSlotClick = (matchId: string, slotKey: 'teamA_player1' | 'teamA_player2' | 'teamB_player1' | 'teamB_player2') => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;
    setAssignModalData({
      matchId,
      slotKey,
      courtNumber: match.courtNumber
    });
  };

  const handleRemovePlayer = async (matchId: string, playerId: string) => {
    try {
      await removePlayerFromMatch(matchId, playerId);
    } catch (err) {
      console.error("Erreur retrait joueur:", err);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700">
              Saison 2026/27
            </span>
            <span className="text-xs text-slate-400 font-semibold">
              {matches.length} séance(s) enregistrée(s)
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Planning & Historique des Matchs
          </h2>
        </div>

        {isAdmin && (
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 active:scale-98 w-fit"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter un Match Ponctuel</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par joueur ou date..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl text-xs font-bold">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-xl transition-all ${filterStatus === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Tous
            </button>
            <button
              onClick={() => setFilterStatus('scheduled')}
              className={`px-3 py-1.5 rounded-xl transition-all ${filterStatus === 'scheduled' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              À venir
            </button>
            <button
              onClick={() => setFilterStatus('completed')}
              className={`px-3 py-1.5 rounded-xl transition-all ${filterStatus === 'completed' ? 'bg-white text-blue-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Terminés
            </button>
          </div>

          {selectedDate && (
            <button
              onClick={() => setSelectedDate('')}
              className="text-xs text-rose-600 font-bold bg-rose-50 px-3 py-1.5 rounded-xl hover:bg-rose-100 transition-colors"
            >
              Effacer filtre date
            </button>
          )}
        </div>
      </div>

      {/* Matches List Grouped by Date */}
      {dateGroups.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200 p-8 shadow-xs">
          <Calendar className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-800">Aucun match trouvé</p>
          <p className="text-xs text-slate-500 mt-1">
            Modifiez vos filtres ou générez la saison dans les Paramètres.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {dateGroups.map(([dateStr, dayMatches]) => {
            const formattedDate = new Date(dateStr).toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            });

            return (
              <div key={dateStr} className="space-y-4">
                {/* Date Header */}
                <div className="flex items-center gap-3">
                  <div className="h-px bg-slate-200 flex-1" />
                  <div className="flex items-center gap-2 bg-slate-900 text-white px-4 py-1.5 rounded-full text-xs font-black shadow-xs">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="capitalize">{formattedDate}</span>
                  </div>
                  <div className="h-px bg-slate-200 flex-1" />
                </div>

                {/* Courts Grid for this date */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {dayMatches.map((match) => (
                    <div key={match.id} className="relative">
                      {isAdmin && (
                        <div className="absolute top-3.5 right-12 z-20 flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(match)}
                            className="p-1 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
                            title="Modifier date / heure"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteMatch(match.id, match.date, match.courtNumber)}
                            className="p-1 text-white/70 hover:text-rose-400 hover:bg-rose-500/20 rounded-lg transition-colors"
                            title="Supprimer ce match"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <PadelCourt
                        match={match}
                        players={players}
                        matchFee={matchFee}
                        isAdmin={isAdmin}
                        isGuest={isGuest}
                        currentPlayerId={currentPlayer?.id || null}
                        onSlotClick={handleSlotClick}
                        onRemovePlayer={handleRemovePlayer}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assign Player Modal */}
      {assignModalData && (
        <AssignPlayerModal
          isOpen={true}
          onClose={() => setAssignModalData(null)}
          matchId={assignModalData.matchId}
          slotKey={assignModalData.slotKey}
          courtNumber={assignModalData.courtNumber}
          players={players}
          currentPlayer={currentPlayer}
          isAdmin={isAdmin}
        />
      )}

      {/* Admin Add / Edit Match Modal */}
      {isMatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsMatchModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-purple-50 text-purple-700 rounded-2xl flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {editingMatch ? 'Modifier le match' : 'Ajouter un match ponctuel'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Planification manuelle d'un créneau
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveMatch} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Heure</label>
                  <input
                    type="time"
                    required
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Terrain</label>
                  <select
                    value={formCourt}
                    onChange={(e) => setFormCourt(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value={1}>Terrain 1</option>
                    <option value={2}>Terrain 2</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Description (optionnel)</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ex: Match amical du mercredi"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMatchModalOpen(false)}
                  className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 text-xs font-bold rounded-2xl hover:bg-slate-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingMatch}
                  className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmittingMatch ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Enregistrer
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
