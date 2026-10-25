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
  const { perms, gameCenterEnabled } = useAppData();
  const screenWidth = useScreenWidth();
  // Depuis le 19/10/2026, tous les onglets ont un fond bleu foncé (et le
  // Game Center un fond sombre) : l'ancien "verre clair" avec texte gris-bleu
  // devenait illisible. La barre est donc toujours en "verre sombre" : fond
  // bleu nuit translucide, bordure claire, libellés blancs bien lisibles.
  const tabs = [
    { id: "matches", label: "Matchs", icon: Icon.Trophy },
    { id: "players", label: "Équipe", icon: Icon.Users },
    { id: "stats", label: "Mon profil", short: "Profil", icon: Icon.Chart },
    ...(perms.accessAccountingTab
      ? [{ id: "accounting", label: "Compta", icon: Icon.Coin }]
      : []),
    // Visible pour l'admin en permanence ; pour les autres joueurs
    // uniquement si l'admin l'a activé depuis l'onglet Administration.
    ...(perms.seeGameCenterAlways || gameCenterEnabled
      ? [{ id: "game-center", label: "Game Center", short: "Jeux", icon: Icon.Gamepad }]
      : []),
    ...(perms.accessAdminTab ? [{ id: "admin", label: "Admin", icon: Icon.Shield }] : []),
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

  // (25/10/2026) La barre n'est plus "flottante" : elle est collée en bas
  // de l'écran sur toute la largeur, comme une app native.
  // - iPhone (encoche / Dynamic Island) : le fond descend jusqu'au bord,
  //   mais les icônes restent au-dessus du petit trait blanc (zone système).
  // - Android (gestes ou 3 boutons) : simple petite marge de 6 px.
  // - Téléphone à l'horizontale : les onglets évitent l'encoche sur les côtés.
  // - Ordinateur : la barre prend toute la largeur, onglets centrés.
  const content = (
    <nav
      className="pm-bottom-nav lg:hidden fixed inset-x-0 bottom-0 z-30 bg-[#0B1A33]/95 backdrop-blur-2xl backdrop-saturate-150 border-t border-white/10 pt-1"
      style={{
        paddingBottom: "max(6px, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
        paddingRight: "max(0.5rem, env(safe-area-inset-right))",
      }}
    >
      <div className="flex w-full max-w-md mx-auto">
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
      </div>
    </nav>
  );
  // (25/10/2026) Sur ordinateur (écran de 1024 px ou plus) : la barre du bas
  // est cachée et la navigation passe dans une colonne fixe à gauche, avec le
  // logo, "Padel Manager" et le nom complet des onglets. Le contenu de l'app
  // est décalé de la même largeur (240 px) dans App.tsx ("lg:pl-60").
  const sidebar = (
    <aside className="pm-side-nav hidden lg:flex fixed top-0 left-0 bottom-0 z-30 w-60 flex-col bg-[#0B1A33]/95 backdrop-blur-2xl border-r border-white/10 px-4 py-7 overflow-y-auto">
      <div className="flex items-center gap-3 px-2 pb-8">
        <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl" />
        <span className="text-white text-lg font-bold whitespace-nowrap">Padel Manager</span>
      </div>
      {tabs.map((t) => {
        const active = view === t.id;
        const IconEl = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            aria-label={t.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "w-full flex items-center gap-3.5 px-4 py-3 mb-1 rounded-2xl text-[15px] font-semibold text-left transition-colors",
              active
                ? "bg-[var(--color-lime)]/20 text-[var(--color-lime)]"
                : "text-white/75 hover:bg-white/5 hover:text-white"
            )}
          >
            <IconEl className="w-5 h-5 shrink-0" />
            <span className="whitespace-nowrap">{t.label}</span>
            {active && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--color-lime)]" />
            )}
          </button>
        );
      })}
    </aside>
  );
  // Portail : les barres sont attachées directement à <body>, donc jamais
  // affectées par un ancêtre (transform, filtre...) ou une bizarrerie de
  // Safari iOS qui casserait leur positionnement "fixed".
  return createPortal(
    <>
      {content}
      {sidebar}
    </>,
    document.body
  );
}
