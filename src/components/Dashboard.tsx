import React, { useMemo, useState, useEffect } from 'react';
import { Match, Player, ClubSettings } from '../types';
import { PadelCourt } from './PadelCourt';
import { AssignPlayerModal } from './AssignPlayerModal';
import { removePlayerFromMatch } from '../services/padelService';
import { ScoreModal } from './ScoreModal';
import { 
  Calendar, 
  Clock, 
  Trophy, 
  ArrowRight, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  TrendingUp, 
  Users,
  ChevronRight,
  Zap
} from 'lucide-react';

interface DashboardProps {
  matches: Match[];
  players: Player[];
  settings: ClubSettings;
  isAdmin: boolean;
  isGuest: boolean;
  currentPlayer: Player | null;
  onNavigateToMatches: () => void;
  onNavigateToFinances: () => void;
  onNavigateToPlayers: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  matches,
  players,
  settings,
  isAdmin,
  isGuest,
  currentPlayer,
  onNavigateToMatches,
  onNavigateToFinances,
  onNavigateToPlayers
}) => {
  const [assignModalData, setAssignModalData] = useState<{
    matchId: string;
    slotKey: 'teamA_player1' | 'teamA_player2' | 'teamB_player1' | 'teamB_player2';
    courtNumber: number;
  } | null>(null);

  const [promptScoreMatch, setPromptScoreMatch] = useState<Match | null>(null);

  const matchFee = settings.matchFeePerPlayer || 10;
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Calculate Upcoming Match Date (the closest match date >= today or first upcoming scheduled date)
  const { upcomingDate, upcomingMatches } = useMemo(() => {
    if (matches.length === 0) return { upcomingDate: null, upcomingMatches: [] };

    // Find all scheduled matches
    const scheduled = matches.filter(m => m.status === 'scheduled');
    
    // Find scheduled matches from today onwards
    const fromToday = scheduled.filter(m => m.date >= todayStr);
    const targetDate = fromToday.length > 0 ? fromToday[0].date : (scheduled[0]?.date || matches[0].date);

    // Get both courts for this targetDate
    const matchesOnDate = matches.filter(m => m.date === targetDate);
    // Sort by courtNumber
    matchesOnDate.sort((a, b) => a.courtNumber - b.courtNumber);

    return {
      upcomingDate: targetDate,
      upcomingMatches: matchesOnDate
    };
  }, [matches, todayStr]);

  // 2. Calculate Last Completed Match
  const lastCompletedMatch = useMemo<Match | null>(() => {
    const completed = matches.filter(m => m.status === 'completed' && m.score);
    if (completed.length === 0) return null;
    // Sort newest date first
    completed.sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      if (d !== 0) return d;
      return (b.time || '').localeCompare(a.time || '');
    });
    return completed[0];
  }, [matches]);

  // 3. Automatic End-of-Match Popup Trigger (Section 10)
  // If current time > 21:00 on the day of a 20:00 match with status "scheduled"
  useEffect(() => {
    if (isGuest) return;
    const now = new Date();
    const currentHours = now.getHours();
    const currentDateStr = now.toISOString().split('T')[0];

    // Find scheduled matches for today where time <= current time or past 21:00
    const todayScheduled = matches.filter(m => m.date === currentDateStr && m.status === 'scheduled');
    
    if (todayScheduled.length > 0 && currentHours >= 21) {
      // Find match relevant to the current user or admin
      const userMatch = todayScheduled.find(m => {
        if (isAdmin) return true;
        if (!currentPlayer) return false;
        return (
          m.teamA.player1Id === currentPlayer.id ||
          m.teamA.player2Id === currentPlayer.id ||
          m.teamB.player1Id === currentPlayer.id ||
          m.teamB.player2Id === currentPlayer.id
        );
      });

      if (userMatch) {
        setPromptScoreMatch(userMatch);
      }
    }
  }, [matches, isAdmin, isGuest, currentPlayer]);

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

  const getPlayerName = (id: string | undefined) => {
    if (!id) return 'Inconnu';
    const p = players.find(x => x.id === id);
    return p ? p.name : 'Inconnu';
  };

  return (
    <div className="space-y-6 pb-12">
      {/* SECTION 1: PROCHAIN MATCH */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Prochain Match
              </span>
              {upcomingDate && (
                <span className="text-xs text-slate-500 font-semibold">
                  {new Date(upcomingDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Session du Jeudi • 20h00
            </h2>
          </div>

          <button
            onClick={onNavigateToMatches}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-2xl text-xs font-bold shadow-xs transition-all w-fit"
          >
            <span>Voir l'historique complet des matchs</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* 2 Courts Side-by-Side */}
        {upcomingMatches.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200 mt-5">
            <Calendar className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">Aucun match programmé pour le moment</p>
            {isAdmin && (
              <p className="text-xs text-slate-500 mt-1">
                Rendez-vous dans l'onglet Paramètres pour générer automatiquement la saison.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            {upcomingMatches.map((match) => (
              <PadelCourt
                key={match.id}
                match={match}
                players={players}
                matchFee={matchFee}
                isAdmin={isAdmin}
                isGuest={isGuest}
                currentPlayerId={currentPlayer?.id || null}
                onSlotClick={handleSlotClick}
                onRemovePlayer={handleRemovePlayer}
              />
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: DERNIER RÉSULTAT */}
      {lastCompletedMatch && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Trophy className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                  Dernier Résultat Clôturé
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Match du {lastCompletedMatch.date} • Terrain {lastCompletedMatch.courtNumber}
                </p>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700">
              {lastCompletedMatch.matchType === 'official' ? '🏆 Match Officiel' : (lastCompletedMatch.matchType === 'friendly' ? '🤝 Amical' : '🔄 Tournante')}
            </span>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
            <div className="grid grid-cols-5 gap-3 items-center">
              {/* Team A */}
              <div className="col-span-2">
                <span className="text-[11px] font-extrabold text-blue-800 uppercase tracking-wider block mb-1">
                  Team A
                </span>
                <p className="text-xs font-bold text-slate-900 truncate">
                  {getPlayerName(lastCompletedMatch.teamA.player1Id)}
                </p>
                <p className="text-xs font-bold text-slate-900 truncate">
                  {getPlayerName(lastCompletedMatch.teamA.player2Id)}
                </p>
              </div>

              {/* Score Display */}
              <div className="text-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl shadow-2xs border border-slate-200 text-xs sm:text-sm font-black text-slate-900">
                  <span>{lastCompletedMatch.score?.set1?.teamA ?? '-'} / {lastCompletedMatch.score?.set1?.teamB ?? '-'}</span>
                  {lastCompletedMatch.score?.set2?.teamA !== null && (
                    <span className="text-slate-400">|</span>
                  )}
                  {lastCompletedMatch.score?.set2?.teamA !== null && (
                    <span>{lastCompletedMatch.score?.set2?.teamA} / {lastCompletedMatch.score?.set2?.teamB}</span>
                  )}
                </div>
              </div>

              {/* Team B */}
              <div className="col-span-2 text-right">
                <span className="text-[11px] font-extrabold text-rose-800 uppercase tracking-wider block mb-1">
                  Team B
                </span>
                <p className="text-xs font-bold text-slate-900 truncate">
                  {getPlayerName(lastCompletedMatch.teamB.player1Id)}
                </p>
                <p className="text-xs font-bold text-slate-900 truncate">
                  {getPlayerName(lastCompletedMatch.teamB.player2Id)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK SHORTCUTS & STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Shortcut 1: Joueurs */}
        <button
          onClick={onNavigateToPlayers}
          className="bg-white hover:bg-slate-50 p-4 rounded-3xl border border-slate-200/90 shadow-2xs flex items-center justify-between text-left transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block leading-tight">
                Annuaire & Profils
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                {players.length} joueur(s) inscrits
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900 transition-colors" />
        </button>

        {/* Shortcut 2: Finances */}
        <button
          onClick={onNavigateToFinances}
          className="bg-white hover:bg-slate-50 p-4 rounded-3xl border border-slate-200/90 shadow-2xs flex items-center justify-between text-left transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block leading-tight">
                Comptabilité & Avances
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                Suivi des créances ({matchFee}€ / part)
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900 transition-colors" />
        </button>

        {/* Shortcut 3: Planning */}
        <button
          onClick={onNavigateToMatches}
          className="bg-white hover:bg-slate-50 p-4 rounded-3xl border border-slate-200/90 shadow-2xs flex items-center justify-between text-left transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block leading-tight">
                Planning Saison 2026/27
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                {matches.length} séances au total
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-900 transition-colors" />
        </button>
      </div>

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

      {/* Automatic End of Match Score Prompt Modal */}
      {promptScoreMatch && (
        <ScoreModal
          isOpen={true}
          onClose={() => setPromptScoreMatch(null)}
          match={promptScoreMatch}
          players={players}
        />
      )}
    </div>
  );
};
