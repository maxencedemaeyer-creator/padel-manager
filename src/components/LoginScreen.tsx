import React, { useState } from 'react';
import { signInWithGoogle, signInWithGoogleRedirect, signInGuest } from '../firebase';
import { ClubSettings } from '../types';
import { 
  Sparkles, 
  ShieldCheck, 
  Users, 
  Calendar, 
  AlertCircle,
  Loader2,
  UserCheck,
  ExternalLink,
  RefreshCw
} from 'lucide-react';

interface LoginScreenProps {
  settings: ClubSettings;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ settings }) => {
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [isLoadingRedirect, setIsLoadingRedirect] = useState(false);
  const [isLoadingGuest, setIsLoadingGuest] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [showRedirectOption, setShowRedirectOption] = useState(false);

  const handleGoogleSignIn = async (forceRedirect = false) => {
    setErrorMessage(null);
    setErrorCode(null);

    if (forceRedirect) {
      setIsLoadingRedirect(true);
      try {
        await signInWithGoogleRedirect();
      } catch (error: any) {
        console.error("Erreur de connexion Google (Redirect):", error);
        const code = error?.code || 'auth/redirect-error';
        const msg = error?.message || String(error);
        setErrorCode(code);
        setErrorMessage(`Erreur Firebase [${code}] : ${msg}`);
      } finally {
        setIsLoadingRedirect(false);
      }
      return;
    }

    setIsLoadingGoogle(true);
    try {
      // Attempt popup sign in first
      await signInWithGoogle(false);
    } catch (error: any) {
      console.error("Erreur de connexion Google (Popup):", error);
      const code = error?.code || 'auth/unknown-error';
      const msg = error?.message || String(error);
      
      setErrorCode(code);
      setErrorMessage(`Erreur Firebase [${code}] : ${msg}`);

      // If popup was blocked, closed or failed, automatically highlight or offer redirect
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        setShowRedirectOption(true);
      }
    } finally {
      setIsLoadingGoogle(false);
    }
  };

  const handleGuestSignIn = async () => {
    setErrorMessage(null);
    setErrorCode(null);
    setIsLoadingGuest(true);
    try {
      await signInGuest();
    } catch (error: any) {
      console.error("Erreur de connexion Invité:", error);
      const code = error?.code || 'auth/guest-error';
      const msg = error?.message || String(error);
      setErrorCode(code);
      setErrorMessage(`Erreur Firebase Invité [${code}] : ${msg}`);
    } finally {
      setIsLoadingGuest(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between p-4 sm:p-6 lg:p-10 font-sans antialiased selection:bg-sky-100 selection:text-sky-900">
      {/* Top Bar Minimal */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-2xl flex items-center justify-center text-xl shadow-2xs">
            🎾
          </div>
          <div>
            <span className="text-base font-bold text-slate-900 tracking-tight block leading-tight">
              {settings.clubName || 'Padel Manager'}
            </span>
            <span className="text-[11px] text-slate-400 font-medium block">
              Gestion de club & tournois
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Saison {settings.seasonMatchesCount || 44} Matchs
          </span>
        </div>
      </header>

      {/* Center Hero Card */}
      <main className="max-w-xl w-full mx-auto my-auto py-8">
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/40 p-6 sm:p-10 space-y-7 text-center">
          
          {/* Badge & Title */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100/80 shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Accès Membres & Joueurs</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Bienvenue sur {settings.clubName || 'Padel Manager'}
            </h1>

            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-md mx-auto">
              Consultez les plannings des terrains, vos prochains matchs de padel, réglez vos présences et suivez la trésorerie du club en temps réel.
            </p>
          </div>

          {/* Error Banner with exact code & message */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium space-y-2 text-left animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <strong className="block font-bold text-rose-950">
                    Échec de l'authentification Google
                  </strong>
                  <p className="text-[11px] leading-relaxed font-mono bg-white/70 p-2 rounded-lg border border-rose-200/60 break-all select-all">
                    {errorMessage}
                  </p>
                </div>
              </div>

              {/* Helpful diagnostic tip */}
              {errorCode === 'auth/unauthorized-domain' && (
                <div className="text-[11px] text-rose-800 bg-rose-100/80 p-2.5 rounded-xl border border-rose-200">
                  💡 <strong>Domaine non autorisé dans Firebase :</strong> L'URL actuelle doit être ajoutée aux <em>Domaines autorisés</em> dans la console Firebase (Authentication &gt; Paramètres &gt; Domaines autorisés).
                </div>
              )}

              {(errorCode === 'auth/popup-blocked' || errorCode === 'auth/popup-closed-by-user' || showRedirectOption) && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => handleGoogleSignIn(true)}
                    disabled={isLoadingRedirect}
                    className="w-full flex items-center justify-center gap-2 px-3.5 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                  >
                    {isLoadingRedirect ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5" />
                    )}
                    <span>Réessayer avec redirection de page (Plein écran)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3 pt-2">
            {/* Primary Google Login (Popup) */}
            <button
              id="btn-google-login-hero"
              onClick={() => handleGoogleSignIn(false)}
              disabled={isLoadingGoogle || isLoadingRedirect || isLoadingGuest}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white rounded-2xl text-sm font-bold shadow-md shadow-slate-900/10 transition-all disabled:opacity-50 min-h-[48px] cursor-pointer"
            >
              {isLoadingGoogle ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Ouverture de la fenêtre Google...</span>
                </>
              ) : (
                <>
                  {/* Google G SVG */}
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#EA4335"
                      d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12 0 12s.7 2.3 1.9 4.7l3.7-1.9z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
                    />
                  </svg>
                  <span>Se connecter avec Google</span>
                </>
              )}
            </button>

            {/* Secondary Google Login (Redirect) if popup is problematic */}
            {showRedirectOption && (
              <button
                type="button"
                onClick={() => handleGoogleSignIn(true)}
                disabled={isLoadingGoogle || isLoadingRedirect || isLoadingGuest}
                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-50 hover:bg-blue-100/80 text-blue-900 border border-blue-200 rounded-2xl text-xs font-bold transition-all disabled:opacity-50 min-h-[42px] cursor-pointer"
              >
                {isLoadingRedirect ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Redirection Google en cours...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                    <span>Connexion Google via redirection (Anti-blocage pop-up)</span>
                  </>
                )}
              </button>
            )}

            {/* Guest Login */}
            <button
              id="btn-guest-login-hero"
              onClick={handleGuestSignIn}
              disabled={isLoadingGoogle || isLoadingRedirect || isLoadingGuest}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-slate-100 hover:bg-slate-200/80 active:scale-[0.99] text-slate-700 rounded-2xl text-xs sm:text-sm font-bold transition-all disabled:opacity-50 min-h-[44px] cursor-pointer"
            >
              {isLoadingGuest ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                  <span>Accès en cours...</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4 text-slate-500" />
                  <span>Accéder comme invité / spectateur</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Value Props */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-4 border-t border-slate-100 text-left">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <Calendar className="w-4 h-4 text-blue-600 mb-1.5" />
              <p className="text-xs font-bold text-slate-800">2 Terrains / Match</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Schéma A/B & net visuel</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <ShieldCheck className="w-4 h-4 text-purple-600 mb-1.5" />
              <p className="text-xs font-bold text-slate-800">Trésorerie & Dettes</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Avances & règlements 1-clic</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <Users className="w-4 h-4 text-emerald-600 mb-1.5" />
              <p className="text-xs font-bold text-slate-800">Effectif Synchronisé</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Temps réel Firestore</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-400 py-3">
        <span>© {new Date().getFullYear()} {settings.clubName || 'Padel Manager'} • Gestion collaborative des sessions</span>
      </footer>
    </div>
  );
};
