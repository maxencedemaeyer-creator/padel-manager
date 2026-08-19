import React, { useState } from 'react';
import { Player } from '../types';
import { createPasswordRequest } from '../services/padelService';
import { Mail, User, CheckCircle2, HelpCircle, X, Loader2, ArrowRight } from 'lucide-react';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  players: Player[];
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  players
}) => {
  const [tab, setTab] = useState<'email' | 'name'>('name');
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = inputValue.trim();
    if (!val || isSubmitting) return;

    setIsSubmitting(true);
    try {
      let matchedPlayer: Player | undefined;
      if (tab === 'email') {
        const lowerEmail = val.toLowerCase();
        matchedPlayer = players.find(p => p.email && p.email.toLowerCase() === lowerEmail);
      } else {
        const lowerName = val.toLowerCase();
        matchedPlayer = players.find(p => p.name.toLowerCase().includes(lowerName) || lowerName.includes(p.name.toLowerCase()));
      }

      await createPasswordRequest({
        requestType: tab,
        value: val,
        playerName: matchedPlayer?.name || (tab === 'name' ? val : ''),
        playerEmail: matchedPlayer?.email || (tab === 'email' ? val : ''),
        playerFound: !!matchedPlayer
      });

      setIsSubmitted(true);
    } catch (error: any) {
      console.error("Erreur lors de l'envoi de la demande:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setInputValue('');
    setIsSubmitted(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={handleResetAndClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {isSubmitted ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Demande envoyée !</h3>
            <p className="text-sm font-medium text-slate-600 mb-6 max-w-xs mx-auto leading-relaxed">
              Demande envoyée à Maxence ! Tu recevras ton code d'accès sous peu par WhatsApp ou e-mail.
            </p>
            <button
              onClick={handleResetAndClose}
              className="w-full py-3 px-4 bg-slate-900 text-white text-sm font-bold rounded-2xl hover:bg-slate-800 transition-colors"
            >
              Compris, retour à l'accueil
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 leading-tight">Code d'accès oublié ?</h3>
                <p className="text-xs text-slate-500 font-medium">Reçois ton code personnel rapidement</p>
              </div>
            </div>

            {/* Tab Selection */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-2xl mb-4 text-xs font-bold">
              <button
                type="button"
                onClick={() => { setTab('name'); setInputValue(''); }}
                className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  tab === 'name' 
                    ? 'bg-white text-slate-900 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                Par Prénom / Nom
              </button>
              <button
                type="button"
                onClick={() => { setTab('email'); setInputValue(''); }}
                className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  tab === 'email' 
                    ? 'bg-white text-slate-900 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                Par E-mail
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {tab === 'name' ? "Ton prénom ou ton nom de joueur" : "Ton adresse e-mail"}
                </label>
                <div className="relative">
                  <input
                    type={tab === 'email' ? 'email' : 'text'}
                    required
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={tab === 'name' ? "Ex: Thomas ou Alexandre..." : "Ex: thomas@padel.be"}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-3 text-xs text-amber-900 leading-relaxed">
                Maxence recevra immédiatement ta demande d'assistance et te transmettra ton code unique.
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 text-xs font-bold rounded-2xl hover:bg-slate-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isSubmitting}
                  className="flex-1 py-3 px-4 bg-slate-900 text-white text-xs font-bold rounded-2xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Envoi...
                    </>
                  ) : (
                    <>
                      Envoyer la demande
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
