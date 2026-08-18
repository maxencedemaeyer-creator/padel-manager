import React, { useState } from 'react';
import { User } from '../firebase';
import { Player } from '../types';
import { Check, Search, UserCheck, ShieldCheck, Plus, Sparkles, X } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  user: User | null;
  players: Player[];
  onLinkPlayer: (playerId: string) => Promise<void>;
  onCreateAndLinkPlayer?: (name: string) => Promise<void>;
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showCreateInput, setShowCreateInput] = useState<boolean>(false);
  const [newPlayerName, setNewPlayerName] = useState<string>(user?.displayName || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen || !user) return null;

  // Filter players matching search query
  const filteredPlayers = players.filter(p => {
    const nameMatch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return nameMatch;
  });

  const handleConfirm = async () => {
    if (!selectedPlayerId) return;
    setIsSubmitting(true);
    try {
      await onLinkPlayer(selectedPlayerId);
      onClose();
    } catch (error) {
      console.error("Erreur lors de la liaison du compte:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAndLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim() || !onCreateAndLinkPlayer) return;
    setIsSubmitting(true);
    try {
      await onCreateAndLinkPlayer(newPlayerName.trim());
      onClose();
    } catch (error) {
      console.error("Erreur lors de la création du joueur:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        id="auth-profile-link-modal"
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100/80 text-blue-800 border border-blue-200">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Connexion réussie</span>
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <h3 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
            Qui êtes-vous dans la liste des joueurs ?
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Associez votre compte <strong>{user.displayName || user.email}</strong> à votre fiche joueur pour personnaliser votre accueil, suivre vos matchs et consulter vos règlements.
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
          {!showCreateInput ? (
            <>
              {/* Search Bar */}
              {players.length > 5 && (
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher votre nom..."
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 min-h-[44px]"
                  />
                </div>
              )}

              {/* Players Radio List */}
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {filteredPlayers.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    Aucun joueur trouvé pour cette recherche.
                  </div>
                ) : (
                  filteredPlayers.map((player) => {
                    const isSelected = selectedPlayerId === player.id;
                    const isCreditor = player.role === 'creditor';
                    const isAlreadyLinked = !!player.authUid && player.authUid !== user.uid;

                    return (
                      <div
                        key={player.id}
                        onClick={() => setSelectedPlayerId(player.id)}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-500 shadow-2xs'
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
                                {isCreditor ? 'Créancier' : 'Joueur'}
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

              {/* Toggle to create profile if not listed */}
              {onCreateAndLinkPlayer && (
                <button
                  type="button"
                  onClick={() => setShowCreateInput(true)}
                  className="w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors min-h-[44px]"
                >
                  <Plus className="w-4 h-4 text-blue-600" />
                  <span>Je ne suis pas dans la liste (Créer mon profil)</span>
                </button>
              )}
            </>
          ) : (
            <form onSubmit={handleCreateAndLink} className="space-y-4">
              <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-100 space-y-3">
                <label className="block text-xs font-bold text-blue-900">
                  Créer votre profil joueur
                </label>
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Nom & Prénom"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-white border border-blue-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 min-h-[44px]"
                />
                <p className="text-[11px] text-blue-700">
                  Ce profil sera enregistré dans Firestore comme joueur standard et lié directement à votre compte Google.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateInput(false)}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors min-h-[44px]"
                >
                  Retour à la liste
                </button>
                <button
                  type="submit"
                  disabled={!newPlayerName.trim() || isSubmitting}
                  className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 min-h-[44px]"
                >
                  {isSubmitting ? 'Création...' : 'Créer et lier'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        {!showCreateInput && (
          <div className="flex items-center justify-between p-4 sm:p-5 border-t border-slate-100 bg-slate-50/60 shrink-0 gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors min-h-[44px]"
            >
              Passer pour le moment
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedPlayerId || isSubmitting}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 min-h-[44px]"
            >
              {isSubmitting ? 'Enregistrement...' : 'Confirmer mon profil'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
