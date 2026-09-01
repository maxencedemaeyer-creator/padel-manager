// ─────────────────────────────────────────────────────────────────────────
// Onglet "Fun Center" — mini-jeux et animations du club. Vide pour l'instant :
// chaque jeu sera ajouté ici progressivement. Visible en permanence par
// l'admin ; pour les autres joueurs, uniquement si l'admin l'a activé depuis
// l'onglet Administration (voir src/views/AdminView.jsx et
// src/hooks/useFirestoreData.js → useAppSettings).
// ─────────────────────────────────────────────────────────────────────────
import Icon from "../components/icons/Icon";
import { Card, EmptyState } from "../components/ui";

const UPCOMING_GAMES = [
  { label: "Bientôt", icon: Icon.Dice },
  { label: "Bientôt", icon: Icon.Trophy },
  { label: "Bientôt", icon: Icon.Flame },
];

export function GameCenterView() {
  return (
    <div className="px-4 pt-4 pb-28">
      <div className="flex items-center gap-2 mb-1">
        <Icon.Gamepad className="w-5 h-5 text-[var(--color-lime)]" />
        <h2 className="pm-display font-bold text-xl text-white">Fun Center</h2>
      </div>
      <p className="text-xs text-[var(--color-text-faint)] mb-6">
        Petits jeux et animations du club — de nouveaux jeux arriveront ici
        petit à petit.
      </p>

      <EmptyState
        icon={<Icon.Gamepad className="w-6 h-6" />}
        title="Aucun jeu pour le moment"
        subtitle="Cet espace est en cours de préparation. Revenez bientôt pour découvrir les premiers mini-jeux du club !"
      />

      <div className="grid grid-cols-3 gap-3 mt-6 opacity-40 pointer-events-none select-none">
        {UPCOMING_GAMES.map((g, i) => (
          <Card key={i} className="p-4 flex flex-col items-center gap-2">
            <g.icon className="w-6 h-6 text-[var(--color-text-faint)]" />
            <span className="text-[10px] font-semibold text-[var(--color-text-faint)]">
              {g.label}
            </span>
          </Card>
        ))}
      </div>
    </div>
  );
}
