// ─────────────────────────────────────────────────────────────────────────
// Une case de terrain : vide (cliquable pour assigner/s'inscrire) ou
// occupée par un participant (nom, statut de paiement, position fixe).
// ─────────────────────────────────────────────────────────────────────────
import { cn, getFirstName, normalizeSide } from "../../lib/utils";
import Icon from "../icons/Icon";
import { Badge } from "../ui";
import { PlayerAvatar } from "../players/PlayerAvatar";

export function PlayerSlotCard({
  participant,
  playerRecord,
  canAssign,
  canSelfManage,
  isSelfSlot,
  canPay,
  isCreditorParticipant,
  trackPayments,
  slotTeam,
  slotSide,
  isWinningTeam,
  isAdmin,
  onAssignClick,
  onSelfClick,
  onPayClick,
}) {
  const clickable = canAssign || canSelfManage;
  const handleClick = canAssign ? onAssignClick : canSelfManage ? onSelfClick : undefined;

  // Étiquette de position — dans le flux normal (pas en position absolue) pour
  // ne jamais chevaucher le nom du joueur, même sur un écran mobile étroit.
  const slotTag = (
    <div className="flex justify-end mb-1">
      <span className="px-1.5 py-0.5 rounded-full bg-white/85 border border-white/70 text-[8px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] whitespace-nowrap">
        Team {slotTeam} · {slotSide}
      </span>
    </div>
  );

  if (!participant) {
    return (
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={handleClick}
        className={cn(
          "flex flex-col p-3 rounded-2xl border-2 border-dashed min-h-[86px]",
          clickable
            ? "border-[var(--color-border)] bg-white/25 text-[var(--color-text-faint)] cursor-pointer hover:border-[var(--color-blue)]/50 hover:text-[var(--color-blue)]"
            : "border-[var(--color-border)] bg-white/10 text-[var(--color-text-faint)]/70"
        )}
      >
        {slotTag}
        <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center">
          <Icon.Plus className="w-4 h-4" />
          <span className="text-[11px] font-medium">
            {canSelfManage ? "S'inscrire ici" : "Emplacement libre"}
          </span>
        </div>
      </div>
    );
  }

  const paid = isCreditorParticipant || participant.paidStatus === "paid";
  const badgeTone = isCreditorParticipant ? "blue" : paid ? "paid" : "unpaid";
  const badgeLabel = isCreditorParticipant ? "Avancé" : paid ? "Payé" : "Attente";
  // Demande du 02/09/2026 : la notion de "créancier" (qui a avancé l'argent
  // pour ce match) reste invisible pour les joueurs, mais doit être visible
  // pour l'admin. Un joueur non-admin ne voit donc plus du tout la pastille
  // de paiement sur une place "couverte" par un créancier (elle n'apporte de
  // toute façon aucune action possible pour lui : le bouton est déjà
  // désactivé dans ce cas via canPay/paid ci-dessous).
  const hideCreditorStatusFromPlayer = isCreditorParticipant && !isAdmin;
  const side = normalizeSide(playerRecord?.preferredSide);
  const roleLabel =
    side === "Droite" ? "Joueur de droite" : side === "Gauche" ? "Joueur de gauche" : "Polyvalent";

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={handleClick}
      className={cn(
        "flex flex-col p-3 rounded-2xl border min-h-[86px]",
        isWinningTeam
          ? "bg-amber-100/80 border-amber-300/50"
          : "bg-white/85 border-[var(--color-border)]",
        clickable && "cursor-pointer hover:border-[var(--color-blue)]/50"
      )}
    >
      {slotTag}
      <div className="flex items-start gap-2">
        <PlayerAvatar player={playerRecord} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block sm:hidden text-sm font-semibold truncate">
            {isWinningTeam && "🏆 "}
            {getFirstName(participant.name)}
          </span>
          <span className="hidden sm:block text-sm font-semibold truncate">
            {isWinningTeam && "🏆 "}
            {participant.name}
          </span>
          <span className="block text-[10px] text-[var(--color-text-faint)] mb-1">
            {roleLabel}
            {isSelfSlot && canSelfManage && " · toucher pour se désinscrire"}
          </span>
          {trackPayments && !hideCreditorStatusFromPlayer && (
            <span className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                disabled={!canPay || paid}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canPay && !paid) onPayClick();
                }}
              >
                <Badge tone={badgeTone} className="!px-1.5 !py-0.5 !text-[10px]">
                  {badgeLabel}
                </Badge>
              </button>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
