// ─────────────────────────────────────────────────────────────────────────
// Vue 4 de l'outil "Liens entre joueurs" — "Test de compo" (19/10/2026).
//
// L'admin place lui-même les joueurs sur un (ou deux) petit(s) terrain(s)
// factice(s) et l'outil lui donne son avis : combien de fois chaque paire a
// déjà joué ensemble / l'une contre l'autre, les points d'attention (souhaits
// des joueurs, paires à éviter), et le rang de cette compo parmi toutes les
// répartitions possibles des mêmes joueurs (avec la meilleure suggestion).
//
// Tout le roster est sélectionnable (nouveaux joueurs et occasionnels
// compris). OUTIL TOTALEMENT INDÉPENDANT : il ne lit aucune composition en
// cours, n'écrit RIEN dans Firebase (ni matchs, ni présences, ni compta) et
// le terrain factice n'existe que le temps de l'affichage.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { cn, formatDateShortFR } from "../../lib/utils";
import {
  evaluateMatch,
  evaluateConfigurations,
  summarizeMatches,
  compositionKey,
  getPairCounts,
} from "../../lib/playerLinks";
import { PlayerAvatar } from "../players/PlayerAvatar";
import { STATUS_STYLES, avoidDetailText, plural, useNameOf } from "./playerLinksShared";

const EMPTY = Array(8).fill(null);

// ─── Le terrain factice ──────────────────────────────────────────────────
function Slot({ playerId, ctx, nameOf, active, onClick }) {
  const player = playerId ? ctx.playersById.get(playerId) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 w-[72px] focus:outline-none"
    >
      <span
        className={cn(
          "rounded-full flex items-center justify-center transition-all",
          active ? "ring-4 ring-amber-300 scale-110" : "ring-2 ring-white/70",
          !player && "w-11 h-11 bg-white/15 border-2 border-dashed border-white/80",
          !player && active && "animate-pulse"
        )}
      >
        {player ? (
          <PlayerAvatar player={player} size={44} />
        ) : (
          <span className="text-white text-xl font-light leading-none">+</span>
        )}
      </span>
      <span className="text-[11px] font-semibold text-white leading-tight text-center break-words w-full [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
        {player ? nameOf(playerId) : "Libre"}
      </span>
    </button>
  );
}

function Court({ index, slots, ctx, nameOf, activeSlot, onSlot }) {
  const base = index * 4;
  const half = (offset) => (
    <div className="flex items-center justify-around relative z-10">
      {[0, 1].map((k) => {
        const i = base + offset + k;
        return (
          <Slot
            key={i}
            playerId={slots[i]}
            ctx={ctx}
            nameOf={nameOf}
            active={activeSlot === i}
            onClick={() => onSlot(i)}
          />
        );
      })}
    </div>
  );

  return (
    <div className="w-full max-w-[280px] mx-auto">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5 text-center">
        Terrain {index + 1}
      </p>
      <div className="rounded-2xl p-2 bg-gradient-to-b from-sky-600 to-blue-700 shadow-md">
        <div className="relative rounded-lg border-2 border-white/80 aspect-[4/5] grid grid-rows-2 bg-gradient-to-b from-sky-500 to-sky-600 overflow-hidden">
          {/* Lignes de service et ligne centrale */}
          <span className="absolute left-0 right-0 top-[20%] h-px bg-white/70" />
          <span className="absolute left-0 right-0 top-[80%] h-px bg-white/70" />
          <span className="absolute top-[20%] bottom-[20%] left-1/2 w-px bg-white/70" />
          {/* Filet */}
          <span className="absolute left-[-4px] right-[-4px] top-1/2 -translate-y-1/2 h-1.5 bg-slate-900/70 border-y border-white/90 z-[5]" />
          <span className="absolute left-1.5 top-1.5 px-1.5 py-0.5 rounded-full bg-white/25 text-[9px] font-bold text-white z-10">
            Équipe 1
          </span>
          <span className="absolute left-1.5 bottom-1.5 px-1.5 py-0.5 rounded-full bg-white/25 text-[9px] font-bold text-white z-10">
            Équipe 2
          </span>
          {half(0)}
          {half(2)}
        </div>
      </div>
    </div>
  );
}

// ─── Une ligne d'avis sur une paire ──────────────────────────────────────
function PairRow({ link, ctx, nameOf, revealed, onToggle }) {
  const style = STATUS_STYLES[link.status];
  const [x, y] = link.players;
  const isPartner = link.kind === "partner";
  const c = getPairCounts(ctx.links, x, y);

  const facts = isPartner
    ? [
        c.withCount === 0 ? "Jamais joué ensemble" : `${c.withCount}× ensemble`,
        c.againstCount > 0 ? `${c.againstCount}× adversaires` : null,
        c.lastWith ? `dernière fois ensemble le ${formatDateShortFR(c.lastWith)}` : null,
      ]
    : [
        c.againstCount === 0 ? "Jamais affrontés" : `${c.againstCount}× adversaires`,
        c.withCount > 0 ? `${c.withCount}× ensemble` : null,
        c.lastAgainst ? `dernier duel le ${formatDateShortFR(c.lastAgainst)}` : null,
      ];

  return (
    <div className="py-1.5">
      <div className="flex items-start gap-2">
        <span className={cn("w-2.5 h-2.5 rounded-full shrink-0 mt-1", style.dot)} />
        <div className="flex-1 min-w-0">
          <p className={cn("break-words", isPartner ? "text-sm font-semibold" : "text-xs font-medium")}>
            {nameOf(x)} {isPartner ? "+" : "vs"} {nameOf(y)}
          </p>
          <p className="text-[11px] text-[var(--color-text-dim)]">{facts.filter(Boolean).join(" · ")}</p>
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
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 text-right", style.pill)}>
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

function Verdict({ summary }) {
  if (summary.hasAvoid) {
    return (
      <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-600 text-white">
        ⛔ Contient une paire à éviter
      </span>
    );
  }
  if (summary.attentionCount === 0) {
    return (
      <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
        ✅ Aucun point d'attention
      </span>
    );
  }
  return (
    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
      ⚠️ {plural(summary.attentionCount, "point d'attention", "points d'attention")}
    </span>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────
export function PlayerLinksCompoTest({ ctx, relations }) {
  const nameOf = useNameOf(ctx);
  const [courts, setCourts] = useState(2);
  const [slots, setSlots] = useState(EMPTY);
  const [activeSlot, setActiveSlot] = useState(null);
  const [revealed, setRevealed] = useState(() => new Set());

  const visibleCount = courts * 4;
  const placedCount = slots.slice(0, visibleCount).filter(Boolean).length;

  const changeCourts = (n) => {
    setCourts(n);
    setActiveSlot(null);
    if (n === 1) setSlots((prev) => [...prev.slice(0, 4), null, null, null, null]);
  };

  const clearAll = () => {
    setSlots(EMPTY);
    setActiveSlot(null);
    setRevealed(new Set());
  };

  const swap = (arr, i, j) => {
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  // Toucher une place du terrain : la sélectionne ; toucher une 2e place
  // échange les deux ; retoucher la même place retire le joueur.
  const onSlot = (i) => {
    if (activeSlot === null) {
      setActiveSlot(i);
      return;
    }
    if (activeSlot === i) {
      if (slots[i]) setSlots((prev) => prev.map((v, k) => (k === i ? null : v)));
      setActiveSlot(null);
      return;
    }
    if (!slots[activeSlot] && !slots[i]) {
      setActiveSlot(i);
      return;
    }
    setSlots((prev) => swap(prev, activeSlot, i));
    setActiveSlot(null);
  };

  // Toucher un joueur de la liste : le place sur la place sélectionnée (ou la
  // première libre) ; s'il est déjà sur le terrain, le retire.
  const onPick = (id) => {
    const at = slots.indexOf(id);
    if (activeSlot !== null) {
      setSlots((prev) => {
        if (at >= 0) return swap(prev, at, activeSlot);
        const next = [...prev];
        next[activeSlot] = id;
        return next;
      });
      setActiveSlot(null);
      return;
    }
    if (at >= 0) {
      setSlots((prev) => prev.map((v) => (v === id ? null : v)));
      return;
    }
    const free = slots.findIndex((v, k) => k < visibleCount && !v);
    if (free < 0) return;
    setSlots((prev) => prev.map((v, k) => (k === free ? id : v)));
  };

  // Terrains complets → évaluation de chaque match.
  const evaluated = useMemo(() => {
    const out = [];
    for (let k = 0; k < courts; k += 1) {
      const s = slots.slice(k * 4, k * 4 + 4);
      if (s.every(Boolean)) {
        out.push({
          court: k,
          match: evaluateMatch(ctx, relations, [[s[0], s[1]], [s[2], s[3]]], nameOf),
        });
      }
    }
    return out;
  }, [ctx, relations, slots, courts, nameOf]);

  // Classement de la compo parmi toutes les répartitions possibles des mêmes
  // joueurs (3 pour 4 joueurs, 315 pour 8).
  const ranking = useMemo(() => {
    if (!evaluated.length) return null;
    const matches = evaluated.map((e) => e.match);
    const ids = matches.flatMap((m) => m.teams.flat());
    const configs = evaluateConfigurations(ctx, relations, ids, nameOf);
    if (!configs.length) return null;
    const mine = summarizeMatches(matches);
    const key = compositionKey(matches);
    const better = configs.filter(
      (c) => c.score < mine.score || (c.score === mine.score && c.greenCount > mine.greenCount)
    ).length;
    const tied =
      configs.filter((c) => c.score === mine.score && c.greenCount === mine.greenCount).length - 1;
    const best = configs[0];
    const bestIsMine = compositionKey(best.matches) === key;
    return { total: configs.length, rank: better + 1, tied, best, bestIsMine, mine };
  }, [evaluated, ctx, relations, nameOf]);

  // Place la meilleure suggestion sur le(s) terrain(s) concerné(s).
  const applyBest = () => {
    if (!ranking) return;
    setSlots((prev) => {
      const next = [...prev];
      ranking.best.matches.forEach((m, mi) => {
        const court = evaluated[mi].court;
        const [[a, b], [c, d]] = m.teams;
        [a, b, c, d].forEach((id, k) => {
          next[court * 4 + k] = id;
        });
      });
      return next;
    });
    setActiveSlot(null);
    setRevealed(new Set());
  };

  const flip = (key) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const teamText = (team) => team.map((id) => nameOf(id)).join(" + ");

  return (
    <div>
      {/* Choix 1 ou 2 terrains + vider */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full p-1">
          {[1, 2].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => changeCourts(n)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold transition-all",
                courts === n ? "bg-sky-200 text-sky-900" : "text-[var(--color-text-dim)]"
              )}
            >
              {n === 1 ? "1 terrain" : "2 terrains"}
            </button>
          ))}
        </div>
        {placedCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] font-semibold text-[var(--color-text-dim)] underline shrink-0"
          >
            Vider
          </button>
        )}
      </div>

      {/* Terrains */}
      <div className={cn("grid gap-4 mb-3", courts === 2 && "sm:grid-cols-2")}>
        {Array.from({ length: courts }).map((_, k) => (
          <Court
            key={k}
            index={k}
            slots={slots}
            ctx={ctx}
            nameOf={nameOf}
            activeSlot={activeSlot}
            onSlot={onSlot}
          />
        ))}
      </div>

      <p className="text-[11px] text-[var(--color-text-dim)] mb-2 text-center">
        {activeSlot !== null
          ? "Place sélectionnée : touchez un joueur ci-dessous, ou une autre place pour échanger."
          : "Touchez un joueur pour le placer. Touchez une place du terrain puis une autre pour échanger."}
      </p>

      {/* Tout le roster */}
      <p className="text-xs font-semibold mb-2">
        Joueurs du roster{" "}
        <span className="font-normal text-[var(--color-text-dim)]">
          ({placedCount}/{visibleCount} placés)
        </span>
      </p>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {ctx.allIds.map((id) => {
          const at = slots.indexOf(id);
          const placed = at >= 0 && at < visibleCount;
          const p = ctx.playersById.get(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onPick(id)}
              className={cn(
                "flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-xs font-semibold border transition-colors",
                placed
                  ? "bg-sky-200 text-sky-900 border-sky-300"
                  : "bg-white text-[var(--color-text-dim)] border-[var(--color-border)]"
              )}
            >
              <PlayerAvatar player={p} size={22} />
              {nameOf(id)}
              {p?.isOccasional && !placed && (
                <span className="text-[9px] font-bold text-violet-600">occ.</span>
              )}
              {placed && courts === 2 && (
                <span className="text-[9px] font-bold text-sky-700">T{Math.floor(at / 4) + 1}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* L'avis */}
      {!evaluated.length ? (
        <p className="text-xs text-[var(--color-text-dim)] py-3 text-center">
          Complétez un terrain (4 joueurs) pour recevoir l'avis sur votre compo.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {ranking && (
            <div
              className={cn(
                "p-3 rounded-2xl border",
                ranking.mine.hasAvoid
                  ? "border-rose-200 bg-rose-50/60"
                  : ranking.rank === 1
                  ? "border-emerald-300 bg-emerald-50/60"
                  : "border-amber-200 bg-amber-50/60"
              )}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                <span className="text-sm font-bold">Mon avis</span>
                <Verdict summary={ranking.mine} />
              </div>
              <p className="text-xs">
                {ranking.rank === 1 ? (
                  <>
                    🎉 C'est la compo la plus harmonieuse possible avec ces joueurs
                    {ranking.tied > 0
                      ? ` (à égalité avec ${plural(ranking.tied, "autre répartition", "autres répartitions")})`
                      : ""}
                    .
                  </>
                ) : (
                  <>
                    Classée <b>{ranking.rank}e</b> sur {ranking.total} répartitions possibles de ces
                    joueurs. Une compo plus harmonieuse existe :
                  </>
                )}
              </p>

              {ranking.rank > 1 && !ranking.bestIsMine && (
                <div className="mt-2 p-2.5 rounded-xl bg-white border border-[var(--color-border)]">
                  {ranking.best.matches.map((m, mi) => (
                    <p key={mi} className="text-xs font-semibold break-words">
                      {ranking.best.matches.length > 1 && (
                        <span className="text-[var(--color-text-faint)]">
                          T{evaluated[mi].court + 1} :{" "}
                        </span>
                      )}
                      {teamText(m.teams[0])}{" "}
                      <span className="font-normal text-[var(--color-text-faint)]">contre</span>{" "}
                      {teamText(m.teams[1])}
                    </p>
                  ))}
                  <p className="text-[11px] text-[var(--color-text-dim)] mt-1">
                    {ranking.best.attentionCount === 0
                      ? "Aucun point d'attention"
                      : plural(ranking.best.attentionCount, "point d'attention", "points d'attention")}
                  </p>
                  <button
                    type="button"
                    onClick={applyBest}
                    className="mt-2 w-full py-2 rounded-xl bg-sky-600 text-white text-xs font-semibold"
                  >
                    Essayer cette compo sur le terrain
                  </button>
                </div>
              )}
            </div>
          )}

          {evaluated.map(({ court, match }) => (
            <div key={court} className="p-3 rounded-2xl border border-[var(--color-border)] bg-white">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
                  Terrain {court + 1}
                </span>
                <Verdict summary={summarizeMatches([match])} />
              </div>

              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)] mt-2">
                Partenaires
              </p>
              <div className="divide-y divide-[var(--color-border)]">
                {match.partnerLinks.map((link) => {
                  const key = `${court}-p-${link.players.join("-")}`;
                  return (
                    <PairRow
                      key={key}
                      link={link}
                      ctx={ctx}
                      nameOf={nameOf}
                      revealed={revealed.has(key)}
                      onToggle={() => flip(key)}
                    />
                  );
                })}
              </div>

              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)] mt-2">
                Adversaires
              </p>
              <div className="divide-y divide-[var(--color-border)]">
                {match.opponentLinks.map((link) => {
                  const key = `${court}-o-${link.players.join("-")}`;
                  return (
                    <PairRow
                      key={key}
                      link={link}
                      ctx={ctx}
                      nameOf={nameOf}
                      revealed={revealed.has(key)}
                      onToggle={() => flip(key)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] text-[var(--color-text-faint)]">
        Test seulement : rien n'est enregistré et rien n'est modifié dans les matchs ni la
        comptabilité. Composez ensuite à la main dans l'onglet Matchs.
      </p>
    </div>
  );
}
