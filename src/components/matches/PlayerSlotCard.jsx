// ─────────────────────────────────────────────────────────────────────────
// Une case de terrain : vide (cliquable pour assigner/s'inscrire) ou
// occupée par un participant (nom, statut de paiement, position fixe).
// ─────────────────────────────────────────────────────────────────────────
import { cn, getInitials, getFirstName, normalizeSide } from "../../lib/utils";
import { AVATAR_COLOR_CHOICES } from "../../lib/constants";
import Icon from "../icons/Icon";
import { Badge } from "../ui";

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
      <span className="px-1.5 py-0.5 rounded-full bg-white/60 backdrop-blur-md border border-white/70 text-[8px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] whitespace-nowrap">
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
            ? "border-white/70 bg-white/25 text-[var(--color-text-faint)] cursor-pointer hover:border-[var(--color-blue)]/40 hover:text-[var(--color-blue)]"
            : "border-white/40 bg-white/10 text-[var(--color-text-faint)]/70"
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
          ? "bg-amber-100/50 backdrop-blur-md border-amber-300/50"
          : "bg-white/50 backdrop-blur-md border-white/70",
        clickable && "cursor-pointer hover:border-[var(--color-blue)]/40"
      )}
    >
      {slotTag}
      <div className="flex items-start gap-2">
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-[var(--color-text)] shrink-0"
          style={{ backgroundColor: playerRecord?.avatarColor || AVATAR_COLOR_CHOICES[0] }}
        >
          {getInitials(participant.name)}
        </span>
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
          {trackPayments && (
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
              {isCreditorParticipant && isAdmin && (
                <Badge tone="lime" className="!px-1.5 !py-0.5 !text-[10px]">
                  Créancier
                </Badge>
              )}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
