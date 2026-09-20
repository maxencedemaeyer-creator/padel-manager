// ─────────────────────────────────────────────────────────────────────────
// Avatar rond d'un joueur — émoji + couleur de fond (ou tout autre contenu
// passé via `fallback`, ex. des initiales). Centralisé ici pour que l'avatar
// s'affiche de la même façon partout dans l'app.
//
// Les photos de profil ont été retirées le 20/09/2026 (quotas gratuits
// Firebase, forfait Spark sans Cloud Storage) : le champ `avatarPhotoUrl`
// éventuellement présent sur d'anciennes fiches est simplement ignoré ici.
// ─────────────────────────────────────────────────────────────────────────
import { cn } from "../../lib/utils";
import { AVATAR_COLOR_CHOICES } from "../../lib/constants";

export function PlayerAvatar({ player, size = 40, className = "", contentClassName = "", fallback }) {
  const bg = player?.avatarColor || AVATAR_COLOR_CHOICES[0];
  const content = fallback !== undefined ? fallback : player?.emoji || "🎾";

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center overflow-hidden shrink-0",
        className
      )}
      style={{ width: size, height: size, backgroundColor: bg }}
    >
      <span className={contentClassName} style={{ fontSize: size * 0.45 }}>
        {content}
      </span>
    </div>
  );
}
