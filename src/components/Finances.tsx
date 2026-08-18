import React, { useState } from 'react';
import { Player, Match, ClubSettings, SlotPosition } from '../types';
import { calculateCreditorsSummary, calculatePlayerDebts } from '../services/padelService';
import { 
  Wallet, 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ArrowRight, 
  Share2, 
  Copy, 
  Check, 
  DollarSign,
  UserCheck,
  ChevronDown,
  ShieldCheck,
  Sparkles,
  CreditCard
} from 'lucide-react';

interface FinancesProps {
  players: Player[];
  matches: Match[];
  settings: ClubSettings;
  isAdmin?: boolean;
  isUser?: boolean;
  isGuest?: boolean;
  currentUserPlayerId?: string | null;
  onSettleDebt: (
    matchId: string,
    courtId: string,
    position: SlotPosition,
    paidToCreditorId: string
  ) => Promise<void>;
}

export const Finances: React.FC<FinancesProps> = ({
  players,
  matches,
  settings,
  isAdmin = false,
  isUser = false,
  isGuest = false,
  currentUserPlayerId = null,
  onSettleDebt
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'creditors' | 'debts' | 'summary'>('creditors');
  const [copied, setCopied] = useState(false);
  const [selectedCreditorForSettlement, setSelectedCreditorForSettlement] = useState<string>('');
  const [settlingKey, setSettlingKey] = useState<string | null>(null);

  const isCurrentUserCreditor = players.some(p => p.id === currentUserPlayerId && p.role === 'creditor');
  const canSettle = isAdmin || isCurrentUserCreditor;

  const creditors = players.filter(p => p.role === 'creditor');
  const creditorSummaries = calculateCreditorsSummary(creditors, matches);
  const playerDebts = calculatePlayerDebts(players, matches);

  // Total finances
  const totalAdvances = creditorSummaries.reduce((sum, c) => sum + c.initialAdvance, 0);
  const totalConsumedByCreditors = creditorSummaries.reduce((sum, c) => sum + c.consumedByOwnMatches, 0);
  const totalReimbursedByPlayers = creditorSummaries.reduce((sum, c) => sum + c.reimbursementsReceived, 0);
  const totalRemainingToReimburse = creditorSummaries.reduce((sum, c) => sum + c.remainingToReimburse, 0);
  const totalGlobalPendingDebts = playerDebts.reduce((sum, p) => sum + p.totalUnpaidAmount, 0);

  // Default creditor for settlement
  const defaultCreditorId = creditors.length > 0 ? (selectedCreditorForSettlement || creditors[0].id) : '';

  const handleQuickSettle = async (
    matchId: string,
    courtId: string,
    position: SlotPosition,
    creditorIdToPay: string
  ) => {
    const key = `${matchId}_${courtId}_${position}`;
    setSettlingKey(key);
    try {
      await onSettleDebt(matchId, courtId, position, creditorIdToPay);
    } catch (err: any) {
      console.error("Erreur règlement:", err);
      alert("Erreur lors de l'enregistrement du règlement : " + (err?.message || err));
    } finally {
      setSettlingKey(null);
    }
  };

  // Generate clean WhatsApp group text
  const generateWhatsAppReport = () => {
    const lines: string[] = [];
    lines.push(`🎾 *BILAN FINANCIER PADEL MANAGER* 🎾`);
    lines.push(`📅 ${new Date().toLocaleDateString('fr-FR')}`);
    lines.push(``);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`💳 *ÉTAT DES CRÉANCIERS (AVANCES)* :`);
    creditorSummaries.forEach(cs => {
      lines.push(`• *${cs.creditor.name}* :`);
      lines.push(`   - Avance initiale : ${cs.initialAdvance.toFixed(2)} €`);
      lines.push(`   - Auto-déduit (${cs.matchesPlayedCount} matchs) : -${cs.consumedByOwnMatches.toFixed(2)} €`);
      lines.push(`   - Reçu des joueurs : -${cs.reimbursementsReceived.toFixed(2)} €`);
      lines.push(`   - 👉 *Reste à percevoir : ${cs.remainingToReimburse.toFixed(2)} €* (${cs.progressPercentage}% remboursé)`);
    });

    lines.push(``);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`⚠️ *DETTES EN ATTENTE DES JOUEURS* :`);
    
    const playersWithDebt = playerDebts.filter(pd => pd.totalUnpaidAmount > 0);
    if (playersWithDebt.length === 0) {
      lines.push(`🎉 Toutes les participations sont à jour ! Aucun impayé.`);
    } else {
      playersWithDebt.forEach(pd => {
        lines.push(`• *${pd.player.name}* : *${pd.totalUnpaidAmount.toFixed(2)} €* (${pd.unpaidMatchesCount} match(s))`);
      });
    }

    lines.push(``);
    lines.push(`👉 *Merci de régler vos participations par virement ou Paylib aux créanciers !*`);
    return lines.join('\n');
  };

  const handleCopyWhatsApp = () => {
    const text = generateWhatsAppReport();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700">
              Comptabilité du club
            </span>
            <span className="text-xs text-slate-400 font-medium">
              Calcul automatique des dettes & avances
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Finances & Remboursements
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyWhatsApp}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-emerald-100 transition-all"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copié pour WhatsApp !
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                Copier Récap WhatsApp
              </>
            )}
          </button>
        </div>
      </div>

      {/* High-level Global Financial Overview Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Avances */}
        <div className="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 block">
              Avances Initiales
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-purple-900">
            {totalAdvances.toFixed(2)} €
          </p>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Engagé par les créanciers
          </p>
        </div>

        {/* Auto-Consommation */}
        <div className="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 block">
              Auto-consommé
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {totalConsumedByCreditors.toFixed(2)} €
          </p>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Matchs joués par les créanciers
          </p>
        </div>

        {/* Remboursé par joueurs */}
        <div className="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 block">
              Remboursements
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-700">
            {totalReimbursedByPlayers.toFixed(2)} €
          </p>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Payés par les joueurs
          </p>
        </div>

        {/* Reste global à percevoir */}
        <div className="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400 block">
              Reste à Percevoir
            </span>
            <div className="w-9 h-9 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-600">
            {totalRemainingToReimburse.toFixed(2)} €
          </p>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Solde net restant dû
          </p>
        </div>
      </div>

      {/* Subtabs Switcher */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl max-w-lg w-full">
        <button
          onClick={() => setActiveSubTab('creditors')}
          className={`flex-1 min-h-[44px] py-2 px-2 text-xs font-bold rounded-xl transition-all ${
            activeSubTab === 'creditors'
              ? 'bg-white text-purple-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Créanciers ({creditors.length})
        </button>
        <button
          onClick={() => setActiveSubTab('debts')}
          className={`flex-1 min-h-[44px] py-2 px-2 text-xs font-bold rounded-xl transition-all ${
            activeSubTab === 'debts'
              ? 'bg-white text-blue-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Dettes ({playerDebts.filter(p => p.totalUnpaidAmount > 0).length})
        </button>
        <button
          onClick={() => setActiveSubTab('summary')}
          className={`flex-1 min-h-[44px] py-2 px-2 text-xs font-bold rounded-xl transition-all ${
            activeSubTab === 'summary'
              ? 'bg-white text-emerald-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Rapport & Export
        </button>
      </div>

      {/* 1. SYNTHÈSE DES CRÉANCIERS */}
      {activeSubTab === 'creditors' && (
        <div className="space-y-4">
          {creditorSummaries.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-slate-100 shadow-sm space-y-3">
              <ShieldCheck className="w-10 h-10 text-purple-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">
                Aucun créancier n'est configuré dans le groupe.
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Rendez-vous dans l'onglet "Joueurs" pour ajouter un créancier et définir son montant d'avance.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {creditorSummaries.map(cs => (
                <div
                  key={cs.creditor.id}
                  className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4 relative overflow-hidden"
                >
                  {/* Top Badge & Name */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm text-slate-800 shrink-0"
                        style={{ backgroundColor: cs.creditor.avatarColor || '#F3E8FF' }}
                      >
                        {cs.creditor.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-slate-900">
                          {cs.creditor.name}
                        </h4>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700">
                          Créancier officiel
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Reste à percevoir
                      </span>
                      <span className="text-xl font-bold text-purple-900">
                        {cs.remainingToReimburse.toFixed(2)} €
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar of Reimbursement */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-500">Avance remboursée</span>
                      <span className="text-purple-700 font-bold">{cs.progressPercentage}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${cs.progressPercentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Detailed Breakdown Grid */}
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 text-xs">
                    <div className="bg-slate-50 p-2.5 rounded-2xl text-center">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">
                        Avance
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {cs.initialAdvance.toFixed(2)} €
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-2xl text-center">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block" title="Déduit de ses matchs joués">
                        Auto-déduit
                      </span>
                      <span className="text-xs font-bold text-slate-700">
                        -{cs.consumedByOwnMatches.toFixed(2)} €
                      </span>
                      <span className="text-[9px] text-slate-400 block">
                        ({cs.matchesPlayedCount} matchs)
                      </span>
                    </div>

                    <div className="bg-emerald-50/80 p-2.5 rounded-2xl text-center">
                      <span className="text-[10px] text-emerald-800 font-bold uppercase block">
                        Reçu tiers
                      </span>
                      <span className="text-xs font-bold text-emerald-900">
                        -{cs.reimbursementsReceived.toFixed(2)} €
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. DETTES JOUEURS (QUI DOIT QUOI À QUI) */}
      {activeSubTab === 'debts' && (
        <div className="space-y-4">
          {/* Quick settlement target creditor selector */}
          {canSettle && creditors.length > 1 && (
            <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-xs">
              <span className="font-semibold text-slate-700 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-blue-600" />
                Bénéficiaire par défaut des règlements 1-clic :
              </span>
              <select
                value={selectedCreditorForSettlement || defaultCreditorId}
                onChange={(e) => setSelectedCreditorForSettlement(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                {creditors.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Reste: {(calculateCreditorsSummary([c], matches)[0]?.remainingToReimburse || 0).toFixed(2)} €)
                  </option>
                ))}
              </select>
            </div>
          )}

          {playerDebts.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-slate-100 shadow-sm space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <p className="text-sm font-bold text-slate-800">
                Aucun joueur standard enregistré.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {playerDebts.map(pd => {
                const hasDebts = pd.totalUnpaidAmount > 0;
                const unpaidMatches = pd.matchesDetails.filter(m => m.paymentStatus === 'pending');

                return (
                  <div
                    key={pd.player.id}
                    className={`bg-white rounded-3xl border transition-all overflow-hidden shadow-sm ${
                      hasDebts 
                        ? 'border-amber-200/90' 
                        : 'border-slate-100'
                    }`}
                  >
                    {/* Player Summary Header */}
                    <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/40">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs text-slate-800 shrink-0"
                          style={{ backgroundColor: pd.player.avatarColor || '#E0F2FE' }}
                        >
                          {pd.player.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">
                            {pd.player.name}
                          </h4>
                          <p className="text-xs text-slate-400">
                            {pd.paidMatchesCount} match(s) réglé(s) • {pd.unpaidMatchesCount} impayé(s)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <div className="text-right">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                            Dette totale
                          </span>
                          <span className={`text-base font-bold ${
                            hasDebts ? 'text-amber-600' : 'text-emerald-700'
                          }`}>
                            {pd.totalUnpaidAmount.toFixed(2)} €
                          </span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          hasDebts ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {hasDebts ? 'À régler' : 'À jour'}
                        </span>
                      </div>
                    </div>

                    {/* Unpaid Match List & 1-Click Settlement Button */}
                    {hasDebts && (
                      <div className="p-4 sm:p-5 pt-2 border-t border-slate-100 space-y-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                          Présences à régler :
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {unpaidMatches.map((item, idx) => {
                            const isCurrentSettling = settlingKey === `${item.matchId}_${item.courtName}_${item.position}`;

                            return (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-3 rounded-2xl bg-amber-50/50 border border-amber-200/60 text-xs"
                              >
                                <div>
                                  <span className="font-bold text-slate-800 block">
                                    {item.matchNumber ? `Match #${item.matchNumber}` : 'Match'} • {new Date(item.matchDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    {item.courtName} • {item.price.toFixed(2)} €
                                  </span>
                                </div>

                                {canSettle ? (
                                  <button
                                    type="button"
                                    disabled={isCurrentSettling || !defaultCreditorId}
                                    onClick={() => {
                                      const m = matches.find(x => x.id === item.matchId);
                                      const court = m?.courts.find(c => c.courtName === item.courtName) || m?.courts[0];
                                      if (court && defaultCreditorId) {
                                        handleQuickSettle(item.matchId, court.courtId, item.position, defaultCreditorId);
                                      }
                                    }}
                                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs shadow-xs transition-all disabled:opacity-50 min-h-[44px]"
                                  >
                                    <Check className="w-4 h-4" />
                                    <span>{isCurrentSettling ? 'Règlement...' : 'Marquer réglé'}</span>
                                  </button>
                                ) : (
                                  <span className="text-[11px] font-bold text-amber-700 bg-amber-100/80 px-3 py-1.5 rounded-xl">
                                    En attente
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. RAPPORT & EXPORT TEXTE */}
      {activeSubTab === 'summary' && (
        <div className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-base font-bold text-slate-900">
                Aperçu du message WhatsApp / Récapitulatif
              </h3>
              <p className="text-xs text-slate-400">
                Formaté pour être collé directement dans la conversation de votre groupe.
              </p>
            </div>
            <button
              onClick={handleCopyWhatsApp}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copié !' : 'Copier le texte'}
            </button>
          </div>

          <pre className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs text-slate-800 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
            {generateWhatsAppReport()}
          </pre>
        </div>
      )}
    </div>
  );
};
