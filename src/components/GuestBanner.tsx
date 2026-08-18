import React, { useState } from 'react';
import { signInWithGoogle } from '../firebase';
import { Eye, LogIn, Sparkles, Loader2 } from 'lucide-react';

interface GuestBannerProps {
  onSignedIn?: () => void;
}

export const GuestBanner: React.FC<GuestBannerProps> = ({ onSignedIn }) => {
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleLogin = async () => {
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
      if (onSignedIn) onSignedIn();
    } catch (error: any) {
      if (error?.code !== 'auth/popup-closed-by-user') {
        console.error("Erreur de connexion Google:", error);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="bg-slate-900 text-white px-3 sm:px-6 py-2.5 rounded-2xl mb-4 sm:mb-5 flex flex-col sm:flex-row items-center justify-between gap-2.5 shadow-sm border border-slate-800">
      <div className="flex items-center gap-2.5 text-center sm:text-left">
        <div className="w-7 h-7 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 shrink-0">
          <Eye className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <span className="text-xs font-bold text-slate-100">
              Mode Invité — Lecture seule
            </span>
            <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
              Consultation
            </span>
          </div>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            Vous pouvez consulter librement tous les plannings, joueurs et finances du club.
          </p>
        </div>
      </div>

      <button
        id="btn-guest-banner-login"
        onClick={handleLogin}
        disabled={isSigningIn}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-1.5 bg-white hover:bg-slate-100 active:scale-98 text-slate-900 rounded-xl text-xs font-bold transition-all shadow-2xs min-h-[36px] cursor-pointer shrink-0"
      >
        {isSigningIn ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-700" />
            <span>Connexion...</span>
          </>
        ) : (
          <>
            {/* Google Icon */}
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
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
    </div>
  );
};
