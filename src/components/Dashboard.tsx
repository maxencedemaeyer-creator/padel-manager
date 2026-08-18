import React from 'react';
import { Match, Player, ClubSettings, CourtSlot } from '../types';
import { User } from '../firebase';
import { PadelCourt } from './PadelCourt';
import { calculatePlayerDebts, calculateCreditorsSummary } from '../services/padelService';
import { 
  Calendar, 
  Users, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  Plus, 
  Sparkles, 
  CreditCard,
  ChevronRight,
  UserCheck,
  Wallet,
  Coins,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  LogIn
} from 'lucide-react';

interface DashboardProps {
  user: User | null;
  matches: Match[];
  players: Player[];
  settings: ClubSettings;
  isAdmin?: boolean;
  isUser?: boolean;
  isGuest?: boolean;
  currentUserPlayerId?: string | null;
  onSelectTab: (tab: string) => void;
  onSlotClick: (match: Match, courtId: string, slot: CourtSlot) => void;
  onOpenNewMatchModal: () => void;
  onQuickTogglePayment: (match: Match, courtId: string, slot: CourtSlot, e: React.MouseEvent) => void;
  onOpenMatchDetail: (match: Match) => void;
  onOpenAuthModal?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  user,
  matches,
  players,
  settings,
  isAdmin = false,
  isUser = false,
  isGuest = false,
  currentUserPlayerId = null,
  onSelectTab,
  onSlotClick,
  onOpenNewMatchModal,
  onQuickTogglePayment,
  onOpenMatchDetail,
  onOpenAuthModal
}) => {
  // Find next upcoming match (closest date today or in future)
  const upcomingMatches = matches
    .filter(m => m.status !== 'completed')
    .sort((a, b) => a.date.localeCompare(b.date));

  const nextMatch = upcomingMatches.length > 0 ? upcomingMatches[0] : (matches.length > 0 ? matches[0] : null);

  // Completed matches
  const completedMatches = matches.filter(m => m.status === 'completed').length;
  
  // Total pending uncollected debts across all matches
  let totalPendingDebt = 0;
  let totalPendingSlots = 0;
  matches.forEach(m => {
    m.courts.forEach(c => {
      c.slots.forEach(s => {
        if (s.playerId) {
          const p = players.find(x => x.id === s.playerId);
          if (p?.role !== 'creditor' && s.paymentStatus === 'pending') {
            totalPendingDebt += m.pricePerPlayer || 12.5;
            totalPendingSlots += 1;
          }
        }
      });
    });
  });

  // Creditors total advances
  const creditors = players.filter(p => p.role === 'creditor');
  const totalAdvances = creditors.reduce((sum, c) => sum + (Number(c.advanceAmount) || 0), 0);

  // Next match slots status
  let nextMatchAssignedCount = 0;
  let nextMatchTotalSlots = 0;
  if (nextMatch) {
    nextMatch.courts.forEach(c => {
      nextMatchTotalSlots += c.slots.length;
      nextMatchAssignedCount += c.slots.filter(s => s.playerId !== null).length;
    });
  }

  // Linked current user in Firestore players
  const currentPlayer = players.find(p => 
    (user?.uid && (p.linkedUid === user.uid || p.authUid === user.uid)) ||
    (user?.email && (
      (p.linkedEmail && p.linkedEmail.toLowerCase() === user.email.toLowerCase()) ||
      (p.authEmail && p.authEmail.toLowerCase() === user.email.toLowerCase()) ||
      (p.email && p.email.toLowerCase() === user.email.toLowerCase())
    ))
  );

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const getCreditorName = (creditorId: string | null) => {
    if (!creditorId) return 'Créancier du club';
    const c = creditors.find(cr => cr.id === creditorId);
    return c ? c.name : 'Créancier';
  };

  // Render "Mon Statut" Block
  const renderMyStatusSection = () => {
    if (!user || !currentPlayer) {
      return (
        <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 rounded-3xl border border-blue-100 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white text-blue-600 border border-blue-200/80 flex items-center justify-center font-bold shrink-0 shadow-2xs">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  Espace Personnel
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                  Mon Statut
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
                {user ? 'Associez votre compte à votre profil joueur' : 'Connectez-vous pour voir votre statut'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Suivez en temps réel vos présences aux matchs, vos dettes à régler ou vos remboursements de trésorerie.
              </p>
            </div>
          </div>

          <button
            onClick={onOpenAuthModal}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-2xl text-xs sm:text-sm font-bold shadow-sm transition-all shrink-0 min-h-[44px]"
          >
            {user ? <Sparkles className="w-4 h-4 text-amber-300" /> : <LogIn className="w-4 h-4" />}
            <span>{user ? 'Lier mon profil joueur' : 'Se connecter'}</span>
          </button>
        </div>
      );
    }

    // CASE B: Creditor Status
    if (currentPlayer.role === 'creditor') {
      const creditorSummaries = calculateCreditorsSummary([currentPlayer], matches);
      const summary = creditorSummaries[0] || {
        creditor: currentPlayer,
        initialAdvance: Number(currentPlayer.advanceAmount) || 0,
        matchesPlayedCount: 0,
        consumedByOwnMatches: 0,
        reimbursementsReceived: 0,
        remainingToReimburse: Number(currentPlayer.advanceAmount) || 0,
        progressPercentage: 0
      };

      return (
        <div className="bg-white rounded-3xl border border-purple-100 shadow-sm p-5 sm:p-7 space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-purple-50">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shadow-2xs text-purple-900 border border-purple-200"
                style={{ backgroundColor: currentPlayer.avatarColor || '#F3E8FF' }}
              >
                {currentPlayer.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-700">
                    Mon Statut
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                    👑 Créancier
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  {currentPlayer.name} — Suivi de Trésorerie
                </h3>
              </div>
            </div>

            <button
              onClick={() => onSelectTab('finances')}
              className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:text-purple-900 self-start sm:self-auto"
            >
              <span>Grand livre des finances</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 4 Trésorerie KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Initial Advance */}
            <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-100">
              <div className="flex items-center gap-1.5 text-xs text-purple-800 font-semibold mb-1">
                <Wallet className="w-3.5 h-3.5" />
                <span>Avance Initiale</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-purple-950">
                {summary.initialAdvance.toFixed(2)} €
              </p>
              <p className="text-[11px] text-purple-600 mt-0.5">Avance de départ au club</p>
            </div>

            {/* Consumed by own matches */}
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-100">
              <div className="flex items-center gap-1.5 text-xs text-amber-800 font-semibold mb-1">
                <TrendingDown className="w-3.5 h-3.5" />
                <span>Montant Consommé</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-amber-900">
                -{summary.consumedByOwnMatches.toFixed(2)} €
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                {summary.matchesPlayedCount} match(s) joué(s)
              </p>
            </div>

            {/* Total reimbursed so far */}
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100">
              <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-semibold mb-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Total Perçu</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-emerald-800">
                +{summary.reimbursementsReceived.toFixed(2)} €
              </p>
              <p className="text-[11px] text-emerald-600 mt-0.5">Remboursé par les joueurs</p>
            </div>

            {/* Remaining to reimburse */}
            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-100">
              <div className="flex items-center gap-1.5 text-xs text-blue-800 font-semibold mb-1">
                <Coins className="w-3.5 h-3.5" />
                <span>Solde à Percevoir</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-blue-900">
                {summary.remainingToReimburse.toFixed(2)} €
              </p>
              <p className="text-[11px] text-blue-600 mt-0.5">Reste à vous rembourser</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Progression de récupération de l'avance</span>
                <span className="text-purple-700 font-bold">{summary.progressPercentage.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-600 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(0, summary.progressPercentage))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    // CASE A: Standard Player Status
    const playerDebts = calculatePlayerDebts([currentPlayer], matches);
    const debtSummary = playerDebts[0] || {
      player: currentPlayer,
      totalUnpaidAmount: 0,
      unpaidMatchesCount: 0,
      paidMatchesCount: 0,
      matchesDetails: []
    };

    const isAllPaid = debtSummary.totalUnpaidAmount === 0;

    return (
      <div className={`rounded-3xl border shadow-sm p-5 sm:p-7 space-y-4 ${
        isAllPaid 
          ? 'bg-emerald-50/60 border-emerald-200/90' 
          : 'bg-amber-50/70 border-amber-200/90'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/60">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shadow-2xs text-slate-800 border border-slate-200/80"
              style={{ backgroundColor: currentPlayer.avatarColor || '#DBEAFE' }}
            >
              {currentPlayer.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Mon Statut
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-700 border border-slate-200">
                  Joueur
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                Bonjour, {currentPlayer.name}
              </h3>
            </div>
          </div>

          <div>
            {isAllPaid ? (
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Tout est à jour ! 🎉
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Montant total dû : {debtSummary.totalUnpaidAmount.toFixed(2)} €
              </span>
            )}
          </div>
        </div>

        {/* Status Content */}
        {isAllPaid ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/80 backdrop-blur-xs p-4 rounded-2xl border border-emerald-100">
            <div className="text-xs sm:text-sm text-slate-600">
              <strong className="text-emerald-800">Aucun paiement en attente.</strong> Toutes vos participations aux matchs ({debtSummary.paidMatchesCount} match{debtSummary.paidMatchesCount > 1 ? 's' : ''}) sont entièrement réglées.
            </div>
            <button
              onClick={() => onSelectTab('matches')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900 shrink-0"
            >
              <span>Voir les prochains matchs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-amber-900">
              <span>Matchs en attente de règlement ({debtSummary.unpaidMatchesCount})</span>
              <span className="text-slate-500 font-normal">
                À régler aux créanciers du club
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {debtSummary.matchesDetails
                .filter(m => m.paymentStatus === 'pending')
                .map((m, idx) => (
                  <div
                    key={`${m.matchId}-${idx}`}
                    className="p-3.5 bg-white rounded-2xl border border-amber-200/80 shadow-2xs flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Match du {new Date(m.matchDate).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        {m.courtName} • {m.price.toFixed(2)} €
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 block mb-1">
                        À régler
                      </span>
                      <span className="text-[10px] text-slate-500 block font-medium">
                        {creditors.length > 0 ? `À ${creditors.map(c => c.name).join(' ou ')}` : 'Au créancier'}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner / Welcome & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
              Saison Active
            </span>
            <span className="text-xs text-slate-400 font-medium">
              {completedMatches}/{settings.seasonMatchesCount || 44} matchs joués
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Tableau de bord
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Gestion des terrains, assignations et comptabilité du club en temps réel.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              id="btn-new-match-dash"
              onClick={onOpenNewMatchModal}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-slate-200 transition-all min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              Nouveau Match
            </button>
          </div>
        )}
      </div>

      {/* DYNAMIC SECTION: MON STATUT */}
      {renderMyStatusSection()}

      {/* KPI Cards Grid (Clean Utility Minimal - No Taux de Remplissage) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Next Match Status */}
        <div 
          onClick={() => nextMatch && onOpenMatchDetail(nextMatch)}
          className="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">
              Prochain Match
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 font-bold">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-slate-800">
            {nextMatch ? `${nextMatchAssignedCount}/${nextMatchTotalSlots}` : '0/0'}
          </p>
          <p className="text-xs text-slate-400 font-medium mt-1">
            {nextMatch ? (nextMatchTotalSlots - nextMatchAssignedCount === 0 ? 'Complet' : `${nextMatchTotalSlots - nextMatchAssignedCount} places libres`) : 'Aucun match'}
          </p>
        </div>

        {/* Pending Debts */}
        <div 
          onClick={() => onSelectTab('finances')}
          className="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm hover:border-amber-200 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">
              Dettes globales
            </span>
            <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-600 font-bold">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-amber-600">
            {totalPendingDebt.toFixed(2)} €
          </p>
          <p className="text-xs text-slate-400 font-medium mt-1">
            {totalPendingSlots} présence(s) à encaisser
          </p>
        </div>

        {/* Creditors Advances */}
        <div 
          onClick={() => onSelectTab('finances')}
          className="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm hover:border-purple-200 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">
              Avances Créanciers
            </span>
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 font-bold">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-purple-700">
            {totalAdvances.toFixed(2)} €
          </p>
          <p className="text-xs text-slate-400 font-medium mt-1">
            {creditors.length} créancier(s) actifs
          </p>
        </div>

        {/* Players Registered */}
        <div 
          onClick={() => onSelectTab('players')}
          className="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm hover:border-emerald-200 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">
              Membres du Club
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-slate-800">
            {players.length}
          </p>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Joueurs & Créanciers inscrits
          </p>
        </div>
      </div>

      {/* HIGHLIGHT: PROCHAIN MATCH AVEC TERRAINS INTERACTIFS */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 sm:p-7 space-y-5">
        {nextMatch ? (
          <>
            {/* Header of Next Match */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700">
                    {nextMatch.type === 'regular' ? `Match #${nextMatch.matchNumber || 1}` : 'Match Amical'}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {nextMatch.time || '19:00'} • {nextMatch.courtCount} terrain(s) ({nextMatch.pricePerPlayer.toFixed(2)} €/joueur)
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-800 capitalize">
                  {formatDate(nextMatch.date)}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenMatchDetail(nextMatch)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors min-h-[44px]"
                >
                  <span>Détail complet</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Hint message */}
            <div className="flex items-center justify-between text-xs bg-slate-50 px-4 py-2.5 rounded-2xl text-slate-600 border border-slate-100">
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                {isGuest ? (
                  <span><strong>Consultation :</strong> Le tableau des terrains est en lecture seule pour les invités.</span>
                ) : (
                  <span><strong>Assignation 1-clic :</strong> Cliquez sur un emplacement pour assigner un joueur ou régler son statut.</span>
                )}
              </span>
              <span className="text-slate-400 font-medium hidden sm:inline">
                {nextMatchAssignedCount}/{nextMatchTotalSlots} assignés
              </span>
            </div>

            {/* Interactive Courts Grid with 2 distinct team sides */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {nextMatch.courts.map(court => (
                <PadelCourt
                  key={court.courtId}
                  court={court}
                  matchPrice={nextMatch.pricePerPlayer}
                  players={players}
                  readOnly={isGuest}
                  onSlotClick={(courtId, slot) => onSlotClick(nextMatch, courtId, slot)}
                  onQuickTogglePayment={(courtId, slot, e) => onQuickTogglePayment(nextMatch, courtId, slot, e)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-12 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <Calendar className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              Aucun match programmé
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {isGuest 
                ? 'Le calendrier de la saison n\'a pas encore été configuré par les administrateurs.' 
                : 'Générez le calendrier complet des 44 matchs de la saison ou ajoutez un match personnalisé.'}
            </p>
            {!isGuest && (
              <button
                onClick={() => onSelectTab('settings')}
                className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-slate-800 min-h-[44px]"
              >
                Générer la saison dans les Paramètres
              </button>
            )}
          </div>
        )}
      </div>

      {/* Quick Upcoming Matches Preview Grid */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 sm:p-7 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              Matchs de la Saison
            </h3>
            <p className="text-xs text-slate-400">Aperçu rapide du planning</p>
          </div>
          <button
            onClick={() => onSelectTab('matches')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 min-h-[44px]"
          >
            <span>Voir tout ({matches.length})</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {matches.slice(0, 6).map((match) => {
            let assigned = 0;
            let total = 0;
            match.courts.forEach(c => {
              total += c.slots.length;
              assigned += c.slots.filter(s => s.playerId !== null).length;
            });

            const isNext = nextMatch && nextMatch.id === match.id;

            return (
              <div
                key={match.id}
                onClick={() => onOpenMatchDetail(match)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                  isNext
                    ? 'bg-blue-50/40 border-blue-200 shadow-2xs'
                    : 'bg-white border-slate-100 hover:border-slate-300 shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700">
                    {match.type === 'regular' ? `Match #${match.matchNumber || ''}` : 'Amical'}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      assigned === total
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {assigned}/{total} places
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-800 capitalize truncate">
                  {formatDate(match.date)}
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2.5 pt-2.5 border-t border-slate-100">
                  <span>{match.time || '19:00'} • {match.courtCount} terrain(s)</span>
                  <span className="font-bold text-slate-700">{match.pricePerPlayer.toFixed(2)} €</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
