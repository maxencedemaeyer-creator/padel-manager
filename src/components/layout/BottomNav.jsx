// ─────────────────────────────────────────────────────────────────────────
// Barre de navigation basse — attachée à <body> via un portail (voir
// commentaire dans le composant) pour ne jamais être piégée par un ancêtre.
// ─────────────────────────────────────────────────────────────────────────
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";

export function BottomNav({ view, setView }) {
  const { isAdmin, connectedPlayer, gameCenterEnabled } = useAppData();
  // Le Game Center a un fond sombre (voir GameCenterView.jsx) au lieu du
  // fond clair habituel du reste de l'app : le verre clair de la barre
  // (bg-white/60 + texte gris-bleu clair) s'y fondait presque entièrement,
  // devenant illisible. Sur cet onglet uniquement, on bascule la barre sur
  // une variante "verre sombre" (fond noir translucide, bordure et texte
  // clairs) — sur tous les autres onglets, rien ne change.
  const isDark = view === "game-center";
  const tabs = [
    { id: "matches", label: "Matchs", icon: Icon.Trophy },
    { id: "players", label: "Équipe", icon: Icon.Users },
    { id: "stats", label: "Mon profil", icon: Icon.Chart },
    ...(connectedPlayer.isCreditor
      ? [{ id: "accounting", label: "Compta", icon: Icon.Coin }]
      : []),
    // Visible pour l'admin en permanence ; pour les autres joueurs
    // uniquement si l'admin l'a activé depuis l'onglet Administration.
    ...(isAdmin || gameCenterEnabled
      ? [{ id: "game-center", label: "Game Center", icon: Icon.Gamepad }]
      : []),
    ...(isAdmin ? [{ id: "admin", label: "Administration", icon: Icon.Shield }] : []),
  ];
  const content = (
    <nav
      className={cn(
        "fixed left-1/2 -translate-x-1/2 z-30 bottom-[max(0.9rem,env(safe-area-inset-bottom))] w-[calc(100%-1.5rem)] max-w-md backdrop-blur-2xl backdrop-saturate-150 border rounded-full shadow-[0_12px_32px_-8px_rgba(20,33,61,0.18)] flex px-2 py-1.5",
        isDark ? "bg-black/45 border-white/15" : "bg-white/60 border-white/70"
      )}
    >
      {tabs.map((t) => {
        const active = view === t.id;
        const IconEl = t.icon;
        const inactiveColor = isDark ? "text-white/55" : "text-[var(--color-text-faint)]";
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
                className={cn("w-5 h-5", active ? "text-[var(--color-lime)]" : inactiveColor)}
              />
            </span>
            <span
              className={cn(
                "text-[10px] font-semibold",
                active ? "text-[var(--color-lime)]" : inactiveColor
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
