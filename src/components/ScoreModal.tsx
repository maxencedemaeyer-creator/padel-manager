import React, { useState } from 'react';
import { Match, Player, MatchScore, MatchType } from '../types';
import { saveMatchScore } from '../services/padelService';
import { Trophy, X, Loader2, CheckCircle2, RotateCcw } from 'lucide-react';

interface ScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: Match;
  players: Player[];
}

export const ScoreModal: React.FC<ScoreModalProps> = ({
  isOpen,
  onClose,
  match,
  players
}) => {
  const [set1A, setSet1A] = useState<string>(match.score?.set1?.teamA !== null && match.score?.set1?.teamA !== undefined ? String(match.score.set1.teamA) : '');
  const [set1B, setSet1B] = useState<string>(match.score?.set1?.teamB !== null && match.score?.set1?.teamB !== undefined ? String(match.score.set1.teamB) : '');

  const [set2A, setSet2A] = useState<string>(match.score?.set2?.teamA !== null && match.score?.set2?.teamA !== undefined ? String(match.score.set2.teamA) : '');
  const [set2B, setSet2B] = useState<string>(match.score?.set2?.teamB !== null && match.score?.set2?.teamB !== undefined ? String(match.score.set2.teamB) : '');

  const [set3A, setSet3A] = useState<string>(match.score?.set3?.teamA !== null && match.score?.set3?.teamA !== undefined ? String(match.score.set3.teamA) : '');
  const [set3B, setSet3B] = useState<string>(match.score?.set3?.teamB !== null && match.score?.set3?.teamB !== undefined ? String(match.score.set3.teamB) : '');

  const [matchType, setMatchType] = useState<MatchType>(match.matchType || 'official');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const getPlayerName = (id: string) => {
    if (!id) return 'Inconnu';
    const p = players.find(x => x.id === id);
    return p ? p.name : 'Inconnu';
  };

  const teamANames = `${getPlayerName(match.teamA.player1Id)} & ${getPlayerName(match.teamA.player2Id)}`;
  const teamBNames = `${getPlayerName(match.teamB.player1Id)} & ${getPlayerName(match.teamB.player2Id)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const score: MatchScore = {
        set1: {
          teamA: set1A !== '' ? Number(set1A) : null,
          teamB: set1B !== '' ? Number(set1B) : null
        },
        set2: {
          teamA: set2A !== '' ? Number(set2A) : null,
          teamB: set2B !== '' ? Number(set2B) : null
        },
        set3: {
          teamA: set3A !== '' ? Number(set3A) : null,
          teamB: set3B !== '' ? Number(set3B) : null
        }
      };

      await saveMatchScore(match.id, score, 'completed', matchType);
      onClose();
    } catch (error: any) {
      console.error("Erreur lors de l'enregistrement du score:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetScore = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await saveMatchScore(match.id, {
        set1: { teamA: null, teamB: null },
        set2: { teamA: null, teamB: null },
        set3: { teamA: null, teamB: null }
      }, 'scheduled', matchType);
      onClose();
    } catch (error: any) {
      console.error("Erreur réinitialisation score:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">
              Saisie du score — Terrain {match.courtNumber}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Match du {match.date} à {match.time || '20:00'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Match Type Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Type de match
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'official', label: '🏆 Officiel' },
                { id: 'friendly', label: '🤝 Amical' },
                { id: 'rotating', label: '🔄 Tournante' }
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMatchType(t.id as MatchType)}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all ${
                    matchType === t.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Teams Header */}
          <div className="grid grid-cols-5 gap-2 items-center bg-slate-50 p-3 rounded-2xl border border-slate-200/80 text-xs">
            <div className="col-span-2 font-bold text-blue-700 truncate">
              Team A: {teamANames}
            </div>
            <div className="text-center font-extrabold text-slate-400">VS</div>
            <div className="col-span-2 font-bold text-rose-700 truncate text-right">
              Team B: {teamBNames}
            </div>
          </div>

          {/* Sets Input */}
          <div className="space-y-3">
            {/* Set 1 */}
            <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-700 w-16">Set 1</span>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="7"
                  value={set1A}
                  onChange={(e) => setSet1A(e.target.value)}
                  placeholder="0"
                  className="w-12 h-11 text-center font-bold text-base bg-blue-50 border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-blue-900"
                />
                <span className="font-bold text-slate-400">-</span>
                <input
                  type="number"
                  min="0"
                  max="7"
                  value={set1B}
                  onChange={(e) => setSet1B(e.target.value)}
                  placeholder="0"
                  className="w-12 h-11 text-center font-bold text-base bg-rose-50 border border-rose-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 text-rose-900"
                />
              </div>
            </div>

            {/* Set 2 */}
            <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-700 w-16">Set 2</span>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="7"
                  value={set2A}
                  onChange={(e) => setSet2A(e.target.value)}
                  placeholder="0"
                  className="w-12 h-11 text-center font-bold text-base bg-blue-50 border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-blue-900"
                />
                <span className="font-bold text-slate-400">-</span>
                <input
                  type="number"
                  min="0"
                  max="7"
                  value={set2B}
                  onChange={(e) => setSet2B(e.target.value)}
                  placeholder="0"
                  className="w-12 h-11 text-center font-bold text-base bg-rose-50 border border-rose-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 text-rose-900"
                />
              </div>
            </div>

            {/* Set 3 */}
            <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold text-slate-700 w-16">Set 3 (optionnel)</span>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="15"
                  value={set3A}
                  onChange={(e) => setSet3A(e.target.value)}
                  placeholder="-"
                  className="w-12 h-11 text-center font-bold text-base bg-blue-50 border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-blue-900"
                />
                <span className="font-bold text-slate-400">-</span>
                <input
                  type="number"
                  min="0"
                  max="15"
                  value={set3B}
                  onChange={(e) => setSet3B(e.target.value)}
                  placeholder="-"
                  className="w-12 h-11 text-center font-bold text-base bg-rose-50 border border-rose-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 text-rose-900"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            {match.status === 'completed' && (
              <button
                type="button"
                onClick={handleResetScore}
                disabled={isSubmitting}
                className="py-3 px-3 bg-slate-100 text-slate-600 text-xs font-bold rounded-2xl hover:bg-slate-200 transition-colors flex items-center gap-1"
                title="Repasser en statut programmé"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Réinitialiser
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 text-xs font-bold rounded-2xl hover:bg-slate-200 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Enregistrer le score
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
