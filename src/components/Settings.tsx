import React, { useState } from 'react';
import { ClubSettings } from '../types';
import { 
  Settings as SettingsIcon, 
  Save, 
  Calendar, 
  Euro, 
  Layers, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Sparkles, 
  Check, 
  AlertTriangle 
} from 'lucide-react';

interface SettingsProps {
  settings: ClubSettings;
  onSaveSettings: (settings: ClubSettings) => Promise<void>;
  onGenerateSeason: (startDate: string) => Promise<number>;
  onSeedDemo: () => Promise<void>;
}

export const Settings: React.FC<SettingsProps> = ({
  settings,
  onSaveSettings,
  onGenerateSeason,
  onSeedDemo
}) => {
  const [courtNames, setCourtNames] = useState<string[]>(settings.courtNames || ["Terrain 1", "Terrain 6"]);
  const [newCourtName, setNewCourtName] = useState('');
  const [seasonMatchesCount, setSeasonMatchesCount] = useState<number>(settings.seasonMatchesCount || 44);
  const [defaultPrice, setDefaultPrice] = useState<number>(settings.defaultPricePerPlayer || 12.50);
  const [clubName, setClubName] = useState<string>(settings.clubName || "Padel Manager Club");
  const [defaultTime, setDefaultTime] = useState<string>(settings.seasonDefaultTime || "19:00");
  const [seasonStartDate, setSeasonStartDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedMsg, setGeneratedMsg] = useState<string | null>(null);

  const handleAddCourt = () => {
    if (!newCourtName.trim()) return;
    setCourtNames([...courtNames, newCourtName.trim()]);
    setNewCourtName('');
  };

  const handleRemoveCourt = (index: number) => {
    if (courtNames.length <= 1) {
      alert("Au moins un terrain est obligatoire.");
      return;
    }
    setCourtNames(courtNames.filter((_, idx) => idx !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveSettings({
        courtNames,
        seasonMatchesCount: Number(seasonMatchesCount) || 44,
        defaultPricePerPlayer: Number(defaultPrice) || 12.50,
        clubName: clubName.trim(),
        seasonDefaultTime: defaultTime
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateSeason = async () => {
    if (!window.confirm(`Voulez-vous générer automatiquement le calendrier de ${seasonMatchesCount} matchs hebdomadaires à partir du ${seasonStartDate} ?`)) {
      return;
    }
    setIsGenerating(true);
    try {
      const count = await onGenerateSeason(seasonStartDate);
      setGeneratedMsg(`${count} matchs de la saison ont été générés avec succès !`);
      setTimeout(() => setGeneratedMsg(null), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
              Configuration du club
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Paramètres Généraux
          </h2>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-700" />
          Les paramètres ont été enregistrés avec succès !
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Terrains & Noms */}
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Layers className="w-4 h-4 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">
              Noms des Terrains par Défaut
            </h3>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Ces terrains seront créés par défaut pour chaque match (par exemple Terrain 1 et Terrain 6).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {courtNames.map((court, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-2xl"
                >
                  <span className="text-xs font-bold text-slate-800">{court}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCourt(idx)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Court */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <input
                type="text"
                placeholder="Ex: Terrain 2 ou Terrain Panoramique"
                value={newCourtName}
                onChange={(e) => setNewCourtName(e.target.value)}
                className="flex-1 px-3.5 py-2.5 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 min-h-[44px] sm:min-h-[38px]"
              />
              <button
                type="button"
                onClick={handleAddCourt}
                disabled={!newCourtName.trim()}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center"
              >
                + Ajouter terrain
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Saison & Tarifs */}
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Euro className="w-4 h-4 text-emerald-600" />
            <h3 className="text-base font-bold text-slate-900">
              Règles de Saison & Tarification
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                Nombre de Matchs Saison
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={seasonMatchesCount}
                onChange={(e) => setSeasonMatchesCount(parseInt(e.target.value) || 44)}
                className="w-full px-3.5 py-2.5 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 font-bold min-h-[44px] sm:min-h-[38px]"
              />
              <span className="text-[11px] text-slate-400">Par défaut : 44 matchs</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                Prix par Joueur (€)
              </label>
              <input
                type="number"
                step="0.10"
                min="0"
                value={defaultPrice}
                onChange={(e) => setDefaultPrice(parseFloat(e.target.value) || 12.50)}
                className="w-full px-3.5 py-2.5 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 font-bold min-h-[44px] sm:min-h-[38px]"
              />
              <span className="text-[11px] text-slate-400">Par défaut : 12.50 €</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
                Heure par défaut
              </label>
              <input
                type="text"
                placeholder="19:00"
                value={defaultTime}
                onChange={(e) => setDefaultTime(e.target.value)}
                className="w-full px-3.5 py-2.5 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 font-bold min-h-[44px] sm:min-h-[38px]"
              />
              <span className="text-[11px] text-slate-400">Ex: 19:00 ou 19h30</span>
            </div>
          </div>

          <div className="pt-3 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50 min-h-[44px]"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
            </button>
          </div>
        </div>
      </form>

      {/* Section 3: Générateur automatique des 44 matchs */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-blue-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">
              Générateur du Calendrier des {seasonMatchesCount} Matchs
            </h3>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700">
            1-Clic
          </span>
        </div>

        {generatedMsg && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <Sparkles className="w-4 h-4 text-emerald-700" />
            {generatedMsg}
          </div>
        )}

        <p className="text-xs text-slate-500 leading-relaxed">
          Générez instantanément les <strong>{seasonMatchesCount} matchs hebdomadaires</strong> de la saison avec les 2 terrains configurés ({courtNames.join(', ')}).
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-[11px] font-semibold text-slate-500 uppercase">
              Date du Match #1 (Premier Lundi)
            </label>
            <input
              type="date"
              value={seasonStartDate}
              onChange={(e) => setSeasonStartDate(e.target.value)}
              className="w-full px-3.5 py-2.5 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 font-semibold min-h-[44px] sm:min-h-[38px]"
            />
          </div>

          <button
            type="button"
            onClick={handleGenerateSeason}
            disabled={isGenerating}
            className="sm:self-end px-5 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
          >
            <Sparkles className="w-4 h-4" />
            {isGenerating ? 'Génération en cours...' : `Générer les ${seasonMatchesCount} Matchs`}
          </button>
        </div>
      </div>

      {/* Section 4: Initialisation Démo */}
      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-slate-500" />
          <h4 className="text-sm font-bold text-slate-800">
            Données de Démonstration & Test
          </h4>
        </div>
        <p className="text-xs text-slate-400">
          Charge des créanciers d'exemple (Maxence, Thomas avec 1 100 € d'avance), des joueurs et des premiers matchs test.
        </p>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Recharger les données d'exemple ? Cela ajoutera les joueurs et matchs de test.")) {
              onSeedDemo();
            }
          }}
          className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-xs min-h-[44px] flex items-center justify-center"
        >
          Recharger les données de démonstration
        </button>
      </div>
    </div>
  );
};
