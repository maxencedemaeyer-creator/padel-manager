// ─────────────────────────────────────────────────────────────────────────
// Onglet "Game Center" — mini-jeux et animations du club, présentés comme
// des applications sur un écran d'accueil iPhone (icône carrée en dégradé +
// nom affiché en dessous). Fond dédié "gaming" (dégradé sombre + halos
// néon + grille), différent du reste de l'app. Les jeux sont ajoutés ici
// progressivement (voir la grille ci-dessous). Visible en permanence par
// l'admin ; pour les autres joueurs, uniquement si l'admin l'a activé
// depuis l'onglet Administration (voir src/views/AdminView.jsx et
// src/hooks/useFirestoreData.js → useAppSettings).
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import Icon from "../components/icons/Icon";
import { TourneeGeneraleModal } from "../components/games/TourneeGeneraleModal";
import { KillerModal } from "../components/games/KillerModal";
import { BrickBreakerModal } from "../components/games/BrickBreakerModal";
import { MvpVoteModal } from "../components/games/MvpVoteModal";

// Une "app" du Game Center : icône carrée façon iPhone (dégradé propre au
// jeu, reflet, ombre portée) + nom affiché en dessous, comme sur un écran
// d'accueil — plutôt qu'une carte classique.
function GameApp({ emoji, label, gradient, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
    >
      <span
        className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-[22%] flex items-center justify-center text-3xl sm:text-4xl shadow-[0_10px_24px_-6px_rgba(0,0,0,0.6)] ring-1 ring-white/15 overflow-hidden"
        style={{ background: gradient }}
      >
        <span className="absolute inset-0 bg-gradient-to-b from-white/25 via-white/0 to-black/10 pointer-events-none" />
        <span className="relative drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]">{emoji}</span>
      </span>
      <span className="text-[11px] font-medium text-white/90 text-center leading-tight max-w-[4.5rem]">
        {label}
      </span>
    </button>
  );
}

export function GameCenterView() {
  // Jeu actuellement ouvert en fenêtre modale, ou null si aucun.
  const [openGame, setOpenGame] = useState(null);

  return (
    <div
      className="relative overflow-hidden px-4 pt-4 pb-28 min-h-screen"
      style={{
        background:
          "radial-gradient(circle at 15% 8%, rgba(168,85,247,0.35), transparent 45%), radial-gradient(circle at 90% 15%, rgba(34,211,238,0.28), transparent 50%), radial-gradient(circle at 50% 100%, rgba(236,72,153,0.16), transparent 55%), linear-gradient(180deg, #0B0B1E 0%, #13132C 55%, #0B0B1E 100%)",
      }}
    >
      {/* Grille néon décorative, purement visuelle (aucune interaction) */}
      <div
        className="absolute inset-0 opacity-[0.15] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse at top, black 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at top, black 0%, transparent 70%)",
        }}
      />

      <div className="relative flex items-center justify-center gap-2 mb-8">
        <Icon.Gamepad className="w-5 h-5 text-[var(--color-lime)]" />
        <h2 className="pm-display font-bold text-xl text-white text-center">Game Center</h2>
      </div>

      <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-8 max-w-md mx-auto">
        <GameApp
          emoji="🍻"
          label="Tournée générale"
          gradient="linear-gradient(160deg, #FDBA74 0%, #F97316 55%, #C2410C 100%)"
          onClick={() => setOpenGame("tournee-generale")}
        />
        <GameApp
          emoji="🔪"
          label="Killer"
          gradient="linear-gradient(160deg, #FB7185 0%, #E11D48 55%, #881337 100%)"
          onClick={() => setOpenGame("killer")}
        />
        <GameApp
          emoji="🧱"
          label="Brick Breaker"
          gradient="linear-gradient(160deg, #67E8F9 0%, #0EA5E9 55%, #1D4ED8 100%)"
          onClick={() => setOpenGame("brick-breaker")}
        />
        <GameApp
          emoji="🥇"
          label="Homme du match"
          gradient="linear-gradient(160deg, #FDE68A 0%, #F59E0B 55%, #B45309 100%)"
          onClick={() => setOpenGame("mvp")}
        />
      </div>

      {openGame === "tournee-generale" && (
        <TourneeGeneraleModal onClose={() => setOpenGame(null)} />
      )}
      {openGame === "killer" && <KillerModal onClose={() => setOpenGame(null)} />}
      {openGame === "brick-breaker" && (
        <BrickBreakerModal onClose={() => setOpenGame(null)} />
      )}
      {openGame === "mvp" && <MvpVoteModal onClose={() => setOpenGame(null)} />}
    </div>
  );
}
