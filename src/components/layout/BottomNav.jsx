// ─────────────────────────────────────────────────────────────────────────
// Barre de navigation basse — attachée à <body> via un portail (voir
// commentaire dans le composant) pour ne jamais être piégée par un ancêtre.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";

// Largeur de l'écran, mise à jour quand on tourne le téléphone.
function useScreenWidth() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 400 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return w;
}

export function BottomNav({ view, setView }) {
  const { isAdmin, connectedPlayer, gameCenterEnabled } = useAppData();
  const screenWidth = useScreenWidth();
  // Depuis le 19/10/2026, tous les onglets ont un fond bleu foncé (et le
  // Game Center un fond sombre) : l'ancien "verre clair" avec texte gris-bleu
  // devenait illisible. La barre est donc toujours en "verre sombre" : fond
  // bleu nuit translucide, bordure claire, libellés blancs bien lisibles.
  const tabs = [
    { id: "matches", label: "Matchs", icon: Icon.Trophy },
    { id: "players", label: "Équipe", icon: Icon.Users },
    { id: "stats", label: "Mon profil", short: "Profil", icon: Icon.Chart },
    ...(connectedPlayer.isCreditor
      ? [{ id: "accounting", label: "Compta", icon: Icon.Coin }]
      : []),
    // Visible pour l'admin en permanence ; pour les autres joueurs
    // uniquement si l'admin l'a activé depuis l'onglet Administration.
    ...(isAdmin || gameCenterEnabled
      ? [{ id: "game-center", label: "Game Center", short: "Jeux", icon: Icon.Gamepad }]
      : []),
    ...(isAdmin ? [{ id: "admin", label: "Admin", icon: Icon.Shield }] : []),
  ];
  // (19/10/2026) Compatibilité petits téléphones : avec 5 ou 6 onglets
  // (admin/créancier), "Mon profil" et "Game Center" ne tenaient plus dans
  // leur case sur les écrans étroits (iPhone SE, petits Android) et les
  // libellés se chevauchaient. On calcule la place réelle de chaque onglet
  // et, si elle est trop petite, on affiche une version courte du libellé
  // ("Profil", "Jeux") — jamais de texte coupé par des "…".
  const navWidth = Math.min(screenWidth - 24, 448); // 448 px = max-w-md
  const perTab = (navWidth - 16) / tabs.length;
  const compact = perTab < 68;

  const content = (
    <nav
      className={cn(
        "pm-bottom-nav fixed left-1/2 -translate-x-1/2 z-30 bottom-[max(0.9rem,env(safe-area-inset-bottom))] w-[calc(100%-1.5rem)] max-w-md backdrop-blur-2xl backdrop-saturate-150 border rounded-full shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)] flex px-2 py-1.5",
        "bg-[#0B1A33]/80 border-white/15"
      )}
    >
      {tabs.map((t) => {
        const active = view === t.id;
        const IconEl = t.icon;
        const inactiveColor = "text-white/75";
        return (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            aria-label={t.label}
            aria-current={active ? "page" : undefined}
            className="flex-1 min-w-0 flex flex-col items-center gap-1 py-1.5"
          >
            <span
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                active && "bg-[var(--color-lime)]/20"
              )}
            >
              <IconEl
                className={cn("w-5 h-5", active ? "text-[var(--color-lime)]" : inactiveColor)}
              />
            </span>
            <span
              className={cn(
                "text-[10px] font-semibold whitespace-nowrap",
                active ? "text-[var(--color-lime)]" : inactiveColor
              )}
            >
              {compact && t.short ? t.short : t.label}
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
