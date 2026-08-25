// ─────────────────────────────────────────────────────────────────────────
// Sélecteur d'avatar compact : aperçu + bouton, se déplie pour choisir
// l'émoji et la couleur de fond (voir la fiche joueur pour son usage).
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { cn } from "../../lib/utils";
import { EMOJI_CHOICES, AVATAR_COLOR_CHOICES } from "../../lib/constants";
import Icon from "../icons/Icon";
import { Field } from "../ui";

export function AvatarPicker({ emoji, color, onEmojiChange, onColorChange }) {
  const [open, setOpen] = useState(false);
  const bg = color || AVATAR_COLOR_CHOICES[0];

  return (
    <Field label="Avatar">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 w-full p-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] text-left"
      >
        <span
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 border border-[var(--color-border)]"
          style={{ backgroundColor: bg }}
        >
          {emoji || "🎾"}
        </span>
        <span className="flex-1 text-xs font-semibold text-[var(--color-text-dim)]">
          {open ? "Choisir ci-dessous" : "Modifier l'icône et la couleur"}
        </span>
        <Icon.Chevron className={cn("w-4 h-4 text-[var(--color-text-faint)] transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="mt-2 p-3 rounded-xl border border-[var(--color-border)] bg-white">
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
