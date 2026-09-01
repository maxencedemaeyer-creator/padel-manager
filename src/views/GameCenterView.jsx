// ─────────────────────────────────────────────────────────────────────────
// Onglet "Game Center" — mini-jeux et animations du club. Les jeux sont
// ajoutés ici progressivement (voir la grille ci-dessous) ; ceux marqués
// "Bientôt" restent des emplacements grisés en attendant. Visible en
// permanence par l'admin ; pour les autres joueurs, uniquement si l'admin
// l'a activé depuis l'onglet Administration (voir src/views/AdminView.jsx
// et src/hooks/useFirestoreData.js → useAppSettings).
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import Icon from "../components/icons/Icon";
import { Card } from "../components/ui";
import { TourneeGeneraleModal } from "../components/games/TourneeGeneraleModal";
import { KillerModal } from "../components/games/KillerModal";

const UPCOMING_GAMES = [{ label: "Bientôt", icon: Icon.Dice }];

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

      <div className="grid grid-cols-3 gap-3">
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

        {UPCOMING_GAMES.map((g, i) => (
          <Card
            key={i}
            className="p-4 flex flex-col items-center gap-2 opacity-40 pointer-events-none select-none"
          >
            <g.icon className="w-6 h-6 text-[var(--color-text-faint)]" />
            <span className="text-[10px] font-semibold text-[var(--color-text-faint)]">
              {g.label}
            </span>
          </Card>
        ))}
      </div>

      {openGame === "tournee-generale" && (
        <TourneeGeneraleModal onClose={() => setOpenGame(null)} />
      )}
      {openGame === "killer" && <KillerModal onClose={() => setOpenGame(null)} />}
    </div>
  );
}
