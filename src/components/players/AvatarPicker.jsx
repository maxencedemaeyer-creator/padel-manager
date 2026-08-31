// ─────────────────────────────────────────────────────────────────────────
// Sélecteur d'avatar compact : aperçu + bouton, se déplie pour choisir une
// photo de profil (galerie du téléphone, quel que soit l'appareil : iPhone,
// Android, Samsung, Google Pixel...), ou à défaut un émoji et une couleur de
// fond (voir la fiche joueur pour son usage).
//
// La photo est entièrement gérée ici : redimensionnement, envoi sur Firebase
// Storage et suppression au retour à l'émoji (voir lib/avatarUpload.js).
// L'appelant se contente d'enregistrer l'URL (ou `null`) reçue via
// `onPhotoChange` sur la fiche joueur (champ avatarPhotoUrl).
//
// La photo n'est proposée que si `playerId` est fourni : lors de la création
// d'un nouveau joueur (AddPlayerModal), la fiche n'existe pas encore, donc
// aucun chemin de stockage n'est disponible — seuls l'émoji et la couleur
// restent modifiables à ce stade-là.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useRef } from "react";
import { cn } from "../../lib/utils";
import { EMOJI_CHOICES, AVATAR_COLOR_CHOICES } from "../../lib/constants";
import { uploadAvatarPhoto, deleteAvatarPhoto } from "../../lib/avatarUpload";
import Icon from "../icons/Icon";
import { Field } from "../ui";

export function AvatarPicker({
  emoji,
  color,
  onEmojiChange,
  onColorChange,
  photoUrl,
  onPhotoChange,
  playerId,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const bg = color || AVATAR_COLOR_CHOICES[0];
  const canUsePhoto = Boolean(playerId) && typeof onPhotoChange === "function";

  const pickPhoto = () => fileInputRef.current?.click();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de resélectionner le même fichier ensuite
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const url = await uploadAvatarPhoto(playerId, file);
      onPhotoChange(url);
    } catch (err) {
      setError(err.message || "Échec de l'envoi de la photo.");
    } finally {
      setBusy(false);
    }
  };

  const revertToEmoji = async () => {
    setError("");
    setBusy(true);
    try {
      await deleteAvatarPhoto(playerId);
      onPhotoChange(null);
    } catch (err) {
      setError(err.message || "Échec de la suppression de la photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label="Avatar">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 w-full p-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] text-left"
      >
        <span
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 border border-[var(--color-border)] overflow-hidden"
          style={{ backgroundColor: photoUrl ? undefined : bg }}
        >
          {photoUrl ? (
            <img src={photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            emoji || "🎾"
          )}
        </span>
        <span className="flex-1 text-xs font-semibold text-[var(--color-text-dim)]">
          {open ? "Choisir ci-dessous" : "Modifier la photo, l'icône ou la couleur"}
        </span>
        <Icon.Chevron className={cn("w-4 h-4 text-[var(--color-text-faint)] transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="mt-2 p-3 rounded-xl border border-[var(--color-border)] bg-white">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
            Photo de profil
          </p>

          {canUsePhoto ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="hidden"
              />
              <div className="flex flex-wrap gap-2 mb-1.5">
                <button
                  type="button"
                  onClick={pickPhoto}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-xs font-semibold disabled:opacity-50"
                >
                  <Icon.Camera className="w-4 h-4" />
                  {busy ? "Envoi en cours..." : photoUrl ? "Changer la photo" : "Choisir une photo"}
                </button>
                {photoUrl && (
                  <button
                    type="button"
                    onClick={revertToEmoji}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-xs font-semibold text-[var(--color-text-dim)] disabled:opacity-50"
                  >
                    <Icon.Refresh className="w-4 h-4" />
                    Revenir à l'emoji
                  </button>
                )}
              </div>
              {error && (
                <p className="text-[var(--color-danger)] text-[11px] font-semibold mb-2">{error}</p>
              )}
              <p className="text-[10px] text-[var(--color-text-faint)] mb-3">
                Fonctionne depuis la galerie de n'importe quel téléphone (iPhone, Android,
                Samsung...).
                {photoUrl && " L'émoji et la couleur ci-dessous ne s'affichent que si vous retirez la photo."}
              </p>
            </>
          ) : (
            <p className="text-[10px] text-[var(--color-text-faint)] mb-3">
              La photo de profil pourra être ajoutée une fois le joueur créé.
            </p>
          )}

          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
            Icône
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onEmojiChange(e)}
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center text-base border transition-all",
                  emoji === e
                    ? "border-[var(--color-lime)] bg-[var(--color-lime)]/15"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
            Couleur de fond
          </p>
          <div className="flex flex-wrap gap-2">
            {AVATAR_COLOR_CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onColorChange(c)}
                aria-label={c}
                className={cn(
                  "w-8 h-8 rounded-full border-2 transition-all",
                  bg === c ? "border-sky-400 scale-110" : "border-white"
                )}
                style={{ backgroundColor: c, boxShadow: "0 0 0 1px var(--color-border)" }}
              />
            ))}
          </div>
        </div>
      )}
    </Field>
  );
}
