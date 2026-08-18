import React, { useState, useEffect } from 'react';
import { Player, CourtSlot, Match } from '../types';
import { X, Check, Trash2, UserPlus, ShieldCheck, Clock, Wallet, AlertCircle } from 'lucide-react';

interface AssignPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  courtId: string;
  courtName: string;
  slot: CourtSlot | null;
  match: Match | null;
  players: Player[];
  isAdmin?: boolean;
  isUser?: boolean;
  isGuest?: boolean;
  currentUserPlayerId?: string | null;
  onSave: (
    courtId: string,
    slot: CourtSlot,
    selectedPlayer: Player | null,
    paymentStatus: 'pending' | 'paid',
    paidToCreditorId: string | null
  ) => Promise<void>;
  onAddNewPlayerQuick: (name: string, role: 'player' | 'creditor') => Promise<Player>;
}

export const AssignPlayerModal: React.FC<AssignPlayerModalProps> = ({
  isOpen,
  onClose,
  courtId,
  courtName,
  slot,
  match,
  players,
  isAdmin = false,
  isUser = false,
  isGuest = false,
  currentUserPlayerId = null,
  onSave,
  onAddNewPlayerQuick
}) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid'>('pending');
  const [paidToCreditorId, setPaidToCreditorId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerRole, setNewPlayerRole] = useState<'player' | 'creditor'>('player');

  const creditors = players.filter(p => p.role === 'creditor');

  useEffect(() => {
    if (slot) {
      setSelectedPlayerId(slot.playerId || '');
      setPaymentStatus(slot.paymentStatus || 'pending');
      setPaidToCreditorId(slot.paidToCreditorId || (creditors.length > 0 ? creditors[0].id : ''));
    }
  }, [slot, creditors]);

  if (!isOpen || !slot || !match) return null;

  const selectedPlayer = players.find(p => p.id === selectedPlayerId);
  const isCreditor = selectedPlayer?.role === 'creditor';
  const isSlotAssignedToCurrentUser = slot.playerId && currentUserPlayerId && slot.playerId === currentUserPlayerId;
  const isSlotAssignedToOther = slot.playerId && (!currentUserPlayerId || slot.playerId !== currentUserPlayerId);
  const canModifyThisSlot = isAdmin || isSlotAssignedToCurrentUser || !slot.playerId;

  // Format position label
  const getPositionLabel = (pos: string) => {
    switch (pos) {
      case 'teamA_left': return 'Équipe A - Joueur A1 (Revers)';
      case 'teamA_right': return 'Équipe A - Joueur A2 (Drive)';
      case 'teamB_left': return 'Équipe B - Joueur B1 (Revers)';
      case 'teamB_right': return 'Équipe B - Joueur B2 (Drive)';
      default: return pos;
    }
  };

  const handlePlayerChange = (playerId: string) => {
    setSelectedPlayerId(playerId);
    const p = players.find(x => x.id === playerId);
    if (p && p.role === 'creditor') {
      setPaymentStatus('paid');
      setPaidToCreditorId(p.id);
    } else {
      if (paymentStatus === 'paid' && !paidToCreditorId && creditors.length > 0) {
        setPaidToCreditorId(creditors[0].id);
      }
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    try {
      const name = newPlayerName.trim();
      const role = newPlayerRole;
      setNewPlayerName('');
      setShowQuickAdd(false);
      const created = await onAddNewPlayerQuick(name, role);
      setSelectedPlayerId(created.id);
      if (created.role === 'creditor') {
        setPaymentStatus('paid');
        setPaidToCreditorId(created.id);
      }
    } catch (err: any) {
      console.error("Erreur création rapide:", err);
      alert("Erreur lors de la création du joueur : " + (err?.message || err));
    }
  };

  const handleSubmit = async () => {
    const playerToAssign = selectedPlayerId ? (players.find(p => p.id === selectedPlayerId) || null) : null;
    
    let finalStatus: 'pending' | 'paid' = paymentStatus;
    let finalCreditorId: string | null = paidToCreditorId;

    if (playerToAssign?.role === 'creditor') {
      finalStatus = 'paid';
      finalCreditorId = playerToAssign.id;
    } else if (finalStatus === 'pending') {
      finalCreditorId = null;
    }

    // Immediate optimistic modal close & state reset
    onClose();
    setIsSaving(false);

    try {
      await onSave(
        courtId,
        slot,
        playerToAssign,
        finalStatus,
        finalStatus === 'paid' ? finalCreditorId : null
      );
    } catch (error: any) {
      console.error("Erreur d'assignation:", error);
      alert("Erreur lors de l'enregistrement de l'assignation : " + (error?.message || error));
    }
  };

  const handleFreeSlot = async () => {
    // Immediate optimistic modal close & state reset
    onClose();
    setIsSaving(false);

    try {
      await onSave(courtId, slot, null, 'pending', null);
    } catch (error: any) {
      console.error("Erreur lors de la libération du créneau:", error);
      alert("Erreur lors de la libération du créneau : " + (error?.message || error));
    }
  };

  const handleSelfAssign = () => {
    if (currentUserPlayerId) {
      handlePlayerChange(currentUserPlayerId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        id="assign-player-modal"
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div>
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-blue-600">
              {courtName}
            </span>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              {getPositionLabel(slot.position)}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
          {/* Match Context Pill */}
          <div className="flex items-center justify-between p-3 sm:p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100 text-xs">
            <span className="text-blue-800 font-semibold">
              Match du {new Date(match.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            <span className="font-bold text-blue-900">
              Tarif : {match.pricePerPlayer.toFixed(2)} €
            </span>
          </div>

          {/* If slot is occupied by someone else and user is NOT admin */}
          {!canModifyThisSlot ? (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm mx-auto">
                {slot.playerName?.slice(0, 2).toUpperCase() || 'P'}
              </div>
              <h4 className="text-sm font-bold text-slate-900">
                Emplacement occupé par {slot.playerName}
              </h4>
              <p className="text-xs text-amber-800 leading-relaxed max-w-sm mx-auto">
                Ce créneau est déjà réservé par ce joueur. Seul l'administrateur ou le joueur concerné peut modifier ou libérer cette place.
              </p>
            </div>
          ) : (
            <>
              {/* Quick 1-click self assignment button if user is connected as a player and slot is empty */}
              {isUser && currentUserPlayerId && !slot.playerId && (
                <button
                  type="button"
                  onClick={handleSelfAssign}
                  className="w-full p-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer min-h-[48px]"
                >
                  <Check className="w-4 h-4" />
                  <span>M'inscrire sur ce terrain (Je participe)</span>
                </button>
              )}

              {/* Player Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {isAdmin ? "Choisir un joueur" : "Joueur assigné"}
                  </label>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setShowQuickAdd(!showQuickAdd)}
                      className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors min-h-[36px]"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      {showQuickAdd ? 'Annuler l\'ajout' : '+ Nouveau joueur'}
                    </button>
                  )}
                </div>

                {isAdmin && showQuickAdd ? (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <input
                      type="text"
                      placeholder="Nom & Prénom du joueur"
                      value={newPlayerName}
                      onChange={(e) => setNewPlayerName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-base sm:text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 min-h-[44px] sm:min-h-[38px]"
                      autoFocus
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setNewPlayerRole('player')}
                        className={`min-h-[44px] py-2 px-3 text-xs font-bold rounded-xl border text-center transition-all ${
                          newPlayerRole === 'player'
                            ? 'bg-blue-50 text-blue-800 border-blue-200 shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Joueur Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewPlayerRole('creditor')}
                        className={`min-h-[44px] py-2 px-3 text-xs font-bold rounded-xl border text-center transition-all ${
                          newPlayerRole === 'creditor'
                            ? 'bg-purple-50 text-purple-800 border-purple-200 shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        ★ Créancier
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleQuickAdd}
                      disabled={!newPlayerName.trim()}
                      className="w-full min-h-[44px] py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 active:scale-98 disabled:opacity-50 transition-all shadow-sm"
                    >
                      Ajouter et sélectionner
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 max-h-52 overflow-y-auto pr-1">
                    <button
                      type="button"
                      onClick={() => setSelectedPlayerId('')}
                      className={`min-h-[48px] flex items-center justify-between p-3 sm:p-3.5 rounded-2xl border text-xs font-medium transition-all text-left active:scale-99 ${
                        selectedPlayerId === ''
                          ? 'bg-blue-50/50 border-blue-300 text-blue-900 font-bold'
                          : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <span>— Laisser cette place libre —</span>
                      {selectedPlayerId === '' && <Check className="w-4 h-4 text-blue-600" />}
                    </button>

                    {players.map((p) => {
                      const isCred = p.role === 'creditor';
                      const isSelected = selectedPlayerId === p.id;
                      const isMe = currentUserPlayerId === p.id;

                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handlePlayerChange(p.id)}
                          className={`min-h-[48px] flex items-center justify-between p-3 sm:p-3.5 rounded-2xl border text-xs transition-all text-left active:scale-99 ${
                            isSelected
                              ? 'bg-blue-50/50 border-blue-300 text-slate-900 font-bold shadow-2xs'
                              : 'bg-white border-slate-100 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-slate-700 shrink-0"
                              style={{ backgroundColor: p.avatarColor || '#E0F2FE' }}
                            >
                              {p.name.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-semibold text-xs sm:text-sm truncate">{p.name}</span>
                            {isMe && (
                              <span className="px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-800 text-[10px] font-bold shrink-0">
                                Vous
                              </span>
                            )}
                            {isCred && (
                              <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold shrink-0">
                                Créancier
                              </span>
                            )}
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Payment Status & Creditor selection (only visible if Admin or Creditor) */}
              {selectedPlayerId && (
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                    Règlement de la présence ({match.pricePerPlayer.toFixed(2)} €)
                  </label>

                  {isCreditor ? (
                    <div className="p-3.5 bg-purple-50/70 border border-purple-100 rounded-2xl text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-purple-900">
                        <ShieldCheck className="w-4 h-4 text-purple-700" />
                        Auto-dette créancier
                      </div>
                      <p className="text-purple-800 text-[11px] leading-relaxed">
                        Ce joueur est un créancier. Sa participation de {match.pricePerPlayer.toFixed(2)} € est 
                        automatiquement déduite de son avance globale. Rien à régler en cash.
                      </p>
                    </div>
                  ) : isAdmin ? (
                    <div className="space-y-2.5">
                      {/* Status Toggle Buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentStatus('pending')}
                          className={`min-h-[44px] p-2.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                            paymentStatus === 'pending'
                              ? 'bg-amber-50 text-amber-900 border-amber-300 shadow-2xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Clock className="w-4 h-4 text-amber-600" />
                          En attente
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setPaymentStatus('paid');
                            if (!paidToCreditorId && creditors.length > 0) {
                              setPaidToCreditorId(creditors[0].id);
                            }
                          }}
                          className={`min-h-[44px] p-2.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                            paymentStatus === 'paid'
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-300 shadow-2xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Check className="w-4 h-4 text-emerald-600" />
                          Payé
                        </button>
                      </div>

                      {/* If Paid: Select which creditor was reimbursed */}
                      {paymentStatus === 'paid' && (
                        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 animate-in fade-in">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                            <Wallet className="w-3.5 h-3.5 text-blue-600" />
                            <span>Remboursé à quel créancier ?</span>
                          </div>
                          
                          {creditors.length === 0 ? (
                            <p className="text-[11px] text-amber-700 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Aucun créancier enregistré. Créez un créancier dans l'onglet Joueurs.
                            </p>
                          ) : (
                            <select
                              value={paidToCreditorId}
                              onChange={(e) => setPaidToCreditorId(e.target.value)}
                              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-base sm:text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 min-h-[44px] sm:min-h-[38px]"
                            >
                              {creditors.map((cr) => (
                                <option key={cr.id} value={cr.id}>
                                  {cr.name} (Avance: {cr.advanceAmount} €)
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-500">
                      Statut de paiement : <span className="font-bold text-amber-700">En attente</span> (géré par l'administrateur et les créanciers).
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-t border-slate-100 bg-slate-50/50 gap-2 shrink-0">
          {!canModifyThisSlot ? (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl shadow-sm transition-all min-h-[44px]"
              >
                Fermer
              </button>
            </div>
          ) : (
            <>
              {slot.playerId && (isAdmin || isSlotAssignedToCurrentUser) ? (
                <button
                  type="button"
                  onClick={handleFreeSlot}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition-colors min-h-[44px]"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden xs:inline">{isSlotAssignedToCurrentUser ? "Me désister / Libérer" : "Libérer la place"}</span>
                  <span className="xs:hidden">Libérer</span>
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-colors min-h-[44px]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 min-h-[44px]"
                >
                  {isSaving ? 'Enregistrement...' : 'Confirmer'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
