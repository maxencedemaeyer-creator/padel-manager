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
  matchStarted,
  slotTeam,
  slotSide,
  isWinningTeam,
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

  // Statut de paiement : un joueur paie (presque) toujours APRÈS le match,
  // donc "Attente" n'a d'intérêt qu'une fois le match commencé ou terminé.
  //  - Place couverte par un créancier ("Avancé") : plus aucune pastille pour
  //    personne (l'info reste visible via les petits avatars à côté du nom du
  //    terrain, voir CourtPanel).
  //  - "Payé" : toujours affiché (cas rare d'un paiement fait à l'avance).
  //  - "Attente" : affiché seulement quand le match a commencé (matchStarted).
  const paid = participant.paidStatus === "paid";
  const badgeTone = paid ? "paid" : "unpaid";
  const badgeLabel = paid ? "Payé" : "Attente";
  const showPaymentBadge =
    trackPayments && !isCreditorParticipant && (paid || matchStarted);
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
          {/* Le nom affiché doit toujours refléter la fiche joueur actuelle
              (playerRecord), pas l'instantané figé dans participant.name au
              moment où il a été assigné à cette place — sinon un changement
              de nom depuis l'onglet Équipe n'apparaît jamais ici tant que le
              joueur n'est pas réassigné à une place. Le repli sur
              participant.name reste utile si la fiche a depuis été
              totalement supprimée de Firestore. */}
          <span className="block sm:hidden text-sm font-semibold truncate">
            {isWinningTeam && "🏆 "}
            {getFirstName(playerRecord?.name || participant.name)}
          </span>
          <span className="hidden sm:block text-sm font-semibold truncate">
            {isWinningTeam && "🏆 "}
            {playerRecord?.name || participant.name}
          </span>
          <span className="block text-[10px] text-[var(--color-text-faint)] mb-1">
            {roleLabel}
            {isSelfSlot && canSelfManage && " · toucher pour se désinscrire"}
          </span>
          {showPaymentBadge && (
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
