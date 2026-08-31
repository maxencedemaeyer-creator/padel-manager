// ─────────────────────────────────────────────────────────────────────────
// Avatar rond d'un joueur — affiche sa photo de profil si `avatarPhotoUrl`
// est renseigné sur la fiche, sinon retombe sur l'émoji + couleur de fond
// habituels (ou tout autre contenu passé via `fallback`, ex. des initiales).
// Centralisé ici pour que la photo apparaisse partout où un avatar est
// affiché dans l'app, sans dupliquer cette logique dans chaque composant.
// ─────────────────────────────────────────────────────────────────────────
import { cn } from "../../lib/utils";
import { AVATAR_COLOR_CHOICES } from "../../lib/constants";

export function PlayerAvatar({ player, size = 40, className = "", contentClassName = "", fallback }) {
  const photoUrl = player?.avatarPhotoUrl;
  const bg = player?.avatarColor || AVATAR_COLOR_CHOICES[0];
  const content = fallback !== undefined ? fallback : player?.emoji || "🎾";

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center overflow-hidden shrink-0",
        className
      )}
      style={{ width: size, height: size, backgroundColor: photoUrl ? undefined : bg }}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className={contentClassName} style={{ fontSize: size * 0.45 }}>
          {content}
        </span>
      )}
    </div>
  );
}
