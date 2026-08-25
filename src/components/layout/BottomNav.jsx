// ─────────────────────────────────────────────────────────────────────────
// Barre de navigation basse — attachée à <body> via un portail (voir
// commentaire dans le composant) pour ne jamais être piégée par un ancêtre.
// ─────────────────────────────────────────────────────────────────────────
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";

export function BottomNav({ view, setView }) {
  const { isAdmin, connectedPlayer } = useAppData();
  const tabs = [
    { id: "matches", label: "Matchs", icon: Icon.Trophy },
    { id: "players", label: "Équipe", icon: Icon.Users },
    { id: "stats", label: "Mon profil", icon: Icon.Chart },
    ...(connectedPlayer.isCreditor
      ? [{ id: "accounting", label: "Compta", icon: Icon.Coin }]
      : []),
    ...(isAdmin ? [{ id: "admin", label: "Administration", icon: Icon.Shield }] : []),
  ];
  const content = (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-[var(--color-nav)]/95 backdrop-blur-md border-t border-[var(--color-border)] flex px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
      {tabs.map((t) => {
        const active = view === t.id;
        const IconEl = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className="flex-1 flex flex-col items-center gap-1 py-1.5"
          >
            <IconEl
              className={cn(
                "w-5 h-5",
                active ? "text-sky-600" : "text-[var(--color-text-faint)]"
              )}
            />
            <span
              className={cn(
                "text-[11px] font-semibold",
                active ? "text-sky-600" : "text-[var(--color-text-faint)]"
              )}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
  // Portail : la barre est attachée directement à <body>, donc jamais
  // affectée par un ancêtre (transform, filtre...) ou une bizarrerie de
  // Safari iOS qui casserait son positionnement "fixed".
  return createPortal(content, document.body);
}
