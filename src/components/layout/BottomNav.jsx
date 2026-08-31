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
    <nav className="fixed left-1/2 -translate-x-1/2 z-30 bottom-[max(0.9rem,env(safe-area-inset-bottom))] w-[calc(100%-1.5rem)] max-w-md bg-white/60 backdrop-blur-2xl backdrop-saturate-150 border border-white/70 rounded-full shadow-[0_12px_32px_-8px_rgba(20,33,61,0.18)] flex px-2 py-1.5">
      {tabs.map((t) => {
        const active = view === t.id;
        const IconEl = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className="flex-1 flex flex-col items-center gap-1 py-1.5"
          >
            <span
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                active && "bg-[var(--color-lime)]/15"
              )}
            >
              <IconEl
                className={cn(
                  "w-5 h-5",
                  active ? "text-[var(--color-lime)]" : "text-[var(--color-text-faint)]"
                )}
              />
            </span>
            <span
              className={cn(
                "text-[10px] font-semibold",
                active ? "text-[var(--color-lime)]" : "text-[var(--color-text-faint)]"
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
