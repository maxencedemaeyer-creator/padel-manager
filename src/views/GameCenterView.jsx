// ─────────────────────────────────────────────────────────────────────────
// Onglet "Game Center" — mini-jeux et animations du club. Les jeux sont
// ajoutés ici progressivement (voir la grille ci-dessous). Visible en
// permanence par l'admin ; pour les autres joueurs, uniquement si l'admin
// l'a activé depuis l'onglet Administration (voir src/views/AdminView.jsx
// et src/hooks/useFirestoreData.js → useAppSettings).
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import Icon from "../components/icons/Icon";
import { Card } from "../components/ui";
import { TourneeGeneraleModal } from "../components/games/TourneeGeneraleModal";
import { KillerModal } from "../components/games/KillerModal";
import { BrickBreakerModal } from "../components/games/BrickBreakerModal";
import { MvpVoteModal } from "../components/games/MvpVoteModal";

export function GameCenterView() {
  // Jeu actuellement ouvert en fenêtre modale, ou null si aucun.
  const [openGame, setOpenGame] = useState(null);

  return (
    <div className="px-4 pt-4 pb-28">
      <div className="flex items-center gap-2 mb-1">
        <Icon.Gamepad className="w-5 h-5 text-[var(--color-lime)]" />
        <h2 className="pm-display font-bold text-xl text-white">Game Center</h2>
      </div>
      <p className="text-xs text-[var(--color-text-faint)] mb-6">
        Petits jeux et animations du club — de nouveaux jeux arriveront ici
        petit à petit.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setOpenGame("tournee-generale")} className="text-left">
          <Card className="p-4 flex flex-col items-center gap-2 hover:border-[var(--color-lime)]/60 active:scale-[0.97] transition-all">
            <span className="text-2xl leading-none">🍻</span>
            <span className="text-[10px] font-semibold text-[var(--color-text)] text-center leading-tight">
              Tournée générale
            </span>
          </Card>
        </button>

        <button type="button" onClick={() => setOpenGame("killer")} className="text-left">
          <Card className="p-4 flex flex-col items-center gap-2 hover:border-[var(--color-lime)]/60 active:scale-[0.97] transition-all">
            <span className="text-2xl leading-none">🔪</span>
            <span className="text-[10px] font-semibold text-[var(--color-text)] text-center leading-tight">
              Killer
            </span>
          </Card>
        </button>

        <button type="button" onClick={() => setOpenGame("brick-breaker")} className="text-left">
          <Card className="p-4 flex flex-col items-center gap-2 hover:border-[var(--color-lime)]/60 active:scale-[0.97] transition-all">
            <span className="text-2xl leading-none">🧱</span>
            <span className="text-[10px] font-semibold text-[var(--color-text)] text-center leading-tight">
              Brick Breaker
            </span>
          </Card>
        </button>

        <button type="button" onClick={() => setOpenGame("mvp")} className="text-left">
          <Card className="p-4 flex flex-col items-center gap-2 hover:border-[var(--color-lime)]/60 active:scale-[0.97] transition-all">
            <span className="text-2xl leading-none">🥇</span>
            <span className="text-[10px] font-semibold text-[var(--color-text)] text-center leading-tight">
              Homme du match
            </span>
          </Card>
        </button>
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
