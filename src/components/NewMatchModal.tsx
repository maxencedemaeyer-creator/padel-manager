import React, { useState } from 'react';
import { ClubSettings, Match, MatchType } from '../types';
import { createEmptyCourt } from '../services/padelService';
import { X, Calendar, Plus, Clock, Euro, Layers } from 'lucide-react';

interface NewMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ClubSettings;
  matchesCount: number;
  onSave: (matchData: Partial<Match>) => Promise<void>;
}

export const NewMatchModal: React.FC<NewMatchModalProps> = ({
  isOpen,
  onClose,
  settings,
  matchesCount,
  onSave
}) => {
  const [matchType, setMatchType] = useState<MatchType>('regular');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(settings.seasonDefaultTime || '19:00');
  const [courtCount, setCourtCount] = useState<number>(2);
  const [pricePerPlayer, setPricePerPlayer] = useState<number>(settings.defaultPricePerPlayer || 12.50);
  const [matchNumber, setMatchNumber] = useState<number>(matchesCount + 1);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const courtNames = settings.courtNames && settings.courtNames.length >= courtCount 
        ? settings.courtNames.slice(0, courtCount) 
        : courtCount === 1 ? ["Terrain 1"] : ["Terrain 1", "Terrain 6"];

      const courts = courtNames.map((name, idx) => createEmptyCourt(`court_${idx + 1}`, name));

      await onSave({
        date,
        time,
        type: matchType,
        matchNumber: matchType === 'regular' ? matchNumber : undefined,
        courtCount,
        pricePerPlayer: Number(pricePerPlayer) || 12.50,
        status: 'upcoming',
        courts,
        notes: notes.trim(),
        createdAt: Date.now()
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
              Calendrier
            </span>
            <h3 className="text-base font-bold text-slate-900 leading-tight">
              Nouveau Match de Padel
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
          {/* Match Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
              Type de match
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMatchType('regular')}
                className={`min-h-[44px] py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                  matchType === 'regular'
                    ? 'bg-blue-50 text-blue-800 border-blue-200 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Match de Saison
              </button>
              <button
                type="button"
                onClick={() => setMatchType('friendly')}
                className={`min-h-[44px] py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                  matchType === 'friendly'
                    ? 'bg-amber-50 text-amber-800 border-amber-200 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Match Amical / Extra
              </button>
            </div>
          </div>

          {/* If regular match, match number */}
          {matchType === 'regular' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Numéro du match
              </label>
              <input
                type="number"
                min="1"
                value={matchNumber}
                onChange={(e) => setMatchNumber(parseInt(e.target.value) || 1)}
                className="w-full px-3.5 py-2.5 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 font-bold min-h-[44px] sm:min-h-[38px]"
              />
            </div>
          )}

          {/* Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 font-semibold min-h-[44px] sm:min-h-[38px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Heure
              </label>
              <input
                type="text"
                required
                placeholder="19:00"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3.5 py-2.5 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 font-semibold min-h-[44px] sm:min-h-[38px]"
              />
            </div>
          </div>

          {/* Courts Count & Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Nombre de terrains
              </label>
              <select
                value={courtCount}
                onChange={(e) => setCourtCount(parseInt(e.target.value) || 2)}
                className="w-full px-3.5 py-2.5 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 font-semibold min-h-[44px] sm:min-h-[38px]"
              >
                <option value={1}>1 terrain (4 joueurs)</option>
                <option value={2}>2 terrains (8 joueurs)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Prix par joueur (€)
              </label>
              <input
                type="number"
                step="0.10"
                min="0"
                value={pricePerPlayer}
                onChange={(e) => setPricePerPlayer(parseFloat(e.target.value) || 12.50)}
                className="w-full px-3.5 py-2.5 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 font-bold min-h-[44px] sm:min-h-[38px]"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Notes (Optionnel)
            </label>
            <input
              type="text"
              placeholder="Ex: Pensez à ramener des balles neuves !"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 min-h-[44px] sm:min-h-[38px]"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-colors min-h-[44px]"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white text-xs font-bold rounded-xl shadow-sm disabled:opacity-50 transition-all min-h-[44px]"
            >
              {isSaving ? 'Création...' : 'Créer le match'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
