// ─────────────────────────────────────────────────────────────────────────
// Vue 2 de l'outil "Liens entre joueurs" — fiche par joueur : les compteurs
// "avec" / "contre" avec chaque autre joueur, un petit encadré de synthèse, et
// (section repliée) les préférences que l'admin encode pour ce joueur :
// mode Indifférent / Varié / Stable, partenaires souhaités, joueurs à éviter.
//
// Tout ce qui est encodé ici est une confidence faite à l'admin : c'est
// stocké côté serveur (voir hooks/useAdminRelations.js) et personne d'autre
// ne le voit jamais. Aucun effet sur les matchs ni sur leur composition.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo } from "react";
import { cn, formatDateShortFR } from "../../lib/utils";
import {
  getPrefs,
  getPlayerRows,
  getPlayerSummary,
  countWithSince,
  PARTNER_MODES,
  MODE_LABELS,
  MODE_HELP,
} from "../../lib/playerLinks";
import { Button, inputClass } from "../ui";
import Icon from "../icons/Icon";
import { PlayerAvatar } from "../players/PlayerAvatar";
import { HEAT_CLASSES, avoidDetailText, plural, useNameOf } from "./playerLinksShared";

const SORTS = [
  ["with", "Jamais avec d'abord"],
  ["against", "Jamais contre d'abord"],
  ["name", "Nom"],
];

// ─── Éditeur de préférences d'un joueur ────────────────────────────────────

function PrefsEditor({ ctx, playerId, prefs, links, nameOf, onSave }) {
  const [mode, setMode] = useState(prefs.mode);
  const [favorites, setFavorites] = useState(prefs.favorites);
  // avoid : { [playerId]: alsoOpponent }
  const [avoid, setAvoid] = useState(() =>
    Object.fromEntries(prefs.avoid.map((e) => [e.playerId, e.alsoOpponent === true]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Réinitialise le formulaire quand la fiche enregistrée change (après une
  // sauvegarde, ou en changeant de joueur).
  useEffect(() => {
    setMode(prefs.mode);
    setFavorites(prefs.favorites);
    setAvoid(Object.fromEntries(prefs.avoid.map((e) => [e.playerId, e.alsoOpponent === true])));
    setError(null);
  }, [prefs]);

  const others = ctx.ids.filter((id) => id !== playerId);

  const toggleFavorite = (id) =>
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAvoid = (id) =>
    setAvoid((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = false;
      return next;
    });

  const draftAvoid = Object.entries(avoid).map(([id, alsoOpponent]) => ({
    playerId: id,
    alsoOpponent,
  }));

  const dirty =
    mode !== prefs.mode ||
    JSON.stringify([...favorites].sort()) !== JSON.stringify([...prefs.favorites].sort()) ||
    JSON.stringify(draftAvoid.map((e) => [e.playerId, e.alsoOpponent]).sort()) !==
      JSON.stringify(prefs.avoid.map((e) => [e.playerId, e.alsoOpponent === true]).sort());

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(playerId, { mode, favorites, avoid: draftAvoid });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const avoidSince = new Map(prefs.avoid.map((e) => [e.playerId, e.since]));

  // "Depuis l'activation du mode Stable : N matchs avec X" — uniquement pour
  // les partenaires souhaités déjà enregistrés.
  const stableSummary =
    prefs.mode === "stable" && prefs.modeSince && prefs.favorites.length > 0
      ? prefs.favorites
          .filter((id) => others.includes(id))
          .map((id) => `${nameOf(id)} ${plural(countWithSince(links, playerId, id, prefs.modeSince), "match", "matchs")}`)
          .join(" · ")
      : null;

  return (
    <div className="mt-2 p-3 rounded-2xl bg-[var(--color-surface-2)] flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
          Envie de partenaires
        </p>
        <div className="flex bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full p-1 w-fit max-w-full">
          {PARTNER_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                mode === m ? "bg-sky-200 text-sky-900" : "text-[var(--color-text-dim)]"
              )}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[var(--color-text-dim)] mt-1.5">{MODE_HELP[mode]}</p>
        {prefs.mode === "stable" && prefs.modeSince && (
          <p className="text-[11px] text-[var(--color-text-dim)] mt-1">
            Stable depuis le {formatDateShortFR(prefs.modeSince)}
            {stableSummary ? `. Matchs ensemble depuis : ${stableSummary}` : ""}.
          </p>
        )}
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
          Aime bien jouer avec
        </p>
        <div className="flex flex-wrap gap-1.5">
          {others.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleFavorite(id)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors",
                favorites.includes(id)
                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                  : "bg-white text-[var(--color-text-dim)] border-[var(--color-border)]"
              )}
            >
              {nameOf(id)}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[var(--color-text-faint)] mt-1.5">
          Utilisé seulement quand le joueur est en mode Stable. En mode Varié ou Indifférent, la
          liste est conservée mais ignorée. Sans liste, la stabilité se déduit des matchs passés.
        </p>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 mb-1.5">
          Ne veut plus jouer avec (confidentiel)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {others.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleAvoid(id)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors",
                id in avoid
                  ? "bg-rose-100 text-rose-700 border-rose-300"
                  : "bg-white text-[var(--color-text-dim)] border-[var(--color-border)]"
              )}
            >
              {nameOf(id)}
            </button>
          ))}
        </div>
        {draftAvoid.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {draftAvoid.map((entry) => (
              <label
                key={entry.playerId}
                className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]"
              >
                <input
                  type="checkbox"
                  checked={entry.alsoOpponent}
                  onChange={(e) =>
                    setAvoid((prev) => ({ ...prev, [entry.playerId]: e.target.checked }))
                  }
                />
                <span>
                  <strong className="text-[var(--color-text)]">{nameOf(entry.playerId)}</strong> :
                  éviter aussi comme adversaire
                  {avoidSince.get(entry.playerId)
                    ? ` (noté le ${formatDateShortFR(avoidSince.get(entry.playerId))})`
                    : ""}
                </span>
              </label>
            ))}
          </div>
        )}
        <p className="text-[11px] text-[var(--color-text-faint)] mt-1.5">
          Vaut dans les deux sens : la paire est signalée même si l'autre joueur n'a rien demandé.
          Par défaut, seulement comme partenaires. Invisible pour les autres joueurs.
        </p>
      </div>

      {error && (
        <p className="text-[11px] font-semibold text-rose-600 flex items-start gap-1">
          <Icon.AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
        </p>
      )}
      <Button className="!py-2.5 !text-xs w-full" onClick={save} disabled={!dirty || saving}>
        {saving ? "Enregistrement..." : dirty ? "Enregistrer les préférences" : "Aucun changement"}
      </Button>
    </div>
  );
}

// ─── Vue fiche ─────────────────────────────────────────────────────────────

export function PlayerLinksFiche({ ctx, relations, savePrefs, loaded }) {
  const nameOf = useNameOf(ctx);
  const [playerId, setPlayerId] = useState(ctx.ids[0] || null);
  const [sort, setSort] = useState("with");
  const [showPrefs, setShowPrefs] = useState(false);
  const [revealed, setRevealed] = useState(() => new Set());

  // Si le joueur sélectionné disparaît de la liste, on retombe sur le premier.
  useEffect(() => {
    if (!ctx.ids.includes(playerId)) setPlayerId(ctx.ids[0] || null);
  }, [ctx.ids, playerId]);

  const rows = useMemo(
    () => (playerId ? getPlayerRows(ctx, relations, playerId) : []),
    [ctx, relations, playerId]
  );
  const summary = useMemo(() => getPlayerSummary(rows), [rows]);
  const prefs = useMemo(() => getPrefs(relations, playerId), [relations, playerId]);

  const sortedRows = useMemo(() => {
    const list = [...rows];
    if (sort === "name") {
      list.sort((a, b) => nameOf(a.playerId).localeCompare(nameOf(b.playerId), "fr"));
    } else if (sort === "against") {
      list.sort((a, b) => a.againstCount - b.againstCount || a.withCount - b.withCount);
    } else {
      list.sort((a, b) => a.withCount - b.withCount || a.againstCount - b.againstCount);
    }
    return list;
  }, [rows, sort, nameOf]);

  if (!playerId) {
    return (
      <p className="text-xs text-[var(--color-text-dim)] py-4 text-center">
        Aucun joueur à afficher pour l'instant.
      </p>
    );
  }

  const player = ctx.playersById.get(playerId);
  const played = ctx.links.played.get(playerId) || 0;

  const toggleReveal = (id) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <PlayerAvatar player={player} size={40} />
        <div className="flex-1 min-w-0">
          <select
            className={cn(inputClass, "!py-2")}
            value={playerId}
            onChange={(e) => {
              setPlayerId(e.target.value);
              setShowPrefs(false);
              setRevealed(new Set());
            }}
          >
            {ctx.ids.map((id) => (
              <option key={id} value={id}>
                {ctx.playersById.get(id)?.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[var(--color-text-faint)] mt-1">
            {plural(played, "match joué", "matchs joués")} · mode {MODE_LABELS[prefs.mode].toLowerCase()}
          </p>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-[var(--color-surface-2)] text-xs mb-3 flex flex-col gap-1">
        <p>
          <span className="font-semibold">Jamais joué avec : </span>
          <span className="text-[var(--color-text-dim)]">
            {summary.neverWith.length === 0
              ? "personne, il a déjà joué avec tout le monde."
              : summary.neverWith.map((id) => nameOf(id)).join(", ")}
          </span>
        </p>
        <p>
          <span className="font-semibold">Adversaires les plus fréquents : </span>
          <span className="text-[var(--color-text-dim)]">
            {summary.topAgainst.length === 0
              ? "aucun (pas de rencontre répétée)."
              : summary.topAgainst
                  .map((r) => `${nameOf(r.playerId)} (${r.againstCount})`)
                  .join(", ")}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {SORTS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSort(id)}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors",
              sort === id
                ? "bg-sky-200 text-sky-900 border-sky-300"
                : "bg-white text-[var(--color-text-dim)] border-[var(--color-border)]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        {sortedRows.map((row) => {
          const avoid = row.avoidPartner || row.avoidOpponent;
          const isFavorite = prefs.favorites.includes(row.playerId);
          return (
            <div key={row.playerId}>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-[var(--color-border)]">
                <PlayerAvatar player={ctx.playersById.get(row.playerId)} size={28} />
                <span className="flex-1 min-w-0 text-sm font-semibold truncate">
                  {nameOf(row.playerId)}
                </span>
                {isFavorite && (
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded-full text-[10px] font-semibold",
                      prefs.mode === "stable"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    )}
                    title={
                      prefs.mode === "stable"
                        ? "Partenaire souhaité"
                        : "Partenaire souhaité (ignoré tant que le joueur n'est pas en mode Stable)"
                    }
                  >
                    souhaité
                  </span>
                )}
                {avoid && (
                  <button
                    type="button"
                    onClick={() => toggleReveal(row.playerId)}
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-600 text-white"
                  >
                    à éviter
                  </button>
                )}
                <span
                  className={cn(
                    "px-2 py-1 rounded-lg text-xs font-bold pm-mono min-w-[52px] text-center",
                    HEAT_CLASSES.with[row.withLevel]
                  )}
                  title="Fois où ils ont joué dans la même équipe"
                >
                  {row.withCount} avec
                </span>
                <span
                  className={cn(
                    "px-2 py-1 rounded-lg text-xs font-bold pm-mono min-w-[60px] text-center",
                    HEAT_CLASSES.against[row.againstLevel]
                  )}
                  title="Fois où ils se sont affrontés"
                >
                  {row.againstCount} contre
                </span>
              </div>
              {avoid && revealed.has(row.playerId) && (
                <p className="text-[11px] font-semibold text-rose-700 px-2 pt-1">
                  {avoidDetailText(avoid, nameOf)}
                  {row.avoidPartner && !row.avoidOpponent ? " (comme partenaires)" : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowPrefs((v) => !v)}
        className="mt-4 w-full flex items-center justify-between gap-2 p-3 rounded-2xl bg-[var(--color-surface-2)] text-left"
      >
        <span className="text-sm font-semibold">
          Préférences de {nameOf(playerId)}
          <span className="block text-[11px] font-normal text-[var(--color-text-dim)]">
            Visible de vous seul — jamais des joueurs
          </span>
        </span>
        <Icon.Chevron
          className={cn(
            "w-4 h-4 text-[var(--color-text-faint)] transition-transform",
            showPrefs && "rotate-90"
          )}
        />
      </button>
      {showPrefs &&
        (loaded ? (
          <PrefsEditor
            key={playerId}
            ctx={ctx}
            playerId={playerId}
            prefs={prefs}
            links={ctx.links}
            nameOf={nameOf}
            onSave={savePrefs}
          />
        ) : (
          <p className="text-xs text-[var(--color-text-dim)] mt-2">
            Les préférences ne sont pas chargées (voir le message d'erreur plus haut).
          </p>
        ))}
    </div>
  );
}
