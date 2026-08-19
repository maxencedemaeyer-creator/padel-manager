import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { KeyRound, Eye, Sparkles, ShieldCheck, ArrowRight, Loader2, HelpCircle } from 'lucide-react';
import { ForgotPasswordModal } from './ForgotPasswordModal';

export const LoginScreen: React.FC = () => {
  const { 
    loginWithCode, 
    loginAsGuest, 
    players, 
    dataLoading,
    isForgotPasswordModalOpen,
    openForgotPasswordModal,
    closeForgotPasswordModal
  } = useAuth();

  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || isSubmitting) return;

    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await loginWithCode(trimmed);
      if (!res.success) {
        setErrorMessage(res.error || 'Code incorrect. Réessayez.');
      }
    } catch (err: any) {
      setErrorMessage('Une erreur est survenue lors de la connexion.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 py-8 sm:px-6 relative overflow-hidden">
      {/* Subtle Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-linear-to-tr from-emerald-500 to-teal-400 text-white shadow-xl shadow-emerald-500/20 mb-4 ring-8 ring-emerald-500/10">
            <span className="text-3xl">🎾</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Padel Manager
          </h1>
          <p className="text-slate-400 text-sm mt-1.5 font-medium">
            Bienvenue sur ton espace club & plannings
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/90 backdrop-blur-md rounded-3xl border border-slate-800 p-6 sm:p-8 shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                  Code unique d'accès
                </label>
                <button
                  type="button"
                  onClick={openForgotPasswordModal}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 hover:underline"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  Code oublié ?
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  autoFocus
                  required
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Entrez votre code personnel (ex: 4812)"
                  className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-700/80 rounded-2xl text-base font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all text-center tracking-wider"
                />
              </div>

              {errorMessage && (
                <div className="mt-2.5 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-medium text-rose-400 text-center animate-in fade-in">
                  {errorMessage}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!code.trim() || isSubmitting}
              className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 text-sm font-extrabold rounded-2xl shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  Vérification...
                </>
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="w-4 h-4 text-slate-950" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-slate-900 px-3 text-slate-500 font-semibold tracking-wider">
                ou
              </span>
            </div>
          </div>

          {/* Guest Mode */}
          <button
            type="button"
            onClick={loginAsGuest}
            className="w-full py-3 px-4 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs sm:text-sm font-bold rounded-2xl border border-slate-700/60 transition-all flex items-center justify-center gap-2"
          >
            <Eye className="w-4 h-4 text-slate-400" />
            Continuer en Mode Invité (Lecture seule)
          </button>
        </div>

        {/* Quick Helper info for testing */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-500 font-medium">
            🔒 Connexion sécurisée sans mot de passe complexe
          </p>
        </div>
      </div>

      {/* Forgot Password Assistance Modal */}
      <ForgotPasswordModal
        isOpen={isForgotPasswordModalOpen}
        onClose={closeForgotPasswordModal}
        players={players}
      />
    </div>
  );
};
