import React, { useState, useMemo } from 'react';
import { 
  Player, 
  PlayerLevel, 
  PLAYER_LEVELS, 
  DOMINANT_HANDS, 
  PREFERRED_SIDES, 
  FEDERATIONS, 
  DominantHand, 
  PreferredSide, 
  Federation 
} from '../types';
import { 
  updatePlayerProfile, 
  deletePlayer, 
  seedInitialPlayers 
} from '../services/padelService';
import { PlayerModal } from './PlayerModal';
import { 
  UserPlus, 
  Search, 
  LayoutGrid, 
  Table as TableIcon, 
  Download, 
  Edit3, 
  Trash2, 
  Sparkles, 
  ShieldCheck, 
  Star, 
  ArrowUpDown, 
  UserCheck, 
  X, 
  Loader2, 
  Save,
  CheckCircle2,
  Mail,
  KeyRound,
  CreditCard
} from 'lucide-react';

interface PlayersProps {
  players: Player[];
  isAdmin: boolean;
  isGuest: boolean;
  currentPlayer: Player | null;
}

export const Players: React.FC<PlayersProps> = ({
  players,
  isAdmin,
  isGuest,
  currentPlayer
}) => {
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'creditors' | 'regular'>('all');
  const [sortField, setSortField] = useState<'name' | 'level' | 'balance'>('level');
  const [sortAsc, setSortAsc] = useState(false);

  // Profile Edit for Current Logged-in User
  const [isEditingMyProfile, setIsEditingMyProfile] = useState(false);
  const [myEmoji, setMyEmoji] = useState(currentPlayer?.emoji || '🎾');
  const [myDominantHand, setMyDominantHand] = useState<DominantHand>((currentPlayer?.dominantHand as DominantHand) || 'Droitier');
  const [myPreferredSide, setMyPreferredSide] = useState<PreferredSide>((currentPlayer?.preferredSide as PreferredSide) || 'Polyvalent');
  const [myFederation, setMyFederation] = useState<Federation>((currentPlayer?.federation as Federation) || 'Aucune');
  const [myPhone, setMyPhone] = useState(currentPlayer?.phone || '');
  const [isSavingMyProfile, setIsSavingMyProfile] = useState(false);
  const [myProfileSuccess, setMyProfileSuccess] = useState(false);

  // Admin Add / Edit Player Modal
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Filtered & Sorted Players
  const processedPlayers = useMemo(() => {
    let list = [...players];

    // Filter by search query
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(p => 
        p.name.toLowerCase().includes(q) || 
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.level && p.level.toLowerCase().includes(q))
      );
    }

    // Filter by role
    if (filterRole === 'creditors') {
      list = list.filter(p => p.isCreditor);
    } else if (filterRole === 'regular') {
      list = list.filter(p => !p.isCreditor);
    }

    // Sort
    list.sort((a, b) => {
      let comp = 0;
      if (sortField === 'level') {
        comp = (a.levelSortValue || 0) - (b.levelSortValue || 0);
      } else if (sortField === 'balance') {
        comp = (a.creditBalance || 0) - (b.creditBalance || 0);
      } else {
        comp = a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
      }
      return sortAsc ? comp : -comp;
    });

    return list;
  }, [players, search, filterRole, sortField, sortAsc]);

  // Handle My Profile Save
  const handleSaveMyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPlayer || isSavingMyProfile) return;

    setIsSavingMyProfile(true);
    setMyProfileSuccess(false);
    try {
      await updatePlayerProfile(currentPlayer.id, {
        emoji: myEmoji,
        dominantHand: myDominantHand,
        preferredSide: myPreferredSide,
        federation: myFederation,
        phone: myPhone
      });
      setMyProfileSuccess(true);
      setTimeout(() => {
        setMyProfileSuccess(false);
        setIsEditingMyProfile(false);
      }, 1500);
    } catch (err) {
      console.error("Erreur sauvegarde profil:", err);
    } finally {
      setIsSavingMyProfile(false);
    }
  };

  // Open Edit Modal for Admin
  const handleOpenEdit = (player: Player) => {
    setEditingPlayer(player);
    setIsAddModalOpen(true);
  };

  // Open Add Modal for Admin
  const handleOpenAdd = () => {
    setEditingPlayer(null);
    setIsAddModalOpen(true);
  };

  // Delete Player (Admin)
  const handleDeletePlayer = async (playerId: string, name: string) => {
    if (!confirm(`Confirmer la suppression définitive du joueur "${name}" ?`)) return;
    try {
      await deletePlayer(playerId);
    } catch (err) {
      console.error("Erreur suppression joueur:", err);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = ['Nom', 'Email', 'Code Accès', 'Rôle', 'Solde Créance (€)', 'Niveau', 'Main', 'Côté Préféré', 'Fédération'];
    const rows = players.map(p => [
      `"${p.name}"`,
      `"${p.email || ''}"`,
      `"${isAdmin ? (p.accessCode || '') : '***'}"`,
      p.isAdmin ? '"Admin"' : (p.isCreditor ? '"Créancier"' : '"Joueur"'),
      p.creditBalance || 0,
      `"${p.level}"`,
      `"${p.dominantHand}"`,
      `"${p.preferredSide}"`,
      `"${p.federation}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `padel_membres_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. BANDEAU "MON PROFIL" (pour joueur connecté) */}
      {currentPlayer && (
        <div className="bg-linear-to-r from-slate-900 to-slate-800 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-slate-700">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0 shadow-xs border border-white/20"
                style={{ backgroundColor: currentPlayer.avatarColor || '#E0F2FE' }}
              >
                {currentPlayer.emoji || '🎾'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-white">{currentPlayer.name}</h3>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Mon Profil Actif
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  {currentPlayer.level} • {currentPlayer.dominantHand} • {currentPlayer.preferredSide} • {currentPlayer.federation}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setMyEmoji(currentPlayer.emoji || '🎾');
                setMyDominantHand((currentPlayer.dominantHand as DominantHand) || 'Droitier');
                setMyPreferredSide((currentPlayer.preferredSide as PreferredSide) || 'Polyvalent');
                setMyFederation((currentPlayer.federation as Federation) || 'Aucune');
                setMyPhone(currentPlayer.phone || '');
                setIsEditingMyProfile(!isEditingMyProfile);
              }}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 active:scale-98 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 w-fit"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditingMyProfile ? 'Fermer la modification' : 'Modifier mes préférences'}</span>
            </button>
          </div>

          {/* Quick Edit Drawer for My Profile */}
          {isEditingMyProfile && (
            <form onSubmit={handleSaveMyProfile} className="mt-5 pt-5 border-t border-slate-700/80 space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-slate-900">
                {/* Emoji */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">Emoji / Symbole</label>
                  <input
                    type="text"
                    value={myEmoji}
                    onChange={(e) => setMyEmoji(e.target.value)}
                    maxLength={4}
                    placeholder="🎾"
                    className="w-full px-3 py-2 bg-white rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Dominant Hand */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">Main dominante</label>
                  <select
                    value={myDominantHand}
                    onChange={(e) => setMyDominantHand(e.target.value as DominantHand)}
                    className="w-full px-3 py-2 bg-white rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {DOMINANT_HANDS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                {/* Preferred Side */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">Côté préféré</label>
                  <select
                    value={myPreferredSide}
                    onChange={(e) => setMyPreferredSide(e.target.value as PreferredSide)}
                    className="w-full px-3 py-2 bg-white rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {PREFERRED_SIDES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Federation */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">Fédération</label>
                  <select
                    value={myFederation}
                    onChange={(e) => setMyFederation(e.target.value as Federation)}
                    className="w-full px-3 py-2 bg-white rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {FEDERATIONS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                {myProfileSuccess && (
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Modifié avec succès !
                  </span>
                )}
                <button
                  type="submit"
                  disabled={isSavingMyProfile}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingMyProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Enregistrer mes infos
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* 2. HEADER & ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">
              Groupe Padel
            </span>
            <span className="text-xs text-slate-400 font-semibold">
              {players.length} joueur(s) inscrits
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Gestion des Joueurs & Niveaux
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="Exporter l'annuaire au format CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          {isAdmin && (
            <>
              {players.length === 0 && (
                <button
                  onClick={() => seedInitialPlayers()}
                  className="px-3.5 py-2.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-2xl text-xs font-bold transition-colors"
                >
                  Charger démo (8 joueurs)
                </button>
              )}
              <button
                onClick={handleOpenAdd}
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 active:scale-98"
              >
                <UserPlus className="w-4 h-4" />
                <span>Ajouter un Joueur</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 3. FILTERS & CONTROLS */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, email ou niveau..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>

        {/* View Toggle & Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Role Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl text-xs font-bold">
            <button
              onClick={() => setFilterRole('all')}
              className={`px-3 py-1.5 rounded-xl transition-all ${filterRole === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Tous ({players.length})
            </button>
            <button
              onClick={() => setFilterRole('creditors')}
              className={`px-3 py-1.5 rounded-xl transition-all ${filterRole === 'creditors' ? 'bg-white text-purple-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Créanciers ({players.filter(p => p.isCreditor).length})
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-xl transition-all ${viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-400 hover:text-slate-700'}`}
              title="Vue Tableau"
            >
              <TableIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-xl transition-all ${viewMode === 'cards' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-400 hover:text-slate-700'}`}
              title="Vue Cartes"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. MAIN LIST (TABLE OR CARDS) */}
      {viewMode === 'table' ? (
        <div className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4 cursor-pointer hover:text-slate-900" onClick={() => { setSortField('name'); setSortAsc(!sortAsc); }}>
                    <div className="flex items-center gap-1">
                      <span>Joueur</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4 cursor-pointer hover:text-slate-900" onClick={() => { setSortField('level'); setSortAsc(!sortAsc); }}>
                    <div className="flex items-center gap-1">
                      <span>Niveau</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4">Main / Côté</th>
                  <th className="py-3.5 px-4">Fédération</th>
                  <th className="py-3.5 px-4 cursor-pointer hover:text-slate-900" onClick={() => { setSortField('balance'); setSortAsc(!sortAsc); }}>
                    <div className="flex items-center gap-1">
                      <span>Créance</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  {isAdmin && <th className="py-3.5 px-4">Code Accès</th>}
                  {isAdmin && <th className="py-3.5 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {processedPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 5} className="py-8 text-center text-slate-400">
                      Aucun joueur correspondant
                    </td>
                  </tr>
                ) : (
                  processedPlayers.map((player) => (
                    <tr key={player.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Name & Avatar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div 
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 text-slate-800"
                            style={{ backgroundColor: player.avatarColor || '#E0F2FE' }}
                          >
                            {player.emoji || '🎾'}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900">{player.name}</span>
                              {player.isAdmin && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-purple-100 text-purple-800">
                                  Admin
                                </span>
                              )}
                              {player.isCreditor && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-800">
                                  Créancier
                                </span>
                              )}
                            </div>
                            {player.email && (
                              <span className="text-[11px] text-slate-400 block">{player.email}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Level */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-xl inline-block">
                          {player.level}
                        </span>
                      </td>

                      {/* Hand & Side */}
                      <td className="py-3 px-4 text-slate-600">
                        <div>{player.dominantHand}</div>
                        <div className="text-[10px] text-slate-400">{player.preferredSide}</div>
                      </td>

                      {/* Federation */}
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                          player.federation === 'AFP + AFT' 
                            ? 'bg-purple-50 text-purple-700' 
                            : (player.federation === 'AFP' 
                              ? 'bg-blue-50 text-blue-700' 
                              : (player.federation === 'AFT' 
                                ? 'bg-amber-50 text-amber-700' 
                                : 'bg-slate-100 text-slate-500'))
                        }`}>
                          {player.federation}
                        </span>
                      </td>

                      {/* Balance */}
                      <td className="py-3 px-4">
                        {player.isCreditor ? (
                          <span className="font-extrabold text-purple-700 bg-purple-50 px-2 py-1 rounded-xl">
                            {player.creditBalance} €
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Access Code (Admin only) */}
                      {isAdmin && (
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">
                          <span className="bg-slate-100 px-2 py-1 rounded-lg">
                            {player.accessCode || '—'}
                          </span>
                        </td>
                      )}

                      {/* Actions (Admin only) */}
                      {isAdmin && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenEdit(player)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Modifier ce joueur"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeletePlayer(player.id, player.name)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Supprimer ce joueur"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Cards View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {processedPlayers.map((player) => (
            <div 
              key={player.id} 
              className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-sm transition-all relative flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-2xl flex items-center justify-center text-base font-bold shrink-0 text-slate-800"
                      style={{ backgroundColor: player.avatarColor || '#E0F2FE' }}
                    >
                      {player.emoji || '🎾'}
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900 leading-tight">
                        {player.name}
                      </h4>
                      <div className="flex items-center gap-1 mt-0.5">
                        {player.isAdmin && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-purple-100 text-purple-800">
                            Admin
                          </span>
                        )}
                        {player.isCreditor && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-800">
                            Créancier ({player.creditBalance}€)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(player)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeletePlayer(player.id, player.name)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Attributes Pill grid */}
                <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Niveau :</span>
                    <span className="font-bold text-slate-800">{player.level}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Main / Côté :</span>
                    <span className="font-semibold text-slate-700">{player.dominantHand} • {player.preferredSide}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fédération :</span>
                    <span className="font-bold text-slate-700">{player.federation}</span>
                  </div>
                </div>
              </div>

              {isAdmin && player.accessCode && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1">
                    <KeyRound className="w-3 h-3 text-slate-400" />
                    Code d'accès :
                  </span>
                  <span className="font-mono font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                    {player.accessCode}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 5. ADMIN ADD / EDIT PLAYER MODAL */}
      <PlayerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        playerToEdit={editingPlayer}
        existingPlayers={players}
      />
    </div>
  );
};
