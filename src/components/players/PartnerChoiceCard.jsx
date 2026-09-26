// ─────────────────────────────────────────────────────────────────────────
// Bloc "Choix de partenaire" tout en bas de "Mon profil" : le joueur indique
// lui-même s'il préfère jouer avec tout le monde (Indifférent), changer de
// coéquipier (Varié) ou retrouver les mêmes (Stable). Il peut le modifier à
// tout moment ; l'admin peut aussi l'encoder pour lui depuis le centre Admin
// (Liens entre joueurs) : c'est la même donnée.
//
// Stockage : Firebase, via la fonction serveur api/admin-relations.js
// (actions "getMine" / "saveMyMode"), jamais en local. Un joueur ne peut lire
// et modifier QUE son propre choix. Une seule lecture à l'ouverture du profil,
// une lecture + une écriture par changement.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from "react";
import { cn } from "../../lib/utils";
import { PARTNER_MODES, MODE_LABELS, MODE_HELP } from "../../lib/playerLinks";
import { Card } from "../ui";

async function callApi(payload) {
  const response = await fetch("/api/admin-relations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error("Le serveur ne répond pas. Réessaie dans un instant.");
  }
  if (!data || !data.ok) throw new Error((data && data.error) || "Erreur serveur.");
  return data;
}

export function PartnerChoiceCard({ sessionToken }) {
  const [mode, setMode] = useState(null); // null = pas encore chargé
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (!sessionToken) {
      setError("Session expirée : déconnecte-toi puis reconnecte-toi avec ton code.");
      return;
    }
    started.current = true;
    callApi({ action: "getMine", actingToken: sessionToken })
      .then((data) => setMode(data.mode))
      .catch((e) => setError(e.message));
  }, [sessionToken]);

  const choose = async (next) => {
    if (saving || next === mode) return;
    const previous = mode;
    setMode(next);
    setSaving(true);
    setError(null);
    try {
      await callApi({ action: "saveMyMode", actingToken: sessionToken, mode: next });
    } catch (e) {
      setMode(previous);
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h3 className="pm-display font-bold text-lg text-white mb-3">Choix de partenaire</h3>
      <Card className="mb-6 p-5">
        <p className="text-xs text-[var(--color-text-dim)] mb-3">
          N'hésite pas à changer ce paramètre en cours de saison selon tes envies.
        </p>
        <div className="grid grid-cols-3 gap-1 bg-[var(--color-surface-2)] rounded-full p-1">
          {PARTNER_MODES.map((m) => (
            <button
              key={m}
              type="button"
              disabled={mode === null || saving}
              onClick={() => choose(m)}
              className={cn(
                "py-2 rounded-full text-sm font-semibold transition-all disabled:opacity-60",
                mode === m
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-[var(--color-text-dim)]"
              )}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-600 mt-2.5 min-h-[16px]">
          {mode ? MODE_HELP[mode] : error ? "" : "Chargement..."}
        </p>
        {error && <p className="text-[11px] font-semibold text-rose-600 mt-1.5">{error}</p>}
      </Card>
    </>
  );
}
