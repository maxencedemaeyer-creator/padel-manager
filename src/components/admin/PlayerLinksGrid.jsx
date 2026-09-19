// ─────────────────────────────────────────────────────────────────────────
// Vue 1 de l'outil "Liens entre joueurs" — grille joueurs × joueurs, avec un
// interrupteur Avec / Contre. Chaque case porte le chiffre exact et une
// couleur relative à la moyenne des deux joueurs concernés (voir
// lib/playerLinks.js → pairHeat). Toucher une case affiche le détail dessous.
// Réservé à l'administrateur, purement consultatif.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { cn, formatDateShortFR } from "../../lib/utils";
import { getPairCounts, pairHeat, findAvoid } from "../../lib/playerLinks";
import { PlayerAvatar } from "../players/PlayerAvatar";
import { HEAT_CLASSES, avoidDetailText, plural, useNameOf } from "./playerLinksShared";

export function PlayerLinksGrid({ ctx, relations }) {
  const [type, setType] = useState("with"); // "with" | "against"
  const [selected, setSelected] = useState(null); // { a, b }
  const nameOf = useNameOf(ctx);

  if (ctx.ids.length < 2) {
    return (
      <p className="text-xs text-[var(--color-text-dim)] py-4 text-center">
        Pas encore assez de joueurs ou de matchs joués pour afficher la grille.
      </p>
    );
  }

  const role = type === "with" ? "partner" : "opponent";
  const detail = selected
    ? (() => {
        const counts = getPairCounts(ctx.links, selected.a, selected.b);
        return {
          counts,
          avoidPartner: findAvoid(relations, selected.a, selected.b, "partner"),
          avoidOpponent: findAvoid(relations, selected.a, selected.b, "opponent"),
        };
      })()
    : null;

  return (
    <div>
      <div className="flex bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full p-1 w-fit mb-3">
        {[
          ["with", "Avec (partenaires)"],
          ["against", "Contre (adversaires)"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setType(id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
              type === id ? "bg-sky-200 text-sky-900" : "text-[var(--color-text-dim)]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto pm-scroll-visible -mx-1 px-1 pb-2">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white" />
              {ctx.ids.map((id) => (
                <th key={id} className="font-normal p-[2px]">
                  <div className="flex flex-col items-center gap-0.5 w-9">
                    <PlayerAvatar player={ctx.playersById.get(id)} size={20} />
                    <span className="text-[9px] leading-none text-[var(--color-text-dim)] max-w-[36px] truncate">
                      {nameOf(id).slice(0, 4)}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ctx.ids.map((rowId) => (
              <tr key={rowId}>
                <th className="sticky left-0 z-10 bg-white text-left font-semibold text-[11px] pr-2 py-[2px] whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    <PlayerAvatar player={ctx.playersById.get(rowId)} size={20} />
                    {nameOf(rowId)}
                  </span>
                </th>
                {ctx.ids.map((colId) => {
                  if (rowId === colId) {
                    return (
                      <td key={colId} className="p-[2px]">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300 text-xs">
                          —
                        </div>
                      </td>
                    );
                  }
                  const { count, level } = pairHeat(ctx, rowId, colId, type);
                  const isAvoided = Boolean(findAvoid(relations, rowId, colId, role));
                  const isSelected =
                    selected &&
                    ((selected.a === rowId && selected.b === colId) ||
                      (selected.a === colId && selected.b === rowId));
                  return (
                    <td key={colId} className="p-[2px]">
                      <button
                        type="button"
                        onClick={() => setSelected({ a: rowId, b: colId })}
                        className={cn(
                          "relative w-9 h-9 rounded-lg text-xs font-bold pm-mono transition-shadow",
                          HEAT_CLASSES[type][level],
                          isSelected && "ring-2 ring-[var(--color-blue)]"
                        )}
                        aria-label={`${nameOf(rowId)} et ${nameOf(colId)} : ${count}`}
                      >
                        {count}
                        {isAvoided && (
                          <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-rose-600 ring-1 ring-white" />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail ? (
        <div className="mt-2 p-3 rounded-xl bg-[var(--color-surface-2)] text-xs">
          <p className="font-semibold mb-1">
            {nameOf(selected.a)} & {nameOf(selected.b)}
          </p>
          <p className="text-[var(--color-text-dim)]">
            Ensemble : {plural(detail.counts.withCount, "fois", "fois")}
            {detail.counts.lastWith ? ` (dernière : ${formatDateShortFR(detail.counts.lastWith)})` : ""}
            {" · "}
            Contre : {plural(detail.counts.againstCount, "fois", "fois")}
            {detail.counts.lastAgainst
              ? ` (dernière : ${formatDateShortFR(detail.counts.lastAgainst)})`
              : ""}
          </p>
          {(detail.avoidPartner || detail.avoidOpponent) && (
            <p className="mt-1 font-semibold text-rose-700">
              À éviter
              {detail.avoidPartner && !detail.avoidOpponent ? " comme partenaires" : ""}
              {" — "}
              {avoidDetailText(detail.avoidPartner || detail.avoidOpponent, nameOf)}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-[var(--color-text-faint)]">
          Touchez une case pour voir le détail.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--color-text-dim)]">
        <span className="flex items-center gap-1">
          <span className={cn("w-3 h-3 rounded", HEAT_CLASSES[type][0])} /> jamais
        </span>
        <span className="flex items-center gap-1">
          <span className={cn("w-3 h-3 rounded", HEAT_CLASSES[type][1])} /> rare
        </span>
        <span className="flex items-center gap-1">
          <span className={cn("w-3 h-3 rounded", HEAT_CLASSES[type][2])} /> moyen
        </span>
        <span className="flex items-center gap-1">
          <span className={cn("w-3 h-3 rounded", HEAT_CLASSES[type][3])} /> élevé
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-rose-600" /> à éviter
        </span>
      </div>
      <p className="mt-1 text-[10px] text-[var(--color-text-faint)]">
        La couleur compare chaque chiffre à la moyenne des deux joueurs : 3 fois ne pèse pas pareil
        pour quelqu'un qui joue peu ou beaucoup.
      </p>
    </div>
  );
}
