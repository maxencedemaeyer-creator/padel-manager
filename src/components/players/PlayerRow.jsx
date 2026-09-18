// ─────────────────────────────────────────────────────────────────────────
// Une carte de la liste Équipe : avatar à gauche, puis 3 lignes (nom +
// badges, stats, homme du match), et à droite un bloc 2x2 (main / côté /
// niveau / historique de ranking) suivi du bouton modifier (admin).
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
import {
  isPlayerAdmin,
  handAbbrev,
  sideAbbrev,
  normalizeSide,
  formatDateFR,
} from "../../lib/utils";
import { LEVELS, HAND_OPTIONS, SIDE_OPTIONS } from "../../lib/constants";
import { computePlayerStats } from "../../lib/stats";
import { getPlayerRatingState, getRecentLevelDeltaHistory } from "../../lib/levelRating";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Card, Badge, Modal } from "../ui";
import { EditPlayerModal } from "./EditPlayerModal";
import { PlayerAvatar } from "./PlayerAvatar";

// Modale "Historique de ranking — [nom]" — réservée à l'admin (voir §6 de
// claude/feature-ranking-padel-manager.md). Liste du plus récent au plus
// ancien, avec la fiabilité actuelle du joueur en en-tête pour donner le
// contexte (un joueur récent ou récemment recalibré varie plus fort).
function RankingHistoryModal({ player, matches, onClose }) {
  const state = getPlayerRatingState(player);
  const history = getRecentLevelDeltaHistory(player.id, matches, 200).slice().reverse();

  return (
    <Modal title={`Historique de ranking — ${player.name}`} onClose={onClose} wide>
      <p className="text-xs text-[var(--color-text-dim)] mb-3">
        Fiabilité actuelle : <span className="font-semibold">{state.reliability.toFixed(1)}</span>
      </p>
      {history.length === 0 ? (
        <p className="text-sm text-[var(--color-text-faint)] italic">
          Aucun ajustement de ranking enregistré pour ce joueur.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {history.map(({ match, entry }) => (
            <div
              key={match.id}
              className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--color-surface-2)]"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{formatDateFR(match.date)}</p>
                <p className="text-[10px] text-[var(--color-text-faint)]">
                  {entry.wasBootstrap
                    ? "Amorçage (1er match noté)"
                    : `Avant ${entry.avant.toFixed(2)} · Attendu ${entry.attendu.toFixed(2)} · Marge ×${entry.facteurMarge.toFixed(2)}`}
                </p>
              </div>
              <span
                className={`pm-mono text-sm font-bold shrink-0 ${
                  entry.delta > 0 ? "text-emerald-600" : entry.delta < 0 ? "text-rose-600" : "text-[var(--color-text-dim)]"
                }`}
              >
                {entry.delta > 0 ? "+" : ""}
                {entry.delta.toFixed(2)} → {entry.apres.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// Petite modale d'explication générique pour les pastilles "Main" et "Côté"
// — met en évidence la valeur actuelle du joueur parmi les options
// possibles, avec la même lettre que celle affichée sur la carte.
function LetterInfoModal({ title, description, options, abbrevFn, currentValue, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-[var(--color-text-dim)]">{description}</p>
      <div className="flex flex-col gap-2 mt-3">
        {options.map((opt) => {
          const active = normalizeSide(currentValue) === opt;
          return (
            <div
              key={opt}
              className={`flex items-center gap-3 p-2.5 rounded-xl border ${
                active
                  ? "bg-[var(--color-lime)]/10 border-[var(--color-lime)]/40"
                  : "bg-[var(--color-surface-2)] border-[var(--color-border)]"
              }`}
            >
              <span
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                  active
                    ? "bg-[var(--color-lime)] text-white"
                    : "bg-white border border-[var(--color-border)] text-[var(--color-text-dim)]"
                }`}
              >
                {abbrevFn(opt)}
              </span>
              <span className="text-sm font-medium flex-1">{opt}</span>
              {active && <Icon.Check className="w-4 h-4 text-[var(--color-lime)] shrink-0" />}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function PlayerRow({ player, mvpCount = 0 }) {
  const { isAdmin, matches, rankingEnabled } = useAppData();
  const [showEdit, setShowEdit] = useState(false);
  const [showRankingHistory, setShowRankingHistory] = useState(false);
  // 'hand' | 'side' | null — quelle pop-up d'explication est ouverte.
  const [infoModal, setInfoModal] = useState(null);
  const levelInfo = LEVELS.find((l) => l.value === player.levelSortValue);
  // Seul l'admin peut ouvrir la fiche complète depuis "Équipe" — un joueur
  // modifie désormais son propre code PIN depuis "Mon profil".
  const canEdit = isAdmin;
  const playerStats = computePlayerStats(player.id, matches);
  // "Nx homme du match" — nombre de fois élu (voir jeu du Fun Center,
  // lib/mvp.js), compté une fois par PlayersView et transmis en prop. La
  // ligne reste toujours rendue (voir plus bas) pour que la carte garde une
  // hauteur constante, avec ou sans mention.
  const mvpLine = mvpCount > 0 ? `🏆 ${mvpCount}x homme du match` : "";

  // Ranking (voir claude/feature-ranking-padel-manager.md §6) — visible par
  // tous les joueurs une fois le switch admin activé (`rankingEnabled`), et
  // toujours visible pour l'admin quel que soit l'état du switch. Quand la
  // condition est fausse, l'emplacement disparaît entièrement (y compris le
  // badge "Non classé") — pas de placeholder.
  const showRanking = isAdmin || rankingEnabled;
  const rankingState = getPlayerRatingState(player);
  // Historique de ranking (icône admin) : décision explicite de Max — tant
  // que le Ranking n'est pas activé pour le club (`rankingEnabled`), cette
  // icône reste masquée même pour l'admin, pour ne pas garder un 4e
  // emplacement (2x2) dont personne ne se sert avant l'activation. Une fois
  // activé, se comporte comme avant (icône admin uniquement, si le joueur a
  // déjà un ranking).
  const showHistoryCell = isAdmin && rankingEnabled && rankingState.hasRanking;

  const levelLabel = levelInfo && levelInfo.value > 0 ? levelInfo.label : "/";
  const statsLine =
    playerStats.played === 0
      ? "Aucune statistique"
      : `${playerStats.played} match${playerStats.played > 1 ? "s" : ""} · ${playerStats.wins}V${
          playerStats.draws > 0 ? `-${playerStats.draws}N` : ""
        }-${playerStats.losses}D · ${playerStats.winRate}%`;

  const letterCellClass =
    "w-8 h-7 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[10px] font-bold text-[var(--color-text-dim)] flex items-center justify-center active:scale-95 transition-transform";
  const levelCellClass = `h-7 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[10px] font-bold text-[var(--color-text-dim)] flex items-center justify-center ${
    showHistoryCell ? "w-8" : "col-span-2 w-full"
  }`;

  return (
    <>
      <Card className="p-3">
        <div className="flex items-center gap-3">
          <PlayerAvatar player={player} size={36} className="self-start mt-0.5" />

          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {/* Ligne 1 : nom, ranking (si visible), créancier, puis les
                autres badges éventuels. */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-semibold text-sm truncate">{player.name}</span>
              {showRanking && (
                <Badge tone="lime" className="!px-1.5 !py-0.5 !text-[9px]">
                  {rankingState.hasRanking
                    ? `🎾 ${rankingState.score.toFixed(1).replace(".", ",")}`
                    : "Non classé"}
                </Badge>
              )}
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

          {/* Bloc de droite : main / côté / niveau / historique en 2x2 (ou
              2x1 + niveau seul en dessous si l'historique est masqué), puis
              le bouton modifier tout à droite de la carte. */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setInfoModal("hand")}
                aria-label={`Main dominante : ${player.dominantHand || "—"}. Toucher pour l'explication.`}
                className={letterCellClass}
              >
                {handAbbrev(player.dominantHand)}
              </button>
              <button
                type="button"
                onClick={() => setInfoModal("side")}
                aria-label={`Côté préféré : ${normalizeSide(player.preferredSide) || "—"}. Toucher pour l'explication.`}
                className={letterCellClass}
              >
                {sideAbbrev(player.preferredSide)}
              </button>
              <span className={levelCellClass} title="Niveau officiel">
                {levelLabel}
              </span>
              {showHistoryCell && (
                <button
                  type="button"
                  onClick={() => setShowRankingHistory(true)}
                  aria-label="Historique de ranking"
                  title="Historique de ranking"
                  className={`${letterCellClass} hover:text-[var(--color-lime)] hover:border-[var(--color-lime)]/50`}
                >
                  <Icon.History className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

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
      {infoModal === "hand" && (
        <LetterInfoModal
          title="Main dominante"
          description="La lettre affichée sur la carte indique la main avec laquelle le joueur tient sa raquette."
          options={HAND_OPTIONS}
          abbrevFn={handAbbrev}
          currentValue={player.dominantHand}
          onClose={() => setInfoModal(null)}
        />
      )}
      {infoModal === "side" && (
        <LetterInfoModal
          title="Côté préféré"
          description="La lettre affichée sur la carte indique le côté du terrain où le joueur préfère évoluer."
          options={SIDE_OPTIONS}
          abbrevFn={sideAbbrev}
          currentValue={player.preferredSide}
          onClose={() => setInfoModal(null)}
        />
      )}
    </>
  );
}
