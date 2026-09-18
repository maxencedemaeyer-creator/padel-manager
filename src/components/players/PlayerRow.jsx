// ─────────────────────────────────────────────────────────────────────────
// Une ligne de la liste Équipe : avatar, nom + badges, niveau/main/côté en
// colonnes fixes, stats de forme, bouton modifier.
// Le solde d'un créancier ne s'affiche plus ici — il vit uniquement dans
// l'onglet "Ma comptabilité" / "Administration".
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { isPlayerAdmin, handAbbrev, sideAbbrev, normalizeSide, formatDateFR } from "../../lib/utils";
import { LEVELS } from "../../lib/constants";
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

export function PlayerRow({ player, mvpCount = 0 }) {
  const { isAdmin, matches, rankingEnabled } = useAppData();
  const [showEdit, setShowEdit] = useState(false);
  const [showRankingHistory, setShowRankingHistory] = useState(false);
  const levelInfo = LEVELS.find((l) => l.value === player.levelSortValue);
  // Seul l'admin peut ouvrir la fiche complète depuis "Équipe" — un joueur
  // modifie désormais son propre code PIN depuis "Mon profil".
  const canEdit = isAdmin;
  const playerStats = computePlayerStats(player.id, matches);
  // "Nx homme du match" — nombre de fois élu (voir jeu du Fun Center,
  // lib/mvp.js), compté une fois par PlayersView et transmis en prop.
  const mvpSuffix = mvpCount > 0 ? ` · ${mvpCount}x homme du match` : "";

  // Ranking (voir claude/feature-ranking-padel-manager.md §6) — visible par
  // tous les joueurs une fois le switch admin activé (`rankingEnabled`), et
  // toujours visible pour l'admin quel que soit l'état du switch. Quand la
  // condition est fausse, l'emplacement disparaît entièrement (y compris le
  // badge "Non classé") — pas de placeholder.
  const showRanking = isAdmin || rankingEnabled;
  const rankingState = getPlayerRatingState(player);

  return (
    <>
      <Card className="p-3">
        <div className="grid grid-cols-[36px_1fr_44px_24px_24px_auto] items-center gap-2.5">
          <PlayerAvatar player={player} size={36} />

          <div className="min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-semibold text-sm truncate">{player.name}</span>
              {isPlayerAdmin(player) && (
                <Badge tone="lime" className="!px-1.5 !py-0.5 !text-[9px]">
                  Admin
                </Badge>
              )}
              {player.isCreditor && isAdmin && (
                <Badge tone="blue" className="!px-1.5 !py-0.5 !text-[9px]">
                  Créancier
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
              {showRanking && (
                <Badge tone="lime" className="!px-1.5 !py-0.5 !text-[9px]">
                  {rankingState.hasRanking
                    ? `🎾 ${rankingState.score.toFixed(1).replace(".", ",")}`
                    : "Non classé"}
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-[var(--color-text-faint)] mt-0.5 truncate">
              {playerStats.played === 0 && mvpCount === 0
                ? "Aucune statistique"
                : playerStats.played === 0
                ? `Aucune statistique${mvpSuffix}`
                : `${playerStats.played} match${playerStats.played > 1 ? "s" : ""} · ${playerStats.wins}V${playerStats.draws > 0 ? `-${playerStats.draws}N` : ""}-${playerStats.losses}D · ${playerStats.winRate}%${mvpSuffix}`}
            </p>
          </div>

          <span
            className="text-[11px] font-semibold text-[var(--color-text-dim)] text-center truncate"
            title="Niveau"
          >
            {levelInfo && levelInfo.value > 0 ? levelInfo.label : "/"}
          </span>
          <span
            className="w-6 h-6 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[10px] font-bold text-[var(--color-text-dim)] flex items-center justify-center"
            title={`Main : ${player.dominantHand || "—"}`}
          >
            {handAbbrev(player.dominantHand)}
          </span>
          <span
            className="w-6 h-6 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[10px] font-bold text-[var(--color-text-dim)] flex items-center justify-center"
            title={`Côté : ${normalizeSide(player.preferredSide) || "—"}`}
          >
            {sideAbbrev(player.preferredSide)}
          </span>

          <div className="flex items-center gap-1.5 justify-end">
            {isAdmin && rankingState.hasRanking && (
              <button
                onClick={() => setShowRankingHistory(true)}
                aria-label="Historique de ranking"
                title="Historique de ranking"
                className="p-1.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-lime)] hover:border-[var(--color-lime)]/50 shrink-0"
              >
                <Icon.History className="w-3.5 h-3.5" />
              </button>
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
    </>
  );
}
