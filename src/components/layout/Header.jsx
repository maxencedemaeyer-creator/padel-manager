// ─────────────────────────────────────────────────────────────────────────
// En-tête fixe : profil (→ Mon profil), clochette de désinscriptions
// tardives (admin), déconnexion.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { cn, formatDateFR, getFirstName } from "../../lib/utils";
import { AVATAR_COLOR_CHOICES } from "../../lib/constants";
import { useWithdrawalAlerts } from "../../lib/withdrawalWatcher";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal, Button, Card, Badge, EmptyState } from "../ui";

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

export function Header({ setView }) {
  const { connectedPlayer, isAdmin, logout } = useAppData();
  const withdrawalAlerts = useWithdrawalAlerts();
  const [showAlerts, setShowAlerts] = useState(false);
  const unreadCount = withdrawalAlerts.filter((a) => !a.read).length;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-5 py-4 bg-[var(--color-nav)]/90 backdrop-blur-md border-b border-[var(--color-border)]">
      <div className="flex items-center gap-2">
        <Icon.Ball className="w-5 h-5 text-[var(--color-lime)]" />
        <span className="pm-display font-extrabold text-base">Padel Manager</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView("stats")}
          aria-label="Mon profil"
          className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-sky-300"
        >
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
            style={{ backgroundColor: connectedPlayer.avatarColor || AVATAR_COLOR_CHOICES[0] }}
          >
            {connectedPlayer.emoji || "🎾"}
          </span>
          <span className="text-xs font-semibold max-w-[80px] truncate">
            {getFirstName(connectedPlayer.name)}
          </span>
          {isAdmin && (
            <Badge tone="lime" className="!px-1.5 !py-0.5">
              Admin
            </Badge>
          )}
        </button>
        {isAdmin && (
          <button
            onClick={() => setShowAlerts(true)}
            aria-label="Alertes de désinscription"
            className="relative p-2.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-sky-700 hover:border-sky-300"
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
          className="p-2.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/40"
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
