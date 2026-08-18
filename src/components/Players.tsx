import React, { useState } from 'react';
import { Player, Match, PlayerRole } from '../types';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Search, 
  Edit2, 
  Trash2, 
  Phone, 
  Mail, 
  Check, 
  X, 
  Wallet,
  Calendar,
  Sparkles
} from 'lucide-react';

interface PlayersProps {
  players: Player[];
  matches: Match[];
  isAdmin?: boolean;
  isUser?: boolean;
  isGuest?: boolean;
  currentUserPlayerId?: string | null;
  onSavePlayer: (player: Partial<Player> & { name: string }) => Promise<any>;
  onDeletePlayer: (playerId: string) => Promise<void>;
  onSeedDemoPlayers: () => Promise<void>;
}

export const Players: React.FC<PlayersProps> = ({
  players,
  matches,
  isAdmin = false,
  isUser = false,
  isGuest = false,
  currentUserPlayerId = null,
  onSavePlayer,
  onDeletePlayer,
  onSeedDemoPlayers
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'creditor' | 'player'>('all');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    role: PlayerRole;
    advanceAmount: number;
    phone: string;
    email: string;
  }>({
    name: '',
    role: 'player',
    advanceAmount: 0,
    phone: '',
    email: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute stats per player
  const getPlayerStats = (playerId: string) => {
    let matchesCount = 0;
    let pendingPaymentsCount = 0;
    let totalPendingAmount = 0;

    matches.forEach(m => {
      m.courts.forEach(c => {
        c.slots.forEach(s => {
          if (s.playerId === playerId) {
            matchesCount += 1;
            if (s.paymentStatus === 'pending') {
              pendingPaymentsCount += 1;
              totalPendingAmount += m.pricePerPlayer || 12.5;
            }
          }
        });
      });
    });

    return { matchesCount, pendingPaymentsCount, totalPendingAmount };
  };

  const handleOpenAdd = () => {
    setEditingPlayer(null);
    setFormData({
      name: '',
      role: 'player',
      advanceAmount: 0,
      phone: '',
      email: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (player: Player) => {
    setEditingPlayer(player);
    setFormData({
      name: player.name,
      role: player.role,
      advanceAmount: player.advanceAmount || 0,
      phone: player.phone || '',
      email: player.email || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsSubmitting(true);

    const isCreditor = formData.role === 'creditor';
    const amount = isCreditor ? Number(formData.advanceAmount) || 0 : 0;
    const updatedName = formData.name.trim();

    try {
      if (editingPlayer && editingPlayer.id) {
        // Strict Firestore updateDoc on real doc.id
        const playerRef = doc(db, "players", editingPlayer.id);
        await updateDoc(playerRef, {
          name: updatedName,
          isCreditor: isCreditor,
          role: isCreditor ? 'creditor' : 'player',
          status: isCreditor ? 'crediteur' : 'actif',
          advanceAmount: amount,
          creditAmount: amount,
          phone: formData.phone.trim(),
          email: formData.email.trim()
        });
      } else {
        // Creation of new player
        await onSavePlayer({
          name: updatedName,
          role: formData.role,
          isCreditor: isCreditor,
          advanceAmount: amount,
          creditAmount: amount,
          phone: formData.phone.trim(),
          email: formData.email.trim()
        });
      }

      // Close modal ONLY when Firestore write succeeds
      setIsModalOpen(false);
      setEditingPlayer(null);
      setFormData({
        name: '',
        role: 'player',
        advanceAmount: 0,
        phone: '',
        email: ''
      });
    } catch (error: any) {
      console.error("Erreur Firestore updateDoc :", error);
      alert("Échec de l'enregistrement dans la base de données : " + (error?.message || error));
    } finally {
      // Always unblock the submit button
      setIsSubmitting(false);
    }
  };

  const filteredPlayers = players.filter(p => {
    if (roleFilter !== 'all' && p.role !== roleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q) || (p.phone || '').includes(q);
    }
    return true;
  });

  const creditorsCount = players.filter(p => p.role === 'creditor').length;
  const standardPlayersCount = players.filter(p => p.role === 'player').length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
              Groupe Padel
            </span>
            <span className="text-xs text-slate-400 font-medium">
              {players.length} membre(s) • {creditorsCount} créancier(s)
            </span>
            {isAdmin && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800">
                👑 Droits Admin
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Annuaire des Joueurs
          </h2>
        </div>

        {isAdmin ? (
          <div className="flex items-center gap-2">
            {players.length === 0 && (
              <button
                onClick={onSeedDemoPlayers}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Charger joueurs démo
              </button>
            )}
            <button
              id="btn-add-player"
              onClick={handleOpenAdd}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-all"
            >
              <UserPlus className="w-4 h-4" />
              Ajouter un Joueur
            </button>
          </div>
        ) : (
          <div className="text-xs text-slate-400 font-medium bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-100">
            {isUser ? "Consultation membres • Modifications réservées à l'administrateur" : "Mode Invité • Lecture seule"}
          </div>
        )}
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-3 sm:p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setRoleFilter('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              roleFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            Tous ({players.length})
          </button>
          <button
            onClick={() => setRoleFilter('creditor')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              roleFilter === 'creditor'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
            }`}
          >
            Créanciers ({creditorsCount})
          </button>
          <button
            onClick={() => setRoleFilter('player')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              roleFilter === 'player'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            Joueurs ({standardPlayersCount})
          </button>
        </div>

        <div className="w-full sm:w-64">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Chercher un nom..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Players Cards Grid */}
      {filteredPlayers.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-3xl border border-slate-100 shadow-sm space-y-3">
          <Users className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-600">
            Aucun joueur trouvé.
          </p>
          {!isGuest && (
            <button
              onClick={handleOpenAdd}
              className="text-xs text-blue-600 font-bold hover:underline"
            >
              Ajouter votre premier joueur
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlayers.map(player => {
            const isCreditor = player.role === 'creditor';
            const stats = getPlayerStats(player.id);

            return (
              <div
                key={player.id}
                className={`p-5 rounded-3xl border transition-all space-y-3 bg-white shadow-sm hover:shadow-md ${
                  player.id === currentUserPlayerId
                    ? 'border-blue-400/80 ring-2 ring-blue-500/10'
                    : isCreditor 
                    ? 'border-purple-200/80' 
                    : 'border-slate-100'
                }`}
              >
                {/* Header: Avatar, Name & Role Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm text-slate-800 shrink-0 shadow-xs"
                      style={{ backgroundColor: player.avatarColor || '#E0F2FE' }}
                    >
                      {player.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-bold text-slate-900 truncate">
                          {player.name}
                        </h4>
                        {player.id === currentUserPlayerId && (
                          <span className="px-1.5 py-0.2 rounded-md text-[9px] font-extrabold bg-blue-100 text-blue-800 shrink-0">
                            C'est vous
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {isCreditor ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 inline-flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-purple-600" />
                            Créancier (Avance)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
                            Joueur Standard
                          </span>
                        )}
                        {player.authUid && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ✓ Lié
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(player)}
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                        title="Modifier"
                        aria-label={`Modifier ${player.name}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Supprimer ${player.name} du groupe ?`)) {
                            onDeletePlayer(player.id);
                          }
                        }}
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition-colors"
                        title="Supprimer"
                        aria-label={`Supprimer ${player.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Key Metrics / Advance & Stats */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div className="bg-slate-50 p-3 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">
                      Matchs Joués
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {stats.matchesCount} match(s)
                    </span>
                  </div>

                  <div className={`p-3 rounded-2xl ${isCreditor ? 'bg-purple-50' : 'bg-slate-50'}`}>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">
                      {isCreditor ? 'Avance Initiale' : 'Dette en cours'}
                    </span>
                    <span className={`text-sm font-bold ${
                      isCreditor 
                        ? 'text-purple-900' 
                        : stats.totalPendingAmount > 0 
                          ? 'text-amber-600' 
                          : 'text-emerald-700'
                    }`}>
                      {isCreditor 
                        ? `${(player.advanceAmount || 0).toFixed(2)} €`
                        : `${stats.totalPendingAmount.toFixed(2)} €`}
                    </span>
                  </div>
                </div>

                {/* Contact info if any */}
                {(player.phone || player.email) && (
                  <div className="pt-1 text-xs text-slate-400 space-y-1">
                    {player.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{player.phone}</span>
                      </div>
                    )}
                    {player.email && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{player.email}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Player Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <h3 className="text-base font-bold text-slate-900">
                {editingPlayer ? 'Modifier le joueur' : 'Ajouter un membre'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label="Fermer"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              {/* Name */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Nom & Prénom *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Maxence D."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 min-h-[44px] sm:min-h-[38px]"
                />
              </div>

              {/* Role */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                  Rôle dans le groupe
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, role: 'player' })}
                    className={`min-h-[44px] py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      formData.role === 'player'
                        ? 'bg-blue-50 text-blue-900 border-blue-200 shadow-2xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Joueur Standard
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, role: 'creditor' })}
                    className={`min-h-[44px] py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      formData.role === 'creditor'
                        ? 'bg-purple-50 text-purple-900 border-purple-200 shadow-2xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    ★ Créancier
                  </button>
                </div>
              </div>

              {/* If Creditor: Advance Amount */}
              {formData.role === 'creditor' && (
                <div className="p-4 bg-purple-50/80 rounded-2xl border border-purple-100 space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                    <Wallet className="w-4 h-4 text-purple-700" />
                    Montant de l'avance financière (€)
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 1100.00"
                    value={formData.advanceAmount || ''}
                    onChange={(e) => setFormData({ ...formData, advanceAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3.5 py-2.5 text-base sm:text-sm bg-white border border-purple-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500 font-bold min-h-[44px] sm:min-h-[38px]"
                  />
                  <p className="text-[11px] text-purple-700 leading-tight">
                    Montant total avancé pour la réservation des terrains. Ses participations seront déduites automatiquement.
                  </p>
                </div>
              )}

              {/* Optional Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">
                    Téléphone (optionnel)
                  </label>
                  <input
                    type="tel"
                    placeholder="06 12 34 56 78"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 min-h-[44px] sm:min-h-[38px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">
                    Email (optionnel)
                  </label>
                  <input
                    type="email"
                    placeholder="email@padel.club"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 min-h-[44px] sm:min-h-[38px]"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 active:bg-slate-200 rounded-xl min-h-[44px]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !formData.name.trim()}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50 transition-all min-h-[44px]"
                >
                  {isSubmitting ? 'Enregistrement...' : editingPlayer ? 'Mettre à jour' : 'Créer le joueur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
