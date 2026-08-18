import React, { useState } from 'react';
import { Home, Calendar, Users, Wallet, Settings, Menu, X, Plus, ShieldCheck, ChevronRight } from 'lucide-react';

interface NavigationProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  pendingDebtsCount: number;
  matchesCount: number;
  playersCount: number;
  onOpenNewMatchModal?: () => void;
  isMobileDrawerOpen?: boolean;
  setIsMobileDrawerOpen?: (open: boolean) => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  pendingDebtsCount,
  matchesCount,
  playersCount,
  onOpenNewMatchModal,
  isMobileDrawerOpen = false,
  setIsMobileDrawerOpen
}) => {
  const navItems = [
    {
      id: 'dashboard',
      label: 'Tableau de bord',
      shortLabel: 'Accueil',
      description: 'Vue d\'ensemble du club et prochain match',
      icon: Home,
      badge: undefined
    },
    {
      id: 'matches',
      label: 'Planning & Matchs',
      shortLabel: 'Matchs',
      description: 'Calendrier des séances et terrains',
      icon: Calendar,
      badge: matchesCount > 0 ? matchesCount : undefined
    },
    {
      id: 'players',
      label: 'Joueurs & Membres',
      shortLabel: 'Joueurs',
      description: 'Liste des membres et créanciers',
      icon: Users,
      badge: playersCount > 0 ? playersCount : undefined
    },
    {
      id: 'finances',
      label: 'Finances & Dettes',
      shortLabel: 'Finances',
      description: 'Comptabilité et règlements aux créanciers',
      icon: Wallet,
      badge: pendingDebtsCount > 0 ? `${pendingDebtsCount}€` : undefined,
      badgeColor: 'bg-amber-100 text-amber-900 border border-amber-200'
    },
    {
      id: 'settings',
      label: 'Paramètres du Club',
      shortLabel: 'Réglages',
      description: 'Générateur de saison & configuration',
      icon: Settings,
      badge: undefined
    }
  ];

  const handleTabClick = (id: string) => {
    onSelectTab(id);
    if (setIsMobileDrawerOpen) {
      setIsMobileDrawerOpen(false);
    }
  };

  return (
    <>
      {/* 1. Desktop / Tablet Top Tabs Bar (Clean Utility Segmented Pills) */}
      <div className="hidden md:flex items-center justify-between bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs mb-6 select-none">
        <div className="flex items-center gap-1.5 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                id={`desktop-nav-${item.id}`}
                onClick={() => handleTabClick(item.id)}
                className={`relative px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer min-h-[44px] ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.5]' : 'stroke-[2]'}`} />
                <span>{item.label}</span>

                {item.badge !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : item.badgeColor || 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {onOpenNewMatchModal && (
          <button
            onClick={onOpenNewMatchModal}
            className="hidden lg:inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau match</span>
          </button>
        )}
      </div>

      {/* 2. Mobile Drawer Navigation Overlay */}
      {isMobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex animate-in fade-in duration-200">
          {/* Backdrop */}
          <div 
            onClick={() => setIsMobileDrawerOpen && setIsMobileDrawerOpen(false)}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity" 
          />

          {/* Drawer Content */}
          <div className="relative w-full max-w-xs bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-250">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center text-lg font-bold">
                  🎾
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    Padel Manager
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">Menu principal</span>
                </div>
              </div>

              <button
                onClick={() => setIsMobileDrawerOpen && setIsMobileDrawerOpen(false)}
                aria-label="Fermer le menu"
                className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Action Button */}
            {onOpenNewMatchModal && (
              <div className="p-4 border-b border-slate-100">
                <button
                  onClick={() => {
                    if (setIsMobileDrawerOpen) setIsMobileDrawerOpen(false);
                    onOpenNewMatchModal();
                  }}
                  className="w-full min-h-[48px] py-3 px-4 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Programmer un match</span>
                </button>
              </div>
            )}

            {/* Drawer Navigation List */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleTabClick(item.id)}
                    className={`w-full min-h-[52px] p-3.5 rounded-2xl flex items-center justify-between text-left transition-all active:scale-98 ${
                      isActive
                        ? 'bg-blue-50/80 text-blue-900 border border-blue-200 font-bold'
                        : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <Icon className="w-4 h-4 stroke-[2]" />
                      </div>
                      <div>
                        <span className="text-sm font-bold block leading-tight">{item.label}</span>
                        <span className="text-[11px] text-slate-400 font-medium block">
                          {item.description}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.badge !== undefined && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${item.badgeColor || 'bg-amber-100 text-amber-900'}`}>
                          {item.badge}
                        </span>
                      )}
                      <ChevronRight className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-300'}`} />
                    </div>
                  </button>
                );
              })}
            </nav>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Base Firestore Synchronisée</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Mobile Bottom Navigation Bar (Fixed bottom with 48px+ touch targets) */}
      <nav 
        aria-label="Navigation mobile"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-2 py-1.5 shadow-lg flex items-center justify-around select-none safe-area-pb"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              id={`mobile-nav-${item.id}`}
              onClick={() => handleTabClick(item.id)}
              className={`flex-1 min-h-[48px] flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all relative active:scale-95 touch-manipulation ${
                isActive ? 'text-slate-900 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <div className="relative">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                    isActive ? 'bg-slate-900 text-white shadow-2xs' : 'bg-transparent text-slate-500'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
                </div>

                {item.badge !== undefined && (
                  <span className="absolute -top-1 -right-1.5 min-w-[15px] h-3.5 px-1 rounded-full bg-amber-500 text-white text-[8px] font-bold flex items-center justify-center ring-2 ring-white">
                    {item.badge}
                  </span>
                )}
              </div>

              <span className={`text-[10px] mt-0.5 tracking-tight ${isActive ? 'font-bold text-slate-900' : 'font-medium text-slate-500'}`}>
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
};

