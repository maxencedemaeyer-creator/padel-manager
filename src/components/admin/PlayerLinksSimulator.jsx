// ─────────────────────────────────────────────────────────────────────────
// Vue 3 de l'outil "Liens entre joueurs" — mini-simulateur consultatif.
//
// L'admin choisit 8 joueurs (une session de 2 matchs, le cas habituel) ou 4
// joueurs (un seul match). On lui montre les combinaisons possibles (315 pour
// 8 joueurs, 3 pour 4), classées de la plus harmonieuse à la moins
// harmonieuse, avec pour chacune les liens concernés (partenaires et
// adversaires de chaque match) et un voyant de couleur selon l'historique et
// les préférences qu'il a encodées.
//
// AUCUN LIEN AVEC LA COMPOSITION DES MATCHS : ce composant ne lit aucune
// composition en cours, n'écrit rien nulle part et n'a aucun bouton
// "appliquer". L'admin regarde, puis compose lui-même dans l'onglet Matchs.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { evaluateConfigurations, SIMULATOR_SIZES } from "../../lib/playerLinks";
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

const MAX_PLAYERS = Math.max(...SIMULATOR_SIZES); // 8
const PAGE_SIZE = 5;
const MAX_SHOWN = 20;

export function PlayerLinksSimulator({ ctx, relations }) {
  const nameOf = useNameOf(ctx);
  const [picked, setPicked] = useState([]);
  const [revealed, setRevealed] = useState(() => new Set());
  const [openDuels, setOpenDuels] = useState(() => new Set());
  const [visible, setVisible] = useState(PAGE_SIZE);

  const configs = useMemo(
    () =>
      SIMULATOR_SIZES.includes(picked.length)
        ? evaluateConfigurations(ctx, relations, picked, nameOf)
        : [],
    [ctx, relations, picked, nameOf]
  );

  const reset = () => {
    setRevealed(new Set());
    setOpenDuels(new Set());
    setVisible(PAGE_SIZE);
  };

  const toggle = (id) => {
    reset();
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_PLAYERS) return prev;
      return [...prev, id];
    });
  };

  const flip = (setter, key) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const teamLabel = (team) => team.map((id) => nameOf(id)).join(" + ");
  const matchCount = picked.length / 4;

  // Message d'aide tant que le nombre de joueurs choisis ne convient pas.
  let help = null;
  if (picked.length === 0) {
    help = "Sélectionnez 8 joueurs pour simuler une session de 2 matchs (ou 4 joueurs pour un seul match).";
  } else if (picked.length < 4) {
    help = `Encore ${plural(4 - picked.length, "joueur")} pour simuler un match, ou ${plural(8 - picked.length, "joueur")} pour une session de 2 matchs.`;
  } else if (picked.length > 4 && picked.length < 8) {
    help = `Encore ${plural(8 - picked.length, "joueur")} pour une session de 2 matchs (ou retirez-en ${plural(picked.length - 4, "joueur")} pour ne simuler qu'un match).`;
  }

  const top = configs[0];
  const tiedTop = top
    ? configs.filter((c) => c.score === top.score && c.greenCount === top.greenCount).length
    : 0;
  const withoutIssue = configs.filter((c) => c.attentionCount === 0).length;
  const shown = configs.slice(0, Math.min(visible, MAX_SHOWN));

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold">
          Choisissez 8 joueurs (2 matchs) ou 4 joueurs (1 match){" "}
          <span className="font-normal text-[var(--color-text-dim)]">
            ({picked.length}/{MAX_PLAYERS})
          </span>
        </p>
        {picked.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setPicked([]);
              reset();
            }}
            className="text-[11px] font-semibold text-[var(--color-text-dim)] underline shrink-0"
          >
            Effacer
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {ctx.ids.map((id) => {
          const on = picked.includes(id);
          const full = picked.length >= MAX_PLAYERS && !on;
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

      {help ? (
        <p className="text-xs text-[var(--color-text-dim)] py-3 text-center">{help}</p>
      ) : (
        <>
          <p className="text-[11px] text-[var(--color-text-dim)] mb-3">
            {plural(configs.length, "combinaison possible", "combinaisons possibles")} analysée
            {configs.length > 1 ? "s" : ""}
            {" — "}
            {withoutIssue === 0
              ? "aucune n'est sans point d'attention"
              : `${withoutIssue} sans aucun point d'attention`}
            {tiedTop > 1 ? `, ${tiedTop} à égalité au sommet` : ""}. Voici les meilleures.
          </p>

          <div className="flex flex-col gap-3">
            {shown.map((config, rank) => {
              const isTop = config.score === top.score && config.greenCount === top.greenCount;
              const allOpponents = config.matches.flatMap((m, mi) =>
                m.opponentLinks.map((link) => ({ link, mi }))
              );
              const duelsOpen = openDuels.has(config.index);
              const hiddenDuels = allOpponents.filter(
                ({ link }) => link.status !== "avoid" && link.status !== "red"
              ).length;

              return (
                <div
                  key={config.index}
                  className={cn(
                    "p-3 rounded-2xl border",
                    config.hasAvoid
                      ? "border-rose-200 bg-rose-50/60"
                      : config.best
                      ? "border-emerald-300 bg-emerald-50/60"
                      : "border-[var(--color-border)] bg-white"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
                      Combinaison {rank + 1}
                    </span>
                    {!config.hasAvoid && (config.best || isTop) && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                        {config.best ? "La plus harmonieuse" : "Meilleur niveau (ex æquo)"}
                      </span>
                    )}
                  </div>

                  <p
                    className={cn(
                      "text-[11px] font-semibold mb-2",
                      config.attentionCount === 0 ? "text-emerald-700" : "text-amber-700"
                    )}
                  >
                    {config.attentionCount === 0
                      ? "Aucun point d'attention"
                      : plural(config.attentionCount, "point d'attention", "points d'attention")}
                  </p>

                  {config.matches.map((match, mi) => (
                    <div key={mi} className={cn(mi > 0 && "mt-3 pt-3 border-t border-[var(--color-border)]")}>
                      {matchCount > 1 && (
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)] mb-1">
                          Match {mi + 1}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {match.teams.map((team, i) => (
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

                      <div className="divide-y divide-[var(--color-border)]">
                        {match.partnerLinks.map((link) => {
                          const key = `${config.index}-${mi}-p-${link.players.join("-")}`;
                          return (
                            <LinkRow
                              key={key}
                              link={link}
                              nameOf={nameOf}
                              revealed={revealed.has(key)}
                              onToggle={() => flip(setRevealed, key)}
                            />
                          );
                        })}
                      </div>
                      {match.opponentLinks
                        .filter((l) => duelsOpen || l.status === "avoid" || l.status === "red")
                        .map((link) => {
                          const key = `${config.index}-${mi}-o-${link.players.join("-")}`;
                          return (
                            <LinkRow
                              key={key}
                              link={link}
                              nameOf={nameOf}
                              revealed={revealed.has(key)}
                              onToggle={() => flip(setRevealed, key)}
                            />
                          );
                        })}
                    </div>
                  ))}

                  {hiddenDuels > 0 && (
                    <button
                      type="button"
                      onClick={() => flip(setOpenDuels, config.index)}
                      className="mt-2 text-[11px] font-semibold text-[var(--color-text-dim)] underline"
                    >
                      {duelsOpen
                        ? "Masquer les duels sans souci"
                        : hiddenDuels === 1
                        ? "Voir l'autre duel"
                        : `Voir les ${hiddenDuels} autres duels`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {shown.length < Math.min(configs.length, MAX_SHOWN) && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="mt-3 w-full py-2.5 rounded-2xl bg-white border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-dim)]"
            >
              Voir {Math.min(PAGE_SIZE, Math.min(configs.length, MAX_SHOWN) - shown.length)} de plus
            </button>
          )}
        </>
      )}

      <p className="mt-3 text-[11px] text-[var(--color-text-faint)]">
        Simulation seulement : rien n'est modifié dans les matchs. Composez ensuite à la main dans
        l'onglet Matchs. Les joueurs « Indifférent » pèsent le moins dans le classement.
      </p>
    </div>
  );
}
