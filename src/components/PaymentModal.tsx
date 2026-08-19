import React, { useState } from 'react';
import { Player, Match } from '../types';
import { recordPayment, revertPayment } from '../services/padelService';
import { CheckCircle2, CreditCard, DollarSign, X, Loader2, RotateCcw, AlertCircle } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: Match;
  playerId: string;
  players: Player[];
  matchFee: number;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  match,
  playerId,
  players,
  matchFee
}) => {
  const [selectedCreditorId, setSelectedCreditorId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const player = players.find(p => p.id === playerId);
  const playerName = player?.name || 'Joueur';
  const currentPayment = match.payments?.[playerId];
  const isAlreadyPaid = currentPayment?.status === 'paid';
  const paidCreditor = players.find(p => p.id === currentPayment?.paidToCreditorId);

  // Available creditors (players with isCreditor = true or creditBalance > 0)
  const creditors = players.filter(p => p.isCreditor || p.creditBalance > 0);

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCreditorId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await recordPayment(match.id, playerId, selectedCreditorId, matchFee);
      onClose();
    } catch (error: any) {
      console.error("Erreur lors de l'enregistrement du paiement:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevertPayment = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await revertPayment(match.id, playerId, currentPayment?.paidToCreditorId || null, matchFee);
      onClose();
    } catch (error: any) {
      console.error("Erreur lors de l'annulation du paiement:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">
              Paiement de la part de match
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Match du {match.date} • Terrain {match.courtNumber}
            </p>
          </div>
        </div>

        {isAlreadyPaid ? (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-emerald-900">
                Part de {playerName} payée ({matchFee} €)
              </p>
              <p className="text-xs text-emerald-700 mt-1">
                Versée à : <span className="font-bold">{paidCreditor?.name || 'Créancier'}</span>
              </p>
              {currentPayment?.paidAt && (
                <p className="text-[11px] text-emerald-600/80 mt-1">
                  Enregistré le {new Date(currentPayment.paidAt).toLocaleDateString('fr-FR')}
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 text-xs font-bold rounded-2xl hover:bg-slate-200 transition-colors"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleRevertPayment}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 bg-rose-50 text-rose-700 text-xs font-bold rounded-2xl hover:bg-rose-100 border border-rose-200 transition-colors flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    Remettre en attente
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleConfirmPayment} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1">
                <span>Joueur concerné :</span>
                <span className="font-bold text-slate-900">{playerName}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Montant unitaire :</span>
                <span className="font-extrabold text-emerald-600 text-sm">{matchFee} €</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                À qui {playerName} a-t-il payé sa part ?
              </label>

              {creditors.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                  Aucun créancier enregistré. Vous pouvez désigner un joueur créancier dans l'onglet Joueurs.
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {creditors.map((cred) => {
                    const isSelected = selectedCreditorId === cred.id;
                    return (
                      <label
                        key={cred.id}
                        className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="creditor"
                            value={cred.id}
                            checked={isSelected}
                            onChange={() => setSelectedCreditorId(cred.id)}
                            className="sr-only"
                          />
                          <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold shrink-0">
                            {cred.emoji || '💳'}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-900 block leading-tight">
                              {cred.name}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium">
                              Créance restante : {cred.creditBalance} €
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[11px] font-extrabold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg">
                            - {matchFee} €
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 text-xs font-bold rounded-2xl hover:bg-slate-200 transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!selectedCreditorId || isSubmitting}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-2xl shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Valider le paiement
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
