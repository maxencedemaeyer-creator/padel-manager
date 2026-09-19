// ─────────────────────────────────────────────────────────────────────────
// Vue 3 de l'outil "Liens entre joueurs" — mini-simulateur consultatif.
//
// L'admin choisit 4 joueurs ; on lui montre les 3 façons de faire deux
// équipes, classées de la plus harmonieuse à la moins harmonieuse, avec pour
// chacune les 6 liens concernés (2 paires de partenaires + 4 duels
// d'adversaires) et un voyant de couleur selon l'historique et les
// préférences qu'il a encodées.
//
// AUCUN LIEN AVEC LA COMPOSITION DES MATCHS : ce composant ne lit aucune
// composition en cours, n'écrit rien nulle part et n'a aucun bouton
// "appliquer". L'admin regarde, puis compose lui-même dans l'onglet Matchs.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { evaluateSplits } from "../../lib/playerLinks";
import { PlayerAvatar } from "../players/PlayerAvatar";
import { STATUS_STYLES, avoidDetailText, plural, useNameOf } from "./playerLinksShared";

function LinkRow({ link, nameOf, revealed, onToggle }) {
  const style = STATUS_STYLES[link.status];
  const [x, y] = link.players;
  const isPartner = link.kind === "partner";
  const countText = isPartner
    ? `${plural(link.count, "fois", "fois")} ensemble`
    : `${plural(link.count, "fois", "fois")} contre`;

  return (
    <div className={cn(isPartner ? "py-1.5" : "py-1")}>
      <div className="flex items-start gap-2">
        <span className={cn("w-2.5 h-2.5 rounded-full shrink-0 mt-1", style.dot)} />
        <div className="flex-1 min-w-0">
          <p className={cn("break-words", isPartner ? "text-sm font-semibold" : "text-xs")}>
            {nameOf(x)} {isPartner ? "+" : "vs"} {nameOf(y)}
          </p>
          <p className="text-[11px] text-[var(--color-text-dim)]">{countText}</p>
        </div>
        {link.status === "avoid" ? (
          <button
            type="button"
            onClick={onToggle}
            className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0", style.pill)}
          >
            à éviter
          </button>
        ) : (
          link.status !== "gray" && (
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 text-right",
                style.pill
              )}
            >
              {link.label}
            </span>
          )
        )}
      </div>
      {link.status === "avoid" && revealed && (
        <p className="text-[11px] font-semibold text-rose-700 pl-[18px] pt-0.5">
          {avoidDetailText(link.avoid, nameOf)}
          {isPartner ? " (comme partenaires)" : " (aussi comme adversaires)"}
        </p>
      )}
      {link.status !== "avoid" &&
        link.notes.map((note, i) => (
          <p key={i} className={cn("text-[11px] pl-[18px] pt-0.5", style.text)}>
            {note}
          </p>
        ))}
    </div>
  );
}

export function PlayerLinksSimulator({ ctx, relations }) {
  const nameOf = useNameOf(ctx);
  const [picked, setPicked] = useState([]);
  const [revealed, setRevealed] = useState(() => new Set());

  const splits = useMemo(
    () => (picked.length === 4 ? evaluateSplits(ctx, relations, picked, nameOf) : []),
    [ctx, relations, picked, nameOf]
  );

  const toggle = (id) => {
    setRevealed(new Set());
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const toggleReveal = (key) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const teamLabel = (team) => team.map((id) => nameOf(id)).join(" + ");

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold">
          Choisissez 4 joueurs{" "}
          <span className="font-normal text-[var(--color-text-dim)]">({picked.length}/4)</span>
        </p>
        {picked.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setPicked([]);
              setRevealed(new Set());
            }}
            className="text-[11px] font-semibold text-[var(--color-text-dim)] underline"
          >
            Effacer
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {ctx.ids.map((id) => {
          const on = picked.includes(id);
          const full = picked.length >= 4 && !on;
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              disabled={full}
              className={cn(
                "flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-xs font-semibold border transition-colors disabled:opacity-40",
                on
                  ? "bg-sky-200 text-sky-900 border-sky-300"
                  : "bg-white text-[var(--color-text-dim)] border-[var(--color-border)]"
              )}
            >
              <PlayerAvatar player={ctx.playersById.get(id)} size={22} />
              {nameOf(id)}
            </button>
          );
        })}
      </div>

      {picked.length < 4 ? (
        <p className="text-xs text-[var(--color-text-dim)] py-3 text-center">
          Sélectionnez 4 joueurs pour voir les 3 façons de faire les équipes.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {splits.map((split, rank) => (
            <div
              key={split.index}
              className={cn(
                "p-3 rounded-2xl border",
                split.hasAvoid
                  ? "border-rose-200 bg-rose-50/60"
                  : split.best
                  ? "border-emerald-300 bg-emerald-50/60"
                  : "border-[var(--color-border)] bg-white"
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
                  Répartition {rank + 1}
                </span>
                {split.best && !split.hasAvoid && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                    La plus harmonieuse
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {split.teams.map((team, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i === 1 && (
                      <span className="text-[11px] font-semibold text-[var(--color-text-faint)] mr-0.5">
                        contre
                      </span>
                    )}
                    <span className="flex -space-x-1.5">
                      {team.map((id) => (
                        <PlayerAvatar
                          key={id}
                          player={ctx.playersById.get(id)}
                          size={24}
                          className="ring-2 ring-white"
                        />
                      ))}
                    </span>
                    <span className="text-sm font-bold">{teamLabel(team)}</span>
                  </span>
                ))}
              </div>

              <p
                className={cn(
                  "text-[11px] font-semibold mb-1",
                  split.attentionCount === 0 ? "text-emerald-700" : "text-amber-700"
                )}
              >
                {split.attentionCount === 0
                  ? "Aucun point d'attention"
                  : plural(split.attentionCount, "point d'attention", "points d'attention")}
              </p>

              <div className="divide-y divide-[var(--color-border)]">
                {split.partnerLinks.map((link) => (
                  <LinkRow
                    key={link.players.join("-")}
                    link={link}
                    nameOf={nameOf}
                    revealed={revealed.has(`${split.index}-${link.players.join("-")}`)}
                    onToggle={() => toggleReveal(`${split.index}-${link.players.join("-")}`)}
                  />
                ))}
              </div>
              <div className="mt-1 pt-1 border-t border-[var(--color-border)]">
                {split.opponentLinks.map((link) => (
                  <LinkRow
                    key={`o-${link.players.join("-")}`}
                    link={link}
                    nameOf={nameOf}
                    revealed={revealed.has(`${split.index}-o-${link.players.join("-")}`)}
                    onToggle={() => toggleReveal(`${split.index}-o-${link.players.join("-")}`)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] text-[var(--color-text-faint)]">
        Simulation seulement : rien n'est modifié dans les matchs. Composez ensuite à la main dans
        l'onglet Matchs. Les joueurs « Indifférent » pèsent le moins dans le classement.
      </p>
    </div>
  );
}
