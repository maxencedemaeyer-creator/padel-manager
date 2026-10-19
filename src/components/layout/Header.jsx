// ─────────────────────────────────────────────────────────────────────────
// Clochette des désinscriptions tardives (ADMIN uniquement) + sa fenêtre.
//
// (19/10/2026) L'ancien bandeau supérieur de l'app (logo, profil,
// actualiser, clochette, déconnexion) a été supprimé pour gagner de la
// place à l'écran :
//   - la clochette est désormais dans le bloc "Bonjour" (onglet Matchs),
//     via le composant AdminAlertsBell ci-dessous ;
//   - la déconnexion est dans "Mon profil", à côté de la roulette ⚙️.
// Le fichier garde son nom (Header.jsx) pour ne rien casser ailleurs.
//
// Économie Firebase : l'écoute des alertes n'est plus lancée que chez
// l'admin (avant, chaque joueur la lançait pour rien, la clochette
// n'étant affichée qu'à l'admin). Elle est démarrée UNE seule fois puis
// conservée : changer d'onglet et revenir ne relit pas les alertes.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "../../firebase";
import { cn, formatDateFR } from "../../lib/utils";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal, Button, Card, EmptyState } from "../ui";

// Petite mémoire partagée : une seule écoute Firestore pour toute la durée
// de la visite, quel que soit le nombre de fois où la clochette s'affiche.
let alertsCache = [];
let alertsStarted = false;
const alertsSubscribers = new Set();

function startAlertsListener() {
  if (alertsStarted) return;
  alertsStarted = true;
  try {
    const q = query(collection(db, "withdrawals"), where("alertWorthy", "==", true));
    onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => new Date(b.leftAt) - new Date(a.leftAt));
        alertsCache = list;
        alertsSubscribers.forEach((fn) => fn(list));
      },
      (error) => console.error(error)
    );
  } catch (error) {
    console.error(error);
  }
}

function useAdminWithdrawalAlerts() {
  const [alerts, setAlerts] = useState(alertsCache);
  useEffect(() => {
    startAlertsListener();
    alertsSubscribers.add(setAlerts);
    setAlerts(alertsCache);
    return () => {
      alertsSubscribers.delete(setAlerts);
    };
  }, []);
  return alerts;
}

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

// Bouton clochette (style "bloc Bonjour" : rond blanc translucide sur fond
// bleu) + pastille rouge du nombre d'alertes non lues. Ne s'affiche que
// pour l'admin — les autres joueurs ne voient rien et ne lisent rien.
export function AdminAlertsBell() {
  const { isAdmin } = useAppData();
  if (!isAdmin) return null;
  return <AdminAlertsBellInner />;
}

function AdminAlertsBellInner() {
  const alerts = useAdminWithdrawalAlerts();
  const [showAlerts, setShowAlerts] = useState(false);
  const unreadCount = alerts.filter((a) => !a.read).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowAlerts(true)}
        aria-label="Alertes de désinscription"
        title="Désinscriptions tardives"
        className="relative p-2 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 transition-all"
      >
        <Icon.Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {showAlerts && (
        <WithdrawalAlertsModal alerts={alerts} onClose={() => setShowAlerts(false)} />
      )}
    </>
  );
}
