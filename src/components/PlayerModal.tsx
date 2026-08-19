import React, { useState, useEffect, useMemo } from 'react';
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
import { savePlayer } from '../services/padelService';
import { 
  UserPlus, 
  X, 
  Shuffle, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Sparkles,
  KeyRound,
  Shield,
  CreditCard
} from 'lucide-react';

interface PlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerToEdit?: Player | null;
  existingPlayers: Player[];
  onSaved?: () => void;
}

const QUICK_EMOJIS = ['🎾', '⚡', '🏆', '🔥', '🚀', '🎯', '🦇', '🥇', '💪', '👑'];

export const PlayerModal: React.FC<PlayerModalProps> = ({
  isOpen,
  onClose,
  playerToEdit,
  existingPlayers,
  onSaved
}) => {
  const isEditing = !!playerToEdit;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [emoji, setEmoji] = useState('🎾');
  const [dominantHand, setDominantHand] = useState<DominantHand>('Droitier');
  const [preferredSide, setPreferredSide] = useState<PreferredSide>('Polyvalent');
  const [federation, setFederation] = useState<Federation>('Aucune');
  const [level, setLevel] = useState<PlayerLevel>('Aucun niveau défini');
  const [phone, setPhone] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCreditor, setIsCreditor] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number>(0);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Helper to generate an unused random 4-digit code
  const generateUniqueRandomCode = () => {
    let newCode = '';
    let attempts = 0;
    const usedCodes = new Set(
      existingPlayers
        .filter(p => p.id !== playerToEdit?.id)
        .map(p => (p.accessCode || '').trim())
    );

    do {
      newCode = String(Math.floor(1000 + Math.random() * 9000));
      attempts++;
    } while (usedCodes.has(newCode) && attempts < 100);

    setAccessCode(newCode);
  };

  // Reset or initialize form when opening
  useEffect(() => {
    if (!isOpen) return;

    if (playerToEdit) {
      setName(playerToEdit.name || '');
      setEmail(playerToEdit.email || '');
      setAccessCode(playerToEdit.accessCode || '');
      setEmoji(playerToEdit.emoji || '🎾');
      setDominantHand((playerToEdit.dominantHand as DominantHand) || 'Droitier');
      setPreferredSide((playerToEdit.preferredSide as PreferredSide) || 'Polyvalent');
      setFederation((playerToEdit.federation as Federation) || 'Aucune');
      setLevel((playerToEdit.level as PlayerLevel) || 'Aucun niveau défini');
      setPhone(playerToEdit.phone || '');
      setIsAdmin(playerToEdit.isAdmin || false);
      setIsCreditor(playerToEdit.isCreditor || false);
      setCreditBalance(playerToEdit.creditBalance || 0);
    } else {
      setName('');
      setEmail('');
      setEmoji('🎾');
      setDominantHand('Droitier');
      setPreferredSide('Polyvalent');
      setFederation('Aucune');
      setLevel('Aucun niveau défini');
      setPhone('');
      setIsAdmin(false);
      setIsCreditor(false);
      setCreditBalance(0);
      generateUniqueRandomCode();
    }
    setSubmitError(null);
  }, [isOpen, playerToEdit]);

  // Real-time verification of code duplicate
  const trimmedCode = accessCode.trim();
  const conflictingPlayer = useMemo(() => {
    if (!trimmedCode) return null;
    return existingPlayers.find(p => {
      // Ignore the current player when editing
      if (playerToEdit && p.id === playerToEdit.id) return false;
      return (p.accessCode || '').trim() === trimmedCode;
    }) || null;
  }, [trimmedCode, existingPlayers, playerToEdit]);

  const isCodeDuplicate = !!conflictingPlayer;
  const isFormValid = name.trim().length > 0 && trimmedCode.length > 0 && !isCodeDuplicate && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const selectedLevelObj = PLAYER_LEVELS.find(l => l.label === level);
      const levelSortValue = selectedLevelObj ? selectedLevelObj.sortValue : 0;

      await savePlayer({
        id: playerToEdit ? playerToEdit.id : undefined,
        name: name.trim(),
        email: email.trim(),
        accessCode: trimmedCode,
        emoji: emoji.trim() || '🎾',
        dominantHand,
        preferredSide,
        federation,
        level,
        levelSortValue,
        phone: phone.trim(),
        isAdmin,
        isCreditor,
        creditBalance: isCreditor ? Number(creditBalance) || 0 : 0
      });

      if (onSaved) {
        onSaved();
      }
      onClose();
    } catch (err: any) {
      console.error("Erreur lors de l'enregistrement du joueur:", err);
      setSubmitError(err?.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
      <div 
        className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-7 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs">
            <UserPlus className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
              {isEditing ? `Modifier le joueur : ${playerToEdit?.name}` : 'Ajouter un nouveau joueur'}
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Gestion de la fiche membre et attribution du code PIN unique
            </p>
          </div>
        </div>

        {submitError && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nom & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Nom & Prénom <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Maxime Dupont"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Adresse e-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ex: maxime@padel.be"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          {/* CODE PIN UNIQUE & RANDOM GENERATION */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/90 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black text-slate-900 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
                <span>Code de connexion (PIN)</span>
                <span className="text-rose-500">*</span>
              </label>

              <button
                type="button"
                onClick={generateUniqueRandomCode}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 rounded-lg text-[11px] font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
                title="Générer un code à 4 chiffres aléatoire disponible"
              >
                <Shuffle className="w-3 h-3 text-emerald-600" />
                <span>Générer un code aléatoire</span>
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                required
                maxLength={6}
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Ex: 4812"
                className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm font-mono font-black tracking-widest text-slate-950 focus:outline-none focus:ring-2 transition-all ${
                  isCodeDuplicate 
                    ? 'border-rose-400 bg-rose-50/40 text-rose-950 focus:ring-rose-400' 
                    : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                }`}
              />
              {trimmedCode && !isCodeDuplicate && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Code disponible</span>
                </div>
              )}
            </div>

            {/* REAL-TIME CONFLICT ERROR MESSAGE */}
            {isCodeDuplicate && (
              <div className="p-3 bg-rose-100/80 border border-rose-300 rounded-xl text-xs font-bold text-rose-800 flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p>Ce code est déjà attribué. Veuillez en choisir un autre.</p>
                  <p className="text-[11px] text-rose-600 font-normal mt-0.5">Cliquez sur « Générer un code aléatoire » pour en trouver un libre automatiquement.</p>
                </div>
              </div>
            )}
          </div>

          {/* EMOJI */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Emoji / Avatar
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={4}
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="w-16 px-3 py-2 text-center text-lg bg-slate-50 border border-slate-200 rounded-xl font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <div className="flex items-center gap-1 flex-wrap">
                {QUICK_EMOJIS.map(em => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setEmoji(em)}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm border transition-all ${
                      emoji === em 
                        ? 'bg-emerald-100 border-emerald-400 scale-110 shadow-2xs' 
                        : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* NIVEAU JOUEUR (ADMIN) */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Niveau officiel du joueur (Attribué par l'Admin)
            </label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as PlayerLevel)}
              className="w-full px-3.5 py-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {PLAYER_LEVELS.map(lvl => (
                <option key={lvl.label} value={lvl.label}>
                  {lvl.label} (Valeur de tri : {lvl.sortValue})
                </option>
              ))}
            </select>
          </div>

          {/* MAIN, CÔTÉ & FÉDÉRATIONS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Main dominante</label>
              <select
                value={dominantHand}
                onChange={(e) => setDominantHand(e.target.value as DominantHand)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                {DOMINANT_HANDS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Côté préféré</label>
              <select
                value={preferredSide}
                onChange={(e) => setPreferredSide(e.target.value as PreferredSide)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                {PREFERRED_SIDES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Fédération</label>
              <select
                value={federation}
                onChange={(e) => setFederation(e.target.value as Federation)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                {FEDERATIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          {/* TELEPHONE (OPTIONNEL) */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Numéro de téléphone (facultatif)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex: +32 470 12 34 56"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* RÔLES & CRÉANCES */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
              />
              <span className="text-xs font-bold text-slate-900">
                Droits d'Administrateur complets
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isCreditor}
                onChange={(e) => setIsCreditor(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
              />
              <span className="text-xs font-bold text-slate-900">
                Joueur Créancier (avance les frais de réservation)
              </span>
            </label>

            {isCreditor && (
              <div className="pt-2 pl-6">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Solde de la créance initiale (€)
                </label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={creditBalance}
                  onChange={(e) => setCreditBalance(Number(e.target.value))}
                  className="w-36 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}
          </div>

          {/* SUBMIT BUTTONS */}
          <div className="flex gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!isFormValid}
              className={`flex-1 py-3 px-4 text-white text-xs font-bold rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 ${
                isFormValid 
                  ? 'bg-slate-900 hover:bg-slate-800 active:scale-98 cursor-pointer' 
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isEditing ? 'Enregistrer les modifications' : 'Créer le joueur'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
