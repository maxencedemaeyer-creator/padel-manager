import React, { useState, useEffect } from 'react';
import { ClubSettings, Player, PasswordRequest } from '../types';
import { 
  updateClubSettings, 
  generateSeasonMatches, 
  clearAllMatches, 
  listenPasswordRequests, 
  resolvePasswordRequest 
} from '../services/padelService';
import { PlayerModal } from './PlayerModal';
import { 
  Settings as SettingsIcon, 
  Calendar, 
  KeyRound, 
  Mail, 
  HelpCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Save, 
  Trash2, 
  RotateCw, 
  ShieldCheck, 
  DollarSign, 
  Users,
  Copy,
  Check,
  UserPlus,
  Edit3
} from 'lucide-react';

interface SettingsProps {
  settings: ClubSettings;
  players: Player[];
  matchesCount: number;
  isAdmin: boolean;
}

export const Settings: React.FC<SettingsProps> = ({
  settings,
  players,
  matchesCount,
  isAdmin
}) => {
  const [matchFee, setMatchFee] = useState<number>(settings.matchFeePerPlayer || 10);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Player Add / Edit Modal in Admin Panel
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);
  const [selectedPlayerForEdit, setSelectedPlayerForEdit] = useState<Player | null>(null);

  // Season Generator state
  const [startDate, setStartDate] = useState('2026-09-03');
  const [startTime, setStartTime] = useState('20:00');
  const [seasonWeeks, setSeasonWeeks] = useState(44);
  const [isGeneratingSeason, setIsGeneratingSeason] = useState(false);
  const [genSuccessMsg, setGenSuccessMsg] = useState<string | null>(null);

  // Password requests from players
  const [passwordRequests, setPasswordRequests] = useState<PasswordRequest[]>([]);
  const [copiedCodePlayerId, setCopiedCodePlayerId] = useState<string | null>(null);

  useEffect(() => {
    setMatchFee(settings.matchFeePerPlayer || 10);
  }, [settings]);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = listenPasswordRequests((reqs) => {
      setPasswordRequests(reqs);
    });
    return () => unsub();
  }, [isAdmin]);

  const handleSaveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingSettings) return;

    setIsSavingSettings(true);
    setSaveSuccess(false);
    try {
      await updateClubSettings({
        matchFeePerPlayer: Number(matchFee) || 10
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Erreur enregistrement tarif:", err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleGenerateSeason = async () => {
    if (!confirm(`Générer automatiquement ${seasonWeeks} jeudis de saison (2 terrains par soirée = ${seasonWeeks * 2} matchs) à partir du ${startDate} ?`)) {
      return;
    }

    setIsGeneratingSeason(true);
    setGenSuccessMsg(null);
    try {
      const res = await generateSeasonMatches(startDate, startTime, seasonWeeks);
      setGenSuccessMsg(`Saison générée avec succès ! ${res.count} matchs créés (Terrain 1 & Terrain 2).`);
      setTimeout(() => setGenSuccessMsg(null), 5000);
    } catch (err) {
      console.error("Erreur génération saison:", err);
    } finally {
      setIsGeneratingSeason(false);
    }
  };

  const handleCopyCode = (player: Player) => {
    if (player.accessCode) {
      navigator.clipboard.writeText(player.accessCode);
      setCopiedCodePlayerId(player.id);
      setTimeout(() => setCopiedCodePlayerId(null), 2000);
    }
  };

  const handleResolveReq = async (id: string | undefined) => {
    if (!id) return;
    try {
      await resolvePasswordRequest(id);
    } catch (err) {
      console.error("Erreur résolution demande:", err);
    }
  };

  const handleOpenAddPlayer = () => {
    setSelectedPlayerForEdit(null);
    setIsPlayerModalOpen(true);
  };

  const handleOpenEditPlayer = (player: Player) => {
    setSelectedPlayerForEdit(player);
    setIsPlayerModalOpen(true);
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8 shadow-xs">
        <ShieldCheck className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-800">Espace Administrateur</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Les paramètres du club et la consultation des codes d'accès sont réservés à l'Administrateur (Maxence).
        </p>
      </div>
    );
  }

  const pendingRequests = passwordRequests.filter(r => r.status === 'pending');

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold shadow-2xs">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Panneau Administrateur
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Gestion des joueurs, des codes d'accès, des tarifs et du calendrier
            </p>
          </div>
        </div>

        {/* Action Button: Ajouter un nouveau joueur */}
        <button
          type="button"
          onClick={handleOpenAddPlayer}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-2xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2"
        >
          <UserPlus className="w-4 h-4 text-emerald-400" />
          <span>Ajouter un nouveau joueur</span>
        </button>
      </div>

      {/* 1. ASSISTANCE CODES OUBLIÉS (DEMANDES JOUEURS) */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                Demandes d'assistance reçues ({pendingRequests.length} en attente)
              </h3>
              <p className="text-[11px] text-slate-500">
                Joueurs ayant demandé leur code d'accès perdu via la page de connexion
              </p>
            </div>
          </div>
        </div>

        {passwordRequests.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            Aucune demande d'assistance enregistrée
          </p>
        ) : (
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {passwordRequests.map((req) => (
              <div 
                key={req.id} 
                className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                  req.status === 'pending' 
                    ? 'bg-amber-50/60 border-amber-200/80 text-amber-950' 
                    : 'bg-slate-50 border-slate-200 text-slate-600 opacity-75'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 font-bold">
                    <span>{req.playerName || req.value}</span>
                    <span className="px-2 py-0.2 rounded-md text-[10px] bg-white border border-amber-300/60 font-semibold">
                      {req.requestType === 'email' ? 'Par email' : 'Par prénom/nom'}
                    </span>
                    {req.status === 'resolved' && (
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.2 rounded">
                        Traité
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Valeur saisie : <span className="font-semibold">{req.value}</span> • Reçu le {new Date(req.createdAt).toLocaleString('fr-FR')}
                  </p>
                </div>

                {req.status === 'pending' && (
                  <button
                    onClick={() => handleResolveReq(req.id)}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all w-fit shrink-0"
                  >
                    Marquer comme transmis
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. TABLEAU RÉCAPITULATIF SÉCURISÉ DES CODES D'ACCÈS */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                Annuaire des Codes d'Accès Joueurs ({players.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Liste confidentielle des PINs de connexion avec détection de doublons
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenAddPlayer}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 w-fit"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Nouveau joueur</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px]">
                <th className="py-3 px-3">Joueur</th>
                <th className="py-3 px-3">Email</th>
                <th className="py-3 px-3">Niveau</th>
                <th className="py-3 px-3">Rôle</th>
                <th className="py-3 px-3">Code Unique</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {players.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2 font-bold text-slate-900">
                      <span>{p.emoji || '🎾'}</span>
                      <span>{p.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-500">{p.email || '—'}</td>
                  <td className="py-2.5 px-3">
                    <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                      {p.level}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    {p.isAdmin ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-800">
                        Admin Master
                      </span>
                    ) : p.isCreditor ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                        Créancier
                      </span>
                    ) : (
                      <span className="text-slate-500">Joueur</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-mono font-black text-sm text-slate-950 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg inline-block">
                      {p.accessCode || '—'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleCopyCode(p)}
                        className="px-2.5 py-1 text-slate-600 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold text-[11px] transition-colors inline-flex items-center gap-1"
                        title="Copier le code"
                      >
                        {copiedCodePlayerId === p.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700">Copié !</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copier</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleOpenEditPlayer(p)}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Modifier la fiche joueur"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. TARIF DE PART DE MATCH */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs">
        <h3 className="text-sm sm:text-base font-extrabold text-slate-900 mb-1">
          Tarif par part de joueur
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Montant automatique facturé et déduit lors de chaque validation de présence ({settings.matchFeePerPlayer} € par défaut)
        </p>

        <form onSubmit={handleSaveFee} className="flex items-center gap-3 max-w-sm">
          <div className="relative flex-1">
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              value={matchFee}
              onChange={(e) => setMatchFee(Number(e.target.value))}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">€ / joueur</span>
          </div>

          <button
            type="submit"
            disabled={isSavingSettings}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {isSavingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </button>
        </form>

        {saveSuccess && (
          <p className="text-xs font-bold text-emerald-600 mt-2 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> Tarif mis à jour avec succès !
          </p>
        )}
      </div>

      {/* 4. OUTIL DE GÉNÉRATION AUTOMATIQUE DE SAISON */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
              Générateur Automatique de Saison (44 Jeudis)
            </h3>
            <p className="text-xs text-slate-500">
              Crée les 44 créneaux de la saison 2026/27 (Terrain 1 & Terrain 2)
            </p>
          </div>
        </div>

        <div className="bg-purple-50/60 border border-purple-200/80 rounded-2xl p-4 my-4 text-xs text-purple-950 space-y-2 leading-relaxed">
          <p>
            <strong>Fonctionnement :</strong> À partir du <strong>Jeudi 3 septembre 2026 à 20h00</strong>, le script planifie automatiquement les <strong>44 jeudis consécutifs</strong>.
          </p>
          <p>
            Pour chaque jeudi, <strong>2 matchs distincts</strong> sont créés (Terrain 1 et Terrain 2), représentant 8 places de joueurs par soirée.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Date du 1er jeudi</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Heure de début</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nombre de semaines</label>
            <input
              type="number"
              min="1"
              max="52"
              value={seasonWeeks}
              onChange={(e) => setSeasonWeeks(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <button
            onClick={handleGenerateSeason}
            disabled={isGeneratingSeason}
            className="px-5 py-3 bg-purple-600 hover:bg-purple-700 active:scale-98 text-white rounded-2xl text-xs font-bold shadow-md shadow-purple-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isGeneratingSeason ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Génération des 44 jeudis en cours...
              </>
            ) : (
              <>
                <RotateCw className="w-4 h-4" />
                Générer la saison automatique ({seasonWeeks * 2} matchs)
              </>
            )}
          </button>

          <span className="text-xs text-slate-400 font-medium">
            Matchs actuellement en base : <strong className="text-slate-800">{matchesCount}</strong>
          </span>
        </div>

        {genSuccessMsg && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {genSuccessMsg}
          </div>
        )}
      </div>

      {/* REUSABLE ADD / EDIT PLAYER MODAL */}
      <PlayerModal
        isOpen={isPlayerModalOpen}
        onClose={() => setIsPlayerModalOpen(false)}
        playerToEdit={selectedPlayerForEdit}
        existingPlayers={players}
      />
    </div>
  );
};
