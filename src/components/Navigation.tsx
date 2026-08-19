import React from 'react';
import { 
  Home, 
  Calendar, 
  Users, 
  TrendingUp, 
  Settings as SettingsIcon, 
  X,
  Sparkles
} from 'lucide-react';

interface NavigationProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  matchesCount: number;
  playersCount: number;
  isAdmin: boolean;
  isGuest: boolean;
  isMobileDrawerOpen: boolean;
  setIsMobileDrawerOpen: (open: boolean) => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  matchesCount,
  playersCount,
  isAdmin,
  isGuest,
  isMobileDrawerOpen,
  setIsMobileDrawerOpen
}) => {
  const navItems = [
    {
      id: 'dashboard',
      label: 'Accueil',
      icon: Home,
      badge: null
    },
    {
      id: 'matches',
      label: 'Matchs & Planning',
      icon: Calendar,
      badge: matchesCount > 0 ? String(matchesCount) : null
    },
    {
      id: 'players',
      label: 'Joueurs & Niveaux',
      icon: Users,
      badge: playersCount > 0 ? String(playersCount) : null
    },
    {
      id: 'finances',
      label: 'Comptabilité',
      icon: TrendingUp,
      badge: null
    },
    ...(isAdmin ? [{
      id: 'settings',
      label: 'Paramètres Club',
      icon: SettingsIcon,
      badge: 'Admin'
    }] : [])
  ];

  const handleTabClick = (tabId: string) => {
    onSelectTab(tabId);
    setIsMobileDrawerOpen(false);
  };

  return (
    <>
      {/* Desktop Navigation Tabs */}
      <nav className="mb-6 hidden lg:flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200/90 shadow-2xs">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                isActive
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100/70'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>{item.label}</span>
              {item.badge && (
                <span className={`px-1.5 py-0.2 text-[10px] rounded-md font-bold ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : (item.badge === 'Admin' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-600')
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Mobile Drawer Navigation */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            onClick={() => setIsMobileDrawerOpen(false)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
          />

          {/* Drawer Panel */}
          <div className="relative ml-0 flex flex-col w-72 max-w-[85vw] bg-white h-full shadow-2xl p-5 z-10 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2 font-black text-slate-900 text-base">
                <span>🎾</span>
                <span>Padel Manager</span>
              </div>
              <button
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5 flex-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleTabClick(item.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className={`px-2 py-0.5 text-[10px] rounded-md font-bold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : (item.badge === 'Admin' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-600')
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-2 py-2 shadow-lg">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {navItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
                  isActive ? 'text-emerald-600 font-bold' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span className="text-[10px] tracking-tight">{item.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
