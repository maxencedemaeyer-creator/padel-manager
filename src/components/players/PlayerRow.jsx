// ─────────────────────────────────────────────────────────────────────────
// Une carte de la liste Équipe : avatar à gauche, puis 3 lignes (nom +
// badges, stats, homme du match), et à droite le Niveau 🎾 avec le bouton
// historique en dessous (19/10/2026 : main, côté et classement officiel ne
// sont plus visibles des joueurs ; l'admin les retrouve via le bouton "i"),
// suivi du bouton modifier (admin).
// Vocabulaire (21/09/2026) : "Niveau" = le nombre calculé de 1 à 10 (pastille
// "🎾 4,2", ex-"Ranking") ; "Classement" = P100, P200… (classement officiel).
// Le solde d'un créancier ne s'affiche plus ici — il vit uniquement dans
// l'onglet "Ma comptabilité" / "Administration".
//
// Refonte mobile du 19/09/2026 : l'ancienne grille CSS à colonnes fixes
// (grid-cols-[36px_1fr_44px_24px_24px_auto]) se déstructurait sur petit
// écran (colonnes qui se chevauchent, en-têtes désalignés). Remplacée par
// une mise en page en 3 lignes pour le bloc nom/stats + un bloc 2x2 à droite
// pour main/côté/niveau/historique — toutes les cartes gardent la même
// hauteur (la ligne "homme du match" est toujours rendue, avec un espace
// insécable quand il n'y a rien à afficher). Les pastilles main/côté sont
// désormais cliquables et ouvrent une pop-up d'explication.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { isPlayerAdmin, normalizeSide, formatDateFR } from "../../lib/utils";
import { LEVELS, levelDisplayLabel } from "../../lib/constants";
import { computePlayerStats } from "../../lib/stats";
import { getPlayerRatingState, getRecentLevelDeltaHistory, kFactor } from "../../lib/levelRating";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Card, Badge, Modal } from "../ui";
import { EditPlayerModal } from "./EditPlayerModal";
import { PlayerAvatar } from "./PlayerAvatar";

// Modale "Historique de niveau — [nom]" (anciennement "Historique de ranking",
// renommé le 21/09/2026). Refonte d'affichage du 04/10/2026 : regroupée par
// session (jeudi), textes en clair (plus de "Marge ×0.90"), niveaux avec
// virgule française, et lignes remises dans l'ORDRE RÉEL DU CALCUL : si une
// manche 2 a été encodée avant la manche 1, on l'affiche d'abord pour que la
// chaîne "Avant → Après" se suive (un recalcul admin remet l'ordre
// chronologique). Aucune lecture ni écriture Firebase en plus.
//
// Fiabilité en pourcentage (décidé le 21/09/2026). Le chiffre brut stocké est
// un compteur (+1 par match noté) sans maximum : peu parlant. On le traduit
// avec la MÊME courbe que le moteur (le facteur K : le niveau bouge beaucoup
// au début, puis de moins en moins). Repère : 100 % = RELIABILITY_FULL_AT
// matchs notés (20 depuis le 04/10/2026, c'était 40 avant). Seul ce repère est
// un choix d'affichage ; le calcul du niveau n'est pas modifié.
const RELIABILITY_FULL_AT = 20;
function reliabilityPercent(reliability) {
  const kStart = kFactor(0);
  const kEnd = kFactor(1e9);
  const settled = (r) => (kStart - kFactor(r)) / (kStart - kEnd);
  const share = settled(reliability) / settled(RELIABILITY_FULL_AT);
  return Math.max(0, Math.min(100, Math.round(share * 100)));
}

const EPS = 1e-6;

function fmtLevel(value, decimals = 2) {
  return typeof value === "number" ? value.toFixed(decimals).replace(".", ",") : "—";
}
function fmtDelta(entry) {
  const decimals = entry.bonusOnly ? 3 : 2;
  const sign = entry.delta > 0 ? "+" : entry.delta < 0 ? "−" : "";
  return `${sign}${Math.abs(entry.delta).toFixed(decimals).replace(".", ",")}`;
}

// Toutes les permutations d'un petit tableau (une session a rarement plus de 4 manches).
function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  arr.forEach((item, i) => {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    permutations(rest).forEach((perm) => out.push([item, ...perm]));
  });
  return out;
}

// Ordonne les entrées d'UNE session pour que chaque "Avant" suive le "Après"
// précédent. Si l'ordre chronologique est déjà cohérent, il est conservé.
function orderSessionByChain(items) {
  if (items.length < 2 || items.length > 5) return { items, reordered: false };
  const linkScore = (list) =>
    list.reduce((acc, cur, i) => {
      if (i === 0) return acc;
      const prev = list[i - 1].entry;
      return acc + (typeof cur.entry.avant === "number" && Math.abs(cur.entry.avant - prev.apres) < EPS ? 1 : 0);
    }, 0);
  let best = items;
  let bestScore = linkScore(items);
  permutations(items).forEach((perm) => {
    const sc = linkScore(perm);
    if (sc > bestScore) {
      best = perm;
      bestScore = sc;
    }
  });
  return { items: best, reordered: best !== items };
}

function buildSessions(history) {
  // `history` : du plus ancien au plus récent.
  const groups = [];
  history.forEach((item) => {
    const key = `${item.match.date}|${item.match.time}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, date: item.match.date, items: [item] });
  });
  return groups
    .map((g) => {
      const { items, reordered } = orderSessionByChain(g.items);
      const first = items[0].entry;
      const last = items[items.length - 1].entry;
      const startValue = typeof first.avant === "number" ? first.avant : first.apres - first.delta;
      return { ...g, items, reordered, net: last.apres - startValue };
    })
    .reverse(); // session la plus récente en haut
}

function resultBadge(entry) {
  if (entry.wasBootstrap) return { label: "Premier niveau", cls: "bg-sky-100 text-sky-700" };
  if (entry.bonusOnly) return { label: "Présence", cls: "bg-slate-100 text-slate-600" };
  if (entry.resultat === 1) return { label: "Victoire", cls: "bg-emerald-100 text-emerald-700" };
  if (entry.resultat === 0) return { label: "Défaite", cls: "bg-rose-100 text-rose-700" };
  return { label: "Égalité", cls: "bg-amber-100 text-amber-700" };
}

function RankingHistoryModal({ player, matches, onClose }) {
  const { isAdmin } = useAppData();
  const state = getPlayerRatingState(player);
  const reliabilityPct = reliabilityPercent(state.reliability);
  // `true` : inclut aussi les matchs joués sans score (bonus d'assiduité seul).
  const history = getRecentLevelDeltaHistory(player.id, matches, 200, true);
  const sessions = buildSessions(history);

  return (
    <Modal title={`Historique de niveau — ${player.name}`} onClose={onClose} wide>
      <div className="flex items-center gap-3 mb-4 p-3 rounded-2xl bg-[var(--color-surface-2)]">
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-faint)]">
            Niveau actuel
          </p>
          <p className="pm-mono text-2xl font-bold leading-tight">
            {state.hasRanking ? fmtLevel(state.score) : "—"}
          </p>
        </div>
        <div className="w-28">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-faint)]">
              Fiabilité
            </p>
            <p className="pm-mono text-lg font-semibold leading-tight">{`${reliabilityPct}\u00a0%`}</p>
          </div>
          <div className="h-1.5 rounded-full bg-white mt-1 overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-lime)]"
              style={{ width: `${reliabilityPct}%` }}
            />
          </div>
        </div>
      </div>

      <p className="text-[10px] text-[var(--color-text-faint)] -mt-2 mb-4 px-1">
        Plus la fiabilité est élevée, plus le niveau est stable : il bouge moins à chaque match.
        100 % correspond à environ {RELIABILITY_FULL_AT} matchs notés.
      </p>

      {sessions.length === 0 ? (
        <p className="text-sm text-[var(--color-text-faint)] italic">
          Aucun ajustement de niveau enregistré pour ce joueur.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {sessions.map((session) => (
            <div key={session.key}>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <p className="text-xs font-bold capitalize">{formatDateFR(session.date)}</p>
                <span
                  className={`pm-mono text-xs font-bold ${
                    session.net > 0.0005
                      ? "text-emerald-600"
                      : session.net < -0.0005
                      ? "text-rose-600"
                      : "text-[var(--color-text-dim)]"
                  }`}
                >
                  {session.net > 0.0005 ? "+" : session.net < -0.0005 ? "−" : ""}
                  {Math.abs(session.net).toFixed(2).replace(".", ",")} sur la soirée
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {[...session.items].reverse().map(({ match, entry }) => {
                  const badge = resultBadge(entry);
                  const positive = entry.delta > 0;
                  const negative = entry.delta < 0;
                  return (
                    <div
                      key={match.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--color-surface-2)]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                          <span className="text-xs font-semibold">
                            {match.isExtraRound ? "Manche supplémentaire" : "Manche principale"}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--color-text-faint)] mt-1">
                          {entry.wasBootstrap
                            ? "Niveau fixé d'après ce premier match"
                            : entry.bonusOnly
                            ? "Match sans score : petit bonus de présence"
                            : `Chances de victoire estimées : ${Math.round((entry.attendu ?? 0.5) * 100)} %`}
                          {!entry.bonusOnly && !entry.wasBootstrap && entry.bonus > 0
                            ? ` · dont présence +${entry.bonus.toFixed(3).replace(".", ",")}`
                            : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`pm-mono text-sm font-bold ${
                            positive
                              ? "text-emerald-600"
                              : negative
                              ? "text-rose-600"
                              : "text-[var(--color-text-dim)]"
                          }`}
                        >
                          {fmtDelta(entry)}
                        </p>
                        <p className="pm-mono text-[10px] text-[var(--color-text-faint)]">
                          {typeof entry.avant === "number" ? `${fmtLevel(entry.avant)} → ` : ""}
                          {fmtLevel(entry.apres, entry.bonusOnly ? 3 : 2)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Message technique : réservé à l'admin (seul à pouvoir lancer le
                  « Recalcul du niveau »). Les joueurs voient l'historique sans ce texte. */}
              {session.reordered && isAdmin && (
                <p className="text-[10px] italic text-amber-700 mt-1.5 px-1">
                  ⚠️ Les manches de cette soirée ont été encodées dans un ordre inhabituel : elles
                  sont affichées dans l'ordre du calcul. Un « Recalcul du niveau » (Administration)
                  remet tout dans l'ordre chronologique.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// Fiche "infos" d'un joueur — RÉSERVÉE À L'ADMIN (19/10/2026). Depuis cette
// date, les joueurs ne voient plus la main dominante, le côté préféré ni le
// classement officiel des autres sur la carte Équipe ; l'admin les retrouve
// tous ici, d'un seul bouton "i". Aucune lecture ni écriture Firebase.
function PlayerInfoModal({ player, onClose }) {
  const levelInfo = LEVELS.find((l) => l.value === player.levelSortValue);
  const rows = [
    { emoji: "👋", label: "Main dominante", value: player.dominantHand || "Non renseigné" },
    {
      emoji: "📍",
      label: "Côté préféré",
      value: normalizeSide(player.preferredSide) || "Non renseigné",
    },
    {
      emoji: "🎖️",
      label: "Classement officiel",
      value: levelDisplayLabel(levelInfo?.label || player.level),
    },
    {
      emoji: "🏛️",
      label: "Fédération",
      value: player.federation && player.federation !== "Aucune" ? player.federation : "Aucune",
    },
  ];
  return (
    <Modal title={`Infos — ${player.name}`} onClose={onClose}>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)]"
          >
            <span className="w-8 h-8 rounded-lg bg-white border border-[var(--color-border)] flex items-center justify-center text-base shrink-0">
              {r.emoji}
            </span>
            <span className="text-xs text-[var(--color-text-dim)] flex-1">{r.label}</span>
            <span className="text-sm font-bold text-right">{r.value}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-text-faint)] mt-3">
        Visible uniquement par l'admin. Les joueurs peuvent toujours trier l'équipe par
        classement, sans le voir affiché.
      </p>
    </Modal>
  );
}

export function PlayerRow({ player, mvpCount = 0, sessionCount = 0 }) {
  const { isAdmin, matches, rankingEnabled } = useAppData();
  const [showEdit, setShowEdit] = useState(false);
  const [showRankingHistory, setShowRankingHistory] = useState(false);
  // Fiche "infos" (main, côté, classement, fédération) — admin uniquement.
  const [showInfo, setShowInfo] = useState(false);
  // Seul l'admin peut ouvrir la fiche complète depuis "Équipe" — un joueur
  // modifie désormais son propre code PIN depuis "Mon profil".
  const canEdit = isAdmin;
  const playerStats = computePlayerStats(player.id, matches);
  // "Nx homme du match" — nombre de fois élu (voir jeu du Fun Center,
  // lib/mvp.js), compté une fois par PlayersView et transmis en prop. La
  // ligne reste toujours rendue (voir plus bas) pour que la carte garde une
  // hauteur constante, avec ou sans mention.
  const mvpLine = mvpCount > 0 ? `🏆 ${mvpCount}x homme du match` : "";

  // Niveau (ex-"Ranking", voir claude/feature-ranking-padel-manager.md §6) —
  // visible par tous les joueurs une fois le switch admin activé
  // (`rankingEnabled`), et toujours visible pour l'admin quel que soit
  // l'état du switch. Quand la condition est fausse, l'emplacement disparaît
  // entièrement (y compris le badge "N.C." des joueurs non classés) — pas de
  // placeholder. Un joueur non classé (pas de classement officiel P100,
  // P200…) n'a pas encore de niveau : il garde exactement la même pastille
  // que les autres, avec "N.C." à la place du nombre (modif. 21/09/2026).
  const showRanking = isAdmin || rankingEnabled;
  const rankingState = getPlayerRatingState(player);
  // Historique de niveau (icône horloge) : désormais visible par TOUS les
  // joueurs (09/10/2026, c'était réservé à l'admin). Il suit la même règle que
  // le Niveau lui-même (`showRanking`) : l'admin le voit toujours, les autres
  // joueurs seulement quand le switch `rankingEnabled` est activé — inutile
  // d'afficher l'historique d'un niveau qu'on ne voit pas. Il faut aussi que le
  // joueur ait déjà un niveau.
  const showHistoryCell = showRanking && rankingState.hasRanking;

  // Le nombre affiché est celui des SESSIONS (1 session = 1 entraînement, quel
  // que soit son nombre de manches), le même que pour le tri "Régularité"
  // (modif. 26/09/2026) — calculé une fois par PlayersView et passé en prop.
  const statsLine =
    playerStats.played === 0 && sessionCount === 0
      ? "Aucune statistique"
      : `${sessionCount} session${sessionCount > 1 ? "s" : ""} · ${playerStats.wins}V${
          playerStats.draws > 0 ? `-${playerStats.draws}N` : ""
        }-${playerStats.losses}D · ${playerStats.winRate}%`;

  // Bloc de droite (refonte du 19/10/2026) : la pastille Niveau 🎾 quitte la
  // ligne du nom et vient ici, avec en dessous le bouton historique (et, pour
  // l'admin, le bouton "i" qui regroupe main / côté / classement / fédération).
  const showRightBlock = showRanking || isAdmin;
  const smallBtnClass =
    "h-7 flex-1 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-dim)] flex items-center justify-center active:scale-95 transition-transform hover:text-[var(--color-lime)] hover:border-[var(--color-lime)]/50";

  return (
    <>
      <Card className="p-3">
        <div className="flex items-center gap-3">
          <PlayerAvatar player={player} size={36} className="self-start mt-0.5" />

          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {/* Ligne 1 : nom, créancier, puis les autres badges éventuels
                (le Niveau 🎾 est désormais dans le bloc de droite). */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-semibold text-sm truncate">{player.name}</span>
              {player.isCreditor && isAdmin && (
                <Badge tone="blue" className="!px-1.5 !py-0.5 !text-[9px]">
                  Créancier
                </Badge>
              )}
              {isPlayerAdmin(player) && (
                <Badge tone="lime" className="!px-1.5 !py-0.5 !text-[9px]">
                  Admin
                </Badge>
              )}
              {player.isTest && isAdmin && (
                <Badge tone="danger" className="!px-1.5 !py-0.5 !text-[9px]">
                  Test
                </Badge>
              )}
              {player.isOccasional && (
                <Badge tone="unpaid" className="!px-1.5 !py-0.5 !text-[9px]">
                  Occasionnel
                </Badge>
              )}
              {player.federation && player.federation !== "Aucune" && (
                <span className="text-[10px] text-[var(--color-text-faint)]">
                  {player.federation}
                </span>
              )}
            </div>

            {/* Ligne 2 : statistiques (matchs, V/N/D, % de victoires). */}
            <p className="text-[11px] text-[var(--color-text-faint)] truncate">{statsLine}</p>

            {/* Ligne 3 : "homme du match" — toujours rendue (hauteur fixe,
                espace insécable si vide) pour que l'absence de mention ne
                réduise jamais la carte par rapport aux autres. */}
            <p className="text-[10px] font-semibold text-amber-600 truncate h-[14px] leading-[14px]">
              {mvpLine || " "}
            </p>
          </div>

          {/* Bloc de droite : Niveau 🎾 en haut, bouton(s) en dessous, même
              largeur pour toutes les cartes (alignement vertical parfait), puis
              le bouton modifier (admin) tout à droite. */}
          <div className="flex items-center gap-2 shrink-0">
            {showRightBlock && (
              <div className="w-[68px] flex flex-col gap-1.5">
                {showRanking && (
                  <span
                    title="Niveau"
                    className="h-7 w-full rounded-md bg-[var(--color-lime)]/10 border border-[var(--color-lime)]/40 text-[11px] font-bold text-[var(--color-lime)] flex items-center justify-center pm-mono"
                  >
                    {rankingState.hasRanking
                      ? `🎾 ${rankingState.score.toFixed(1).replace(".", ",")}`
                      : "🎾 N.C."}
                  </span>
                )}
                {(showHistoryCell || isAdmin) && (
                  <div className="flex gap-1.5">
                    {showHistoryCell && (
                      <button
                        type="button"
                        onClick={() => setShowRankingHistory(true)}
                        aria-label="Historique de niveau"
                        title="Historique de niveau"
                        className={smallBtnClass}
                      >
                        <Icon.History className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setShowInfo(true)}
                        aria-label="Infos du joueur (main, côté, classement)"
                        title="Infos du joueur"
                        className={`${smallBtnClass} text-xs font-bold font-serif italic`}
                      >
                        i
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {canEdit && (
              <button
                onClick={() => setShowEdit(true)}
                aria-label="Modifier le profil"
                className="p-1.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-sky-700 hover:border-sky-300 shrink-0"
              >
                <Icon.Edit className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </Card>

      {showEdit && <EditPlayerModal player={player} onClose={() => setShowEdit(false)} />}
      {showRankingHistory && (
        <RankingHistoryModal
          player={player}
          matches={matches}
          onClose={() => setShowRankingHistory(false)}
        />
      )}
      {showInfo && <PlayerInfoModal player={player} onClose={() => setShowInfo(false)} />}
    </>
  );
}
