import React, { useState, useMemo } from 'react';
import { Player, Match, ClubSettings } from '../types';
import { savePlayer } from '../services/padelService';
import { 
  TrendingUp, 
  CreditCard, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Edit3, 
  Users, 
  Sparkles,
  ArrowDownRight,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';

interface FinancesProps {
  players: Player[];
  matches: Match[];
  settings: ClubSettings;
  isAdmin: boolean;
}

export const Finances: React.FC<FinancesProps> = ({
  players,
  matches,
  settings,
  isAdmin
}) => {
  const [editingCreditor, setEditingCreditor] = useState<Player | null>(null);
  const [editBalanceVal, setEditBalanceVal] = useState<number>(0);
  const [isSavingBalance, setIsSavingBalance] = useState(false);

  const matchFee = settings.matchFeePerPlayer || 10;

  // Creditors list
  const creditors = useMemo(() => {
    return players.filter(p => p.isCreditor || p.creditBalance > 0);
  }, [players]);

  // Aggregate stats
  const totalOutstandingCredit = useMemo(() => {
    return creditors.reduce((sum, c) => sum + (c.creditBalance || 0), 0);
  }, [creditors]);

  // Count total payments recorded across matches
  const { totalPaidCount, totalPendingCount, totalPaidAmount, recentPayments } = useMemo(() => {
    let paidCount = 0;
    let pendingCount = 0;
    const history: Array<{
      matchId: string;
      date: string;
      courtNumber: number;
      playerId: string;
      playerName: string;
      creditorName: string;
      amount: number;
      paidAt?: string;
    }> = [];

    matches.forEach(m => {
      const playerIds = [
        m.teamA?.player1Id,
        m.teamA?.player2Id,
        m.teamB?.player1Id,
        m.teamB?.player2Id
      ].filter(Boolean) as string[];

      playerIds.forEach(pId => {
        const payment = m.payments?.[pId];
        if (payment && payment.status === 'paid') {
          paidCount++;
          const p = players.find(x => x.id === pId);
          const cred = players.find(x => x.id === payment.paidToCreditorId);
          history.push({
            matchId: m.id,
            date: m.date,
            courtNumber: m.courtNumber,
            playerId: pId,
            playerName: p?.name || 'Inconnu',
            creditorName: cred?.name || 'Créancier',
            amount: payment.amount || matchFee,
            paidAt: payment.paidAt
          });
        } else {
          pendingCount++;
        }
      });
    });

    // Sort recent history newest first
    history.sort((a, b) => {
      if (a.paidAt && b.paidAt) return b.paidAt.localeCompare(a.paidAt);
      return b.date.localeCompare(a.date);
    });

    return {
      totalPaidCount: paidCount,
      totalPendingCount: pendingCount,
      totalPaidAmount: paidCount * matchFee,
      recentPayments: history
    };
  }, [matches, players, matchFee]);

  const handleOpenEditBalance = (creditor: Player) => {
    setEditingCreditor(creditor);
    setEditBalanceVal(creditor.creditBalance || 0);
  };

  const handleSaveBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCreditor || isSavingBalance) return;

    setIsSavingBalance(true);
    try {
      await savePlayer({
        ...editingCreditor,
        creditBalance: Number(editBalanceVal) || 0
      });
      setEditingCreditor(null);
    } catch (err) {
      console.error("Erreur mise à jour solde:", err);
    } finally {
      setIsSavingBalance(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-2xs">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">
            Comptabilité & Suivi Financier
          </span>
          <span className="text-xs text-slate-400 font-semibold">
            Tarif référence : {matchFee} € / part
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Bilan des Avances de Saison & Remboursements
        </h2>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">Créances Restantes Globales</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-purple-950">
            {totalOutstandingCredit} €
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            À rembourser aux créanciers de saison
          </p>
        </div>

        {/* KPI 2 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">Paiements Encaissés</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-900">
            {totalPaidAmount} €
          </p>
          <p className="text-[11px] text-emerald-700 font-medium mt-1">
            {totalPaidCount} part(s) de match réglées
          </p>
        </div>

        {/* KPI 3 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">Parts en Attente</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-amber-950">
            {totalPendingCount}
          </p>
          <p className="text-[11px] text-amber-700 font-medium mt-1">
            À régler lors des prochaines séances
          </p>
        </div>
      </div>

      {/* 1. TABLEAU DES CRÉANCIERS */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 leading-tight">
              Soldes Individuels des Créanciers
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Chaque paiement validé déduit {matchFee} € du solde du créancier désigné
            </p>
          </div>
        </div>

        {creditors.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-700">Aucun créancier enregistré</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Désignez un joueur comme créancier dans l'onglet Joueurs.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {creditors.map((cred) => (
              <div 
                key={cred.id}
                className="p-4 bg-slate-50 rounded-2xl border border-slate-200/90 flex flex-col justify-between"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold shrink-0 text-slate-800"
                      style={{ backgroundColor: cred.avatarColor || '#EDE9FE' }}
                    >
                      {cred.emoji || '💳'}
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">{cred.name}</h4>
                      <span className="text-[11px] text-purple-700 font-bold bg-purple-100/70 px-2 py-0.2 rounded-md">
                        Créancier
                      </span>
                    </div>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => handleOpenEditBalance(cred)}
                      className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors"
                      title="Ajuster manuellement le solde"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/70 flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">Créance restante :</span>
                  <span className="text-lg font-black text-purple-950">
                    {cred.creditBalance || 0} €
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. HISTORIQUE DES TRANSACTIONS / PAIEMENTS */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs">
        <h3 className="text-base font-extrabold text-slate-900 mb-1">
          Historique des Paiements Réglés
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Derniers remboursements enregistrés sur les feuilles de match
        </p>

        {recentPayments.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">
            Aucun paiement enregistré pour l'instant
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase text-[10px]">
                  <th className="py-3 px-3">Date Match</th>
                  <th className="py-3 px-3">Joueur Débiteur</th>
                  <th className="py-3 px-3">Payé à</th>
                  <th className="py-3 px-3">Montant</th>
                  <th className="py-3 px-3">Date Règlement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {recentPayments.slice(0, 15).map((pay, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {pay.date} (T{pay.courtNumber})
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-950">
                      {pay.playerName}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg">
                        {pay.creditorName}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-black text-emerald-700">
                      +{pay.amount} €
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                      {pay.paidAt ? new Date(pay.paidAt).toLocaleDateString('fr-FR') : 'En séance'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Creditor Balance Modal */}
      {editingCreditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative animate-in fade-in">
            <h3 className="text-base font-black text-slate-900 mb-1">
              Ajuster la créance de {editingCreditor.name}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Modification directe du solde restant
            </p>

            <form onSubmit={handleSaveBalance} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nouveau solde (€)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editBalanceVal}
                  onChange={(e) => setEditBalanceVal(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCreditor(null)}
                  className="flex-1 py-2.5 px-3 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSavingBalance}
                  className="flex-1 py-2.5 px-3 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors"
                >
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
