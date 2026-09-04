// ─────────────────────────────────────────────────────────────────────────
// Une ligne de la liste Équipe : avatar, nom + badges, niveau/main/côté en
// colonnes fixes, stats de forme, bouton modifier.
// Le solde d'un créancier ne s'affiche plus ici — il vit uniquement dans
// l'onglet "Ma comptabilité" / "Administration".
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { isPlayerAdmin, handAbbrev, sideAbbrev, normalizeSide } from "../../lib/utils";
import { LEVELS } from "../../lib/constants";
import { computePlayerStats } from "../../lib/stats";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Card, Badge } from "../ui";
import { EditPlayerModal } from "./EditPlayerModal";
import { PlayerAvatar } from "./PlayerAvatar";

export function PlayerRow({ player }) {
  const { isAdmin, matches } = useAppData();
  const [showEdit, setShowEdit] = useState(false);
  const levelInfo = LEVELS.find((l) => l.value === player.levelSortValue);
  // Seul l'admin peut ouvrir la fiche complète depuis "Équipe" — un joueur
  // modifie désormais son propre code PIN depuis "Mon profil".
  const canEdit = isAdmin;
  const playerStats = computePlayerStats(player.id, matches);

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
            </div>
            <p className="text-[10px] text-[var(--color-text-faint)] mt-0.5 truncate">
              {playerStats.played === 0
                ? "Aucune statistique"
                : `${playerStats.played} match${playerStats.played > 1 ? "s" : ""} · ${playerStats.wins}V-${playerStats.losses}D · ${playerStats.winRate}%`}
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
    </>
  );
}
