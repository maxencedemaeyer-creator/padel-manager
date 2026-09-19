// ─────────────────────────────────────────────────────────────────────────
// En-tête fixe : profil (→ Mon profil), actualisation, clochette de
// désinscriptions tardives (admin), déconnexion.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { cn, formatDateFR, getFirstName } from "../../lib/utils";
import { useWithdrawalAlerts } from "../../lib/withdrawalWatcher";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal, Button, Card, Badge, EmptyState } from "../ui";
import { PlayerAvatar } from "../players/PlayerAvatar";

export function WithdrawalAlertsModal({ alerts, onClose }) {
  const [busyId, setBusyId] = useState(null);

  const markRead = async (id) => {
    setBusyId(id);
    try {
      await updateDoc(doc(db, "withdrawals", id), { read: true });
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setBusyId(null);
    }
  };

  const unreadCount = alerts.filter((a) => !a.read).length;

  const markAllRead = async () => {
    setBusyId("all");
    try {
      await Promise.all(
        alerts
          .filter((a) => !a.read)
          .map((a) => updateDoc(doc(db, "withdrawals", a.id), { read: true }))
      );
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      title="Désinscriptions tardives"
      onClose={onClose}
      wide
      footer={
        unreadCount > 0 ? (
          <Button variant="secondary" onClick={markAllRead} disabled={busyId === "all"}>
            Tout marquer comme lu
          </Button>
        ) : undefined
      }
    >
      {alerts.length === 0 ? (
        <EmptyState
          icon={<Icon.Bell className="w-6 h-6" />}
          title="Aucune alerte"
          subtitle="Les désinscriptions à moins de 72h d'un match apparaîtront ici (les simples changements de créneau/équipe le même jour sont ignorés)."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {alerts.map((a) => (
            <Card key={a.id} className={cn("p-3.5", !a.read && "border-rose-300")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{a.playerName}</p>
                  <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
                    S'est désinscrit du match du {formatDateFR(a.matchDate)}
                    {a.matchTime ? ` à ${a.matchTime}` : ""}
                    {a.matchLocation ? ` (${a.matchLocation})` : ""}
                  </p>
                  {a.hoursBefore != null && (
                    <p className="text-[11px] text-rose-600 font-semibold mt-1">
                      {a.hoursBefore}h avant le match
                    </p>
                  )}
                </div>
                {!a.read && (
                  <button
                    type="button"
                    onClick={() => markRead(a.id)}
                    disabled={busyId === a.id}
                    className="shrink-0 text-[11px] font-semibold text-sky-700 underline underline-offset-2"
                  >
                    Marquer comme lu
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function Header({ setView, view }) {
  const { connectedPlayer, isAdmin, logout } = useAppData();
  const withdrawalAlerts = useWithdrawalAlerts();
  const [showAlerts, setShowAlerts] = useState(false);
  const unreadCount = withdrawalAlerts.filter((a) => !a.read).length;
  // Même principe que BottomNav.jsx : sur le Game Center (fond sombre),
  // l'en-tête clair habituel (fond blanc, texte/boutons foncés) devient
  // illisible. On bascule uniquement sur cet onglet vers une variante
  // sombre — partout ailleurs, l'en-tête garde son style clair d'origine.
  const isDark = view === "game-center";
  // Base commune (fond/bordure/texte) des boutons ronds à droite — seule la
  // couleur au survol reste propre à chaque bouton (sky pour actualiser/
  // cloche, danger pour la déconnexion), inchangée par rapport à avant.
  const iconBtnBase = cn(
    "p-2.5 rounded-full transition-colors",
    isDark
      ? "bg-white/10 border border-white/15 text-white/70"
      : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-dim)]"
  );
  const iconBtnHoverSky = isDark
    ? "hover:text-[var(--color-lime)] hover:border-[var(--color-lime)]/50"
    : "hover:text-sky-700 hover:border-sky-300";

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center justify-between px-5 py-4 backdrop-blur-md border-b",
        isDark ? "bg-black/45 border-white/10" : "bg-[var(--color-nav)]/90 border-[var(--color-border)]"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon.Ball className="w-5 h-5 text-[var(--color-lime)] shrink-0" />
        {/* Chez l'admin, la mention est réduite (et se réagrandit à partir
            de sm:) pour laisser assez de place aux 3 boutons de droite
            (profil, cloche, déconnexion) sans que rien ne soit coupé. */}
        <span
          className={cn(
            "pm-display font-extrabold truncate",
            isAdmin ? "text-xs sm:text-base" : "text-base",
            isDark && "text-white"
          )}
        >
          Padel Manager
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setView("stats")}
          aria-label="Mon profil"
          className={cn(
            "flex items-center gap-2 pl-1 pr-3 py-1 rounded-full transition-colors",
            isDark
              ? "bg-white/10 border border-white/15 hover:border-[var(--color-lime)]/50"
              : "bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-sky-300"
          )}
        >
          <PlayerAvatar player={connectedPlayer} size={28} />
          <span
            className={cn(
              "text-xs font-semibold max-w-[80px] truncate",
              isDark && "text-white"
            )}
          >
            {getFirstName(connectedPlayer.name)}
          </span>
          {isAdmin && (
            <Badge tone="lime" className="!px-1.5 !py-0.5">
              Admin
            </Badge>
          )}
        </button>
        <button
          onClick={() => window.location.reload()}
          aria-label="Actualiser la page"
          title="Actualiser la page"
          className={cn(iconBtnBase, iconBtnHoverSky)}
        >
          <Icon.Refresh className="w-4 h-4" />
        </button>
        {isAdmin && (
          <button
            onClick={() => setShowAlerts(true)}
            aria-label="Alertes de désinscription"
            className={cn("relative", iconBtnBase, iconBtnHoverSky)}
          >
            <Icon.Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        )}
        <button
          onClick={logout}
          aria-label="Déconnexion"
          className={cn(
            iconBtnBase,
            "hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/40"
          )}
        >
          <Icon.Logout className="w-4 h-4" />
        </button>
      </div>
      {showAlerts && (
        <WithdrawalAlertsModal alerts={withdrawalAlerts} onClose={() => setShowAlerts(false)} />
      )}
    </header>
  );
}
