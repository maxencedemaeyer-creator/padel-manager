import React, { useState } from 'react';
import { User } from '../firebase';
import { Player, PlayerRole } from '../types';
import { Check, Search, UserCheck, ShieldCheck, Plus, Sparkles, X, ChevronDown, UserPlus, Eye } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  user: User | null;
  players: Player[];
  onLinkPlayer: (playerId: string) => Promise<void>;
  onCreateAndLinkPlayer?: (name: string, role?: PlayerRole) => Promise<void>;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  user,
  players,
  onLinkPlayer,
  onCreateAndLinkPlayer,
  onClose
}) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [newPlayerName, setNewPlayerName] = useState<string>(user?.displayName || '');
  const [newPlayerRole, setNewPlayerRole] = useState<PlayerRole>('player');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen || !user) return null;

  // Unlinked players or players matching current user
  const unlinkedPlayers = players.filter(p => {
    const isUnlinked = !p.linkedUid && !p.authUid;
    const isCurrentUser = p.linkedUid === user.uid || p.authUid === user.uid;
    return isUnlinked || isCurrentUser;
  });

  const filteredPlayers = unlinkedPlayers.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.email && p.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleConfirmLink = async () => {
    if (!selectedPlayerId || isSubmitting) return;
    const targetId = selectedPlayerId;
    setIsSubmitting(true);
    try {
      await onLinkPlayer(targetId);
      onClose();
    } catch (error: any) {
      console.error("Erreur lors de l'association du compte:", error);
      alert("Erreur lors de l'association du profil : " + (error?.message || error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAndLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim() || !onCreateAndLinkPlayer || isSubmitting) return;
    const name = newPlayerName.trim();
    const role = newPlayerRole;
    setIsSubmitting(true);
    try {
      await onCreateAndLinkPlayer(name, role);
      onClose();
    } catch (error: any) {
      console.error("Erreur lors de la création du joueur:", error);
      alert("Erreur lors de la création du profil : " + (error?.message || error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        id="auth-onboarding-modal"
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50/50 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Connexion Google réussie</span>
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <h3 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
            Bonjour {user.displayName || 'Joueur'}, quel joueur es-tu ?
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Associez votre compte Google à votre profil joueur pour suivre vos matchs, vos présences et vos règlements.
          </p>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1 mt-4 p-1 bg-slate-200/70 rounded-2xl">
            <button
              type="button"
              onClick={() => setMode('select')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 min-h-[38px] ${
                mode === 'select'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Choisir dans la liste ({unlinkedPlayers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('create')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 min-h-[38px] ${
                mode === 'create'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 text-emerald-600" />
              <span>Créer un nouveau profil</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
          {mode === 'select' ? (
            <div className="space-y-3">
              {/* Option A: Dropdown / List of existing unlinked players */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Sélectionnez votre nom dans l'effectif :
                </label>

                {unlinkedPlayers.length > 5 && (
                  <div className="relative mb-2.5">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filtrer les joueurs non liés..."
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 min-h-[40px]"
                    />
                  </div>
                )}

                {/* Direct Selector / Dropdown list */}
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {filteredPlayers.length === 0 ? (
                    <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                      <p className="text-xs font-semibold text-slate-500">
                        {searchQuery ? 'Aucun joueur trouvé pour cette recherche.' : 'Tous les joueurs existants sont déjà associés à un compte.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setMode('create')}
                        className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Créer un nouveau profil joueur</span>
                      </button>
                    </div>
                  ) : (
                    filteredPlayers.map((player) => {
                      const isSelected = selectedPlayerId === player.id;
                      const isCreditor = player.role === 'creditor';

                      return (
                        <div
                          key={player.id}
                          onClick={() => setSelectedPlayerId(player.id)}
                          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-blue-50/90 border-blue-500 shadow-2xs'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shadow-2xs text-slate-700 shrink-0"
                              style={{ backgroundColor: player.avatarColor || '#DBEAFE' }}
                            >
                              {player.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-900 truncate">
                                  {player.name}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    isCreditor
                                      ? 'bg-purple-100 text-purple-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  {isCreditor ? '👑 Créancier' : '🎾 Joueur'}
                                </span>
                              </div>
                              {player.email && (
                                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {player.email}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                                isSelected
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Option B: Create New Player Form */
            <form onSubmit={handleCreateAndLink} className="space-y-4">
              <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100 space-y-3">
                <label className="block text-xs font-bold text-emerald-900">
                  Nom du nouveau joueur :
                </label>
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Ex: Thomas V., Julien B."
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-white border border-emerald-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 min-h-[44px]"
                />

                <div className="pt-2">
                  <label className="block text-xs font-bold text-emerald-900 mb-1.5">
                    Statut / Rôle :
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewPlayerRole('player')}
                      className={`p-3 rounded-xl border text-xs font-bold text-left transition-all ${
                        newPlayerRole === 'player'
                          ? 'bg-white border-emerald-500 text-emerald-900 shadow-2xs'
                          : 'bg-white/60 border-emerald-200 text-slate-600 hover:bg-white'
                      }`}
                    >
                      <span className="block font-bold">🎾 Joueur Standard</span>
                      <span className="block text-[10px] text-slate-500 font-normal mt-0.5">Règle sa part à chaque match</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewPlayerRole('creditor')}
                      className={`p-3 rounded-xl border text-xs font-bold text-left transition-all ${
                        newPlayerRole === 'creditor'
                          ? 'bg-white border-purple-500 text-purple-900 shadow-2xs'
                          : 'bg-white/60 border-purple-200 text-slate-600 hover:bg-white'
                      }`}
                    >
                      <span className="block font-bold">👑 Créancier</span>
                      <span className="block text-[10px] text-slate-500 font-normal mt-0.5">A avancé les fonds de la saison</span>
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-emerald-800 pt-1">
                  Ce profil sera enregistré dans Firestore et automatiquement associé à votre compte Google (<strong>{user.email}</strong>).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors min-h-[44px]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!newPlayerName.trim() || isSubmitting}
                  className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 min-h-[44px]"
                >
                  {isSubmitting ? 'Création...' : 'Créer et associer'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer (Option C: Continue as guest + Action Confirm) */}
        {mode === 'select' && (
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 shrink-0 gap-2 sm:gap-3">
            {/* Option C: Continuer comme invité / spectateur */}
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors min-h-[44px] inline-flex items-center justify-center gap-1.5 order-2 sm:order-1"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Continuer comme invité / spectateur</span>
            </button>

            {/* Option A: Associer mon compte */}
            <button
              type="button"
              onClick={handleConfirmLink}
              disabled={!selectedPlayerId || isSubmitting}
              className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 min-h-[44px] inline-flex items-center justify-center gap-2 order-1 sm:order-2"
            >
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>{isSubmitting ? 'Association en cours...' : 'Associer mon compte'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
