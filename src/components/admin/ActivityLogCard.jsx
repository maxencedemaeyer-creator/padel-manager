// ─────────────────────────────────────────────────────────────────────────
// Carte « Journal d'activité » du centre Administration (25/10/2026,
// chantier des rôles, étape 4). Repliée par défaut.
//
// À l'ouverture, demande au serveur (api/activity-log.js, réservé à l'admin)
// les 50 actions les plus récentes ; « Voir plus » charge les 50 suivantes.
// Jamais en temps réel : aucune lecture tant que la carte reste fermée.
// Les filtres (personne, type d'action) s'appliquent aux lignes déjà
// chargées.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { ACTIVITY_TYPES } from "../../lib/activityLog";
import { useAppData } from "../../context/AppContext";
import { Card, Button } from "../ui";
import Icon from "../icons/Icon";

const TYPE_TONES = {
  score: "bg-amber-100 text-amber-800",
  payment: "bg-emerald-100 text-emerald-800",
  money: "bg-emerald-100 text-emerald-800",
  presence: "bg-sky-100 text-sky-800",
  composition: "bg-sky-100 text-sky-800",
  match: "bg-violet-100 text-violet-800",
  player: "bg-slate-100 text-slate-700",
  role: "bg-rose-100 text-rose-700",
  level: "bg-teal-100 text-teal-800",
};

function formatWhen(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const day = d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

export function ActivityLogCard() {
  const { sessionToken } = useAppData();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const load = async (before = null) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/activity-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list", actingToken: sessionToken, before }),
      });
      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error(
          "Le serveur ne répond pas : vérifiez que le fichier api/activity-log.js est bien sur GitHub et que Vercel a fini de se redéployer."
        );
      }
      if (!data.ok) throw new Error(data.error || "Impossible de charger le journal.");
      setEntries((prev) => (before && prev ? [...prev, ...data.entries] : data.entries));
      setHasMore(Boolean(data.hasMore));
    } catch (e) {
      setError(e.message || "Impossible de charger le journal.");
    } finally {
      setLoading(false);
    }
  };

  // Chargement à la première ouverture ; à la fermeture on vide tout.
  useEffect(() => {
    if (open && entries === null && !loading) load();
    if (!open) {
      setEntries(null);
      setHasMore(false);
      setError("");
      setActorFilter("");
      setTypeFilter("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const actors = useMemo(() => {
    const map = new Map();
    (entries || []).forEach((e) => {
      if (e.actorId && !map.has(e.actorId)) map.set(e.actorId, e.actorName);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [entries]);

  const visible = useMemo(
    () =>
      (entries || []).filter(
        (e) => (!actorFilter || e.actorId === actorFilter) && (!typeFilter || e.type === typeFilter)
      ),
    [entries, actorFilter, typeFilter]
  );

  const selectClass =
    "flex-1 min-w-0 px-3 py-2 rounded-xl border border-black/10 text-sm bg-white";

  return (
    <Card className="p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 text-left"
        aria-expanded={open}
      >
        <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-violet-100 text-violet-700">
          <Icon.History className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-sm">Journal d'activité</span>
          <span className="block text-[11px] text-[var(--color-text-dim)] mt-0.5">
            Qui a fait quoi, et quand — visible de vous seul
          </span>
        </span>
        <Icon.Chevron
          className={cn(
            "w-4 h-4 text-[var(--color-text-faint)] transition-transform shrink-0",
            open && "rotate-90"
          )}
        />
      </button>

      {open && (
        <div className="mt-4">
          {entries && entries.length > 0 && (
            <div className="flex gap-2 mb-3">
              <select
                className={selectClass}
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                aria-label="Filtrer par personne"
              >
                <option value="">Tout le monde</option>
                {actors.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filtrer par type d'action"
              >
                <option value="">Toutes les actions</option>
                {Object.entries(ACTIVITY_TYPES).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="text-xs mb-3">
              <p className="text-red-600 mb-2">{error}</p>
              <Button variant="secondary" onClick={() => load()}>
                Réessayer
              </Button>
            </div>
          )}

          {entries && entries.length === 0 && !loading && (
            <p className="text-xs text-[var(--color-text-dim)]">
              Aucune action enregistrée pour l'instant.
            </p>
          )}

          {entries && entries.length > 0 && visible.length === 0 && (
            <p className="text-xs text-[var(--color-text-dim)] mb-3">
              Aucune action ne correspond à ces filtres parmi les lignes chargées
              {hasMore ? " — essayez « Voir plus »." : "."}
            </p>
          )}

          <ul className="divide-y divide-black/5">
            {visible.map((e) => (
              <li key={e.id} className="py-2.5">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                      TYPE_TONES[e.type] || "bg-slate-100 text-slate-700"
                    )}
                  >
                    {ACTIVITY_TYPES[e.type] || e.type}
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--color-text)]">
                    {e.actorName}
                  </span>
                  <span className="text-[11px] text-[var(--color-text-faint)] ml-auto">
                    {formatWhen(e.at)}
                  </span>
                </div>
                <p className="text-sm text-[var(--color-text-dim)] break-words">{e.summary}</p>
              </li>
            ))}
          </ul>

          {loading && <p className="text-xs text-[var(--color-text-dim)] mt-2">Chargement…</p>}

          {!loading && hasMore && entries && entries.length > 0 && (
            <Button
              variant="secondary"
              className="w-full mt-3"
              onClick={() => load(entries[entries.length - 1].at)}
            >
              Voir plus
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
