import React, { useState } from 'react';
import { Match, Player, CourtSlot, ClubSettings, MatchCourt } from '../types';
import { PadelCourt } from './PadelCourt';
import { 
  Calendar, 
  Plus, 
  Filter, 
  ChevronRight, 
  CheckCircle, 
  Clock, 
  CalendarPlus, 
  Trash2, 
  Edit3, 
  Layers,
  ChevronDown,
  Sparkles
} from 'lucide-react';

interface MatchesProps {
  matches: Match[];
  players: Player[];
  settings: ClubSettings;
  selectedMatch: Match | null;
  onSelectMatch: (match: Match | null) => void;
  onSlotClick: (match: Match, courtId: string, slot: CourtSlot) => void;
  onQuickTogglePayment: (match: Match, courtId: string, slot: CourtSlot, e: React.MouseEvent) => void;
  onSaveMatch: (matchData: Partial<Match>) => Promise<void>;
  onDeleteMatch: (matchId: string) => Promise<void>;
  onOpenNewMatchModal: () => void;
}

export const Matches: React.FC<MatchesProps> = ({
  matches,
  players,
  settings,
  selectedMatch,
  onSelectMatch,
  onSlotClick,
  onQuickTogglePayment,
  onSaveMatch,
  onDeleteMatch,
  onOpenNewMatchModal
}) => {
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed' | 'has_free_slots'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const getMatchFill = (m: Match) => {
    let total = 0;
    let assigned = 0;
    m.courts.forEach(c => {
      total += c.slots.length;
      assigned += c.slots.filter(s => s.playerId !== null).length;
    });
    return { assigned, total, isFull: assigned === total && total > 0 };
  };

  const filteredMatches = matches.filter(m => {
    const { assigned, total, isFull } = getMatchFill(m);

    if (filter === 'upcoming' && m.status === 'completed') return false;
    if (filter === 'completed' && m.status !== 'completed') return false;
    if (filter === 'has_free_slots' && isFull) return false;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const numMatch = `match #${m.matchNumber}`.toLowerCase().includes(query);
      const dateMatch = m.date.toLowerCase().includes(query);
      const notesMatch = (m.notes || '').toLowerCase().includes(query);
      const hasPlayer = m.courts.some(c => 
        c.slots.some(s => (s.playerName || '').toLowerCase().includes(query))
      );
      return numMatch || dateMatch || notesMatch || hasPlayer;
    }

    return true;
  });

  // Toggle match status completed / upcoming
  const handleToggleStatus = async (m: Match) => {
    const newStatus = m.status === 'completed' ? 'upcoming' : 'completed';
    await onSaveMatch({ ...m, status: newStatus });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Search bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
              Planning de la saison
            </span>
            <span className="text-xs text-slate-400 font-medium">
              {matches.length} match(s) total
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Matchs & Terrains
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenNewMatchModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Créer un Match
          </button>
        </div>
      </div>

      {/* Main Layout: If a match is selected, show detail view + court representation */}
      {selectedMatch ? (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Match Detail Bar */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onSelectMatch(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  ← Retour
                </button>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700">
                      {selectedMatch.type === 'regular' ? `Match #${selectedMatch.matchNumber || ''}` : 'Match Amical'}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      selectedMatch.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {selectedMatch.status === 'completed' ? 'Terminé' : 'À venir'}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 capitalize">
                    {formatDate(selectedMatch.date)} à {selectedMatch.time || '19:00'}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleStatus(selectedMatch)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                    selectedMatch.status === 'completed'
                      ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  {selectedMatch.status === 'completed' ? 'Marquer comme À venir' : 'Marquer comme Terminé'}
                </button>

                <button
                  onClick={() => {
                    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce match ?")) {
                      onDeleteMatch(selectedMatch.id);
                      onSelectMatch(null);
                    }
                  }}
                  className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-100 transition-colors"
                  title="Supprimer ce match"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Price & Courts summary */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-4">
                <span><strong>Tarif :</strong> {selectedMatch.pricePerPlayer.toFixed(2)} € / joueur</span>
                <span><strong>Terrains :</strong> {selectedMatch.courts.map(c => c.courtName).join(', ')}</span>
              </div>
              <div className="text-slate-400">
                {selectedMatch.notes || 'Pas de note spécifique'}
              </div>
            </div>
          </div>

          {/* Interactive Courts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {selectedMatch.courts.map(court => (
              <PadelCourt
                key={court.courtId}
                court={court}
                matchPrice={selectedMatch.pricePerPlayer}
                players={players}
                onSlotClick={(courtId, slot) => onSlotClick(selectedMatch, courtId, slot)}
                onQuickTogglePayment={(courtId, slot, e) => onQuickTogglePayment(selectedMatch, courtId, slot, e)}
              />
            ))}
          </div>
        </div>
      ) : (
        /* Match Schedule List */
        <div className="space-y-4">
          {/* Filters & Search */}
          <div className="bg-white p-3 sm:p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              <button
                onClick={() => setFilter('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  filter === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Tous ({matches.length})
              </button>
              <button
                onClick={() => setFilter('upcoming')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  filter === 'upcoming'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                À venir
              </button>
              <button
                onClick={() => setFilter('has_free_slots')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  filter === 'has_free_slots'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Places libres
              </button>
              <button
                onClick={() => setFilter('completed')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  filter === 'completed'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Terminés
              </button>
            </div>

            {/* Search */}
            <div className="w-full sm:w-64">
              <input
                type="text"
                placeholder="Rechercher (date, joueur, #...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
              />
            </div>
          </div>

          {/* List of Matches Cards */}
          {filteredMatches.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-slate-100 shadow-sm space-y-3">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-600">
                Aucun match ne correspond aux filtres.
              </p>
              <button
                onClick={() => { setFilter('all'); setSearchQuery(''); }}
                className="text-xs text-blue-600 font-bold hover:underline"
              >
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMatches.map(match => {
                const { assigned, total, isFull } = getMatchFill(match);
                const isCompleted = match.status === 'completed';

                return (
                  <div
                    key={match.id}
                    onClick={() => onSelectMatch(match)}
                    className="bg-white p-5 rounded-3xl border border-slate-100 hover:border-slate-300 hover:shadow-md transition-all cursor-pointer select-none space-y-3 group shadow-sm"
                  >
                    {/* Top match row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700">
                          {match.type === 'regular' ? `Match #${match.matchNumber || ''}` : 'Amical'}
                        </span>
                        <span className="text-xs font-medium text-slate-400">
                          {match.time || '19:00'}
                        </span>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          isFull
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {assigned}/{total} places
                      </span>
                    </div>

                    {/* Date */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 capitalize group-hover:text-blue-600 transition-colors">
                        {formatDate(match.date)}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {match.courts.length} terrain(s) • {match.pricePerPlayer.toFixed(2)} €/joueur
                      </p>
                    </div>

                    {/* Mini Player Avatars Row */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div className="flex items-center -space-x-1.5 overflow-hidden">
                        {match.courts.flatMap(c => c.slots).slice(0, 8).map((slot, idx) => (
                          <div
                            key={idx}
                            className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold ${
                              slot.playerId
                                ? 'bg-blue-50 text-blue-800'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                            title={slot.playerName || 'Place libre'}
                          >
                            {slot.playerName ? slot.playerName.slice(0, 1) : '+'}
                          </div>
                        ))}
                      </div>

                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all">
                        Détails
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
