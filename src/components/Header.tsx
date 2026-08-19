import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, Menu, ShieldCheck, Sparkles, User, HelpCircle } from 'lucide-react';

interface HeaderProps {
  onOpenMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu }) => {
  const { 
    currentPlayer, 
    userRole, 
    isAdmin, 
    isGuest, 
    logout,
    openForgotPasswordModal
  } = useAuth();

  const playerName = currentPlayer ? currentPlayer.name : (isAdmin ? 'Maxence (Admin)' : (isGuest ? 'Invité' : ''));

  return (
    <header className="bg-white border-b border-slate-200/90 py-3 sm:py-3.5 px-3 sm:px-6 lg:px-8 sticky top-0 z-30 shadow-2xs">
      <div className="flex items-center justify-between gap-2 sm:gap-4 max-w-7xl mx-auto">
        {/* Left: Brand & Title */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {onOpenMobileMenu && (
            <button
              onClick={onOpenMobileMenu}
              className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-xs font-bold text-base shrink-0">
              <span>🎾</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm sm:text-base text-slate-900 tracking-tight">
                  Padel Manager
                </span>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                  Saison 2026/27
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium hidden xs:block">
                Gestion des terrains & comptabilité
              </p>
            </div>
          </div>
        </div>

        {/* Right: User Status & Logout */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Welcome User Pill */}
          <div className="bg-slate-50 border border-slate-200/90 pl-2.5 sm:pl-3 pr-2 py-1.5 rounded-2xl flex items-center gap-2 sm:gap-3 shadow-2xs">
            {/* Player Avatar / Emoji */}
            <div 
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 text-slate-800"
              style={{ backgroundColor: currentPlayer?.avatarColor || (isAdmin ? '#EDE9FE' : '#F1F5F9') }}
            >
              {currentPlayer?.emoji ? (
                <span className="text-sm">{currentPlayer.emoji}</span>
              ) : (
                <span>{playerName.slice(0, 2).toUpperCase() || '🎾'}</span>
              )}
            </div>

            {/* Name and Role */}
            <div className="text-left">
              <span className="text-xs font-bold text-slate-900 block truncate max-w-[100px] sm:max-w-[140px] leading-tight">
                {playerName ? `Bienvenue, ${playerName}` : 'Mode Invité'}
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                {isAdmin ? (
                  <span className="text-[10px] font-extrabold text-purple-700 bg-purple-100/80 px-1.5 py-0.2 rounded-md">
                    👑 Admin
                  </span>
                ) : currentPlayer?.isCreditor ? (
                  <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.2 rounded-md">
                    💳 Créancier ({currentPlayer.creditBalance}€)
                  </span>
                ) : isGuest ? (
                  <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.2 rounded-md">
                    👁️ Invité (Lecture seule)
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded-md">
                    🎾 Joueur
                  </span>
                )}
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={logout}
              title="Se déconnecter / Changer de code"
              aria-label="Se déconnecter"
              className="ml-1 px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all flex items-center gap-1 shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
