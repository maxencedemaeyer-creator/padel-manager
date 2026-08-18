import React from 'react';
import { User, signInWithGoogle, signInGuest, logOut } from '../firebase';
import { ClubSettings, Player } from '../types';
import { LogIn, LogOut, Menu, UserCheck, Sparkles } from 'lucide-react';

interface HeaderProps {
  user: User | null;
  linkedPlayer?: Player | null;
  settings: ClubSettings;
  activeMatchesCount: number;
  isAdmin?: boolean;
  isUser?: boolean;
  isGuest?: boolean;
  onOpenMobileMenu?: () => void;
  onOpenAuthModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  linkedPlayer,
  settings,
  activeMatchesCount,
  isAdmin = false,
  isUser = false,
  isGuest = false,
  onOpenMobileMenu,
  onOpenAuthModal
}) => {
  return (
    <header className="bg-white border-b border-slate-200/90 py-3 sm:py-4 px-3 sm:px-6 lg:px-8 sticky top-0 z-30 shadow-2xs">
      <div className="flex items-center justify-between gap-2 sm:gap-4 max-w-7xl mx-auto">
        {/* Left: Mobile Menu Toggle & Brand / Context Titles */}
        <div className="flex items-center gap-2 sm:gap-3">
          {onOpenMobileMenu && (
            <button
              onClick={onOpenMobileMenu}
              aria-label="Ouvrir le menu"
              className="md:hidden w-11 h-11 rounded-2xl flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 shadow-2xs transition-colors shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-2xl flex items-center justify-center text-xl shrink-0 shadow-2xs">
              🎾
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight truncate max-w-[140px] sm:max-w-xs md:max-w-none">
                  {settings.clubName || 'Padel Manager'}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 hidden sm:inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Saison Active
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 font-medium truncate">
                {settings.seasonMatchesCount || 44} matchs prévus • {activeMatchesCount} programmés
              </p>
            </div>
          </div>
        </div>

        {/* Right: User Profile Pill */}
        <div className="flex items-center gap-2">
          {user ? (
            <div className="bg-white pl-2 sm:pl-3 pr-2 py-1.5 rounded-2xl border border-slate-200 flex items-center gap-2 sm:gap-2.5 shadow-2xs min-h-[44px]">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Profil'}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl object-cover border border-slate-200 shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div 
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 text-slate-700"
                  style={{ backgroundColor: linkedPlayer?.avatarColor || '#E0F2FE' }}
                >
                  {linkedPlayer ? linkedPlayer.name.slice(0, 2).toUpperCase() : (user.displayName ? user.displayName.slice(0, 2).toUpperCase() : 'ME')}
                </div>
              )}
              
              <div 
                className="text-left hidden xs:block cursor-pointer"
                onClick={onOpenAuthModal}
                title={isGuest ? "Mode invité (lecture seule)" : "Cliquer pour changer de profil associé"}
              >
                <span className="text-xs font-bold text-slate-900 block truncate max-w-[90px] sm:max-w-[130px] leading-tight">
                  {linkedPlayer ? linkedPlayer.name : (user.displayName || (isGuest ? 'Invité' : 'Membre'))}
                </span>
                <div className="flex items-center gap-1 mt-0.5">
                  {isAdmin ? (
                    <span className="text-[10px] font-extrabold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded-md flex items-center gap-1">
                      👑 Admin
                    </span>
                  ) : linkedPlayer ? (
                    <span className={`text-[10px] font-bold ${linkedPlayer.role === 'creditor' ? 'text-purple-600' : 'text-emerald-600'}`}>
                      {linkedPlayer.role === 'creditor' ? '💳 Créancier' : '🎾 Joueur'}
                    </span>
                  ) : isGuest ? (
                    <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.2 rounded-md">
                      👁️ Invité
                    </span>
                  ) : (
                    <span className="text-[10px] text-blue-600 font-bold hover:underline">
                      Lier profil
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => logOut()}
                title="Se déconnecter"
                aria-label="Se déconnecter"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => signInWithGoogle(true).catch(() => signInGuest())}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-2xl text-xs font-bold shadow-xs transition-all min-h-[44px]"
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden xs:inline">Connexion Google</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
