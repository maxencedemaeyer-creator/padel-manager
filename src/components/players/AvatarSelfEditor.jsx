// ─────────────────────────────────────────────────────────────────────────
// Avatar du joueur connecté, avec un petit bouton discret (crayon) pour
// changer lui-même son emoji et sa couleur de fond. Chaque changement est
// enregistré immédiatement sur Firebase.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { AVATAR_COLOR_CHOICES } from "../../lib/constants";
import { Button, Modal } from "../ui";
import { AvatarPicker } from "./AvatarPicker";

export function AvatarSelfEditor({ player, size = 80 }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const bg = player.avatarColor || AVATAR_COLOR_CHOICES[0];

  const saveField = async (fields) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, "players", player.id), fields);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div
          className="w-full h-full rounded-full flex items-center justify-center border-2 border-white/40"
          style={{ backgroundColor: bg, fontSize: size * 0.45 }}
        >
          {player.emoji || "🎾"}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Modifier mon avatar"
          className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border border-[var(--color-border)] shadow-sm flex items-center justify-center text-sm"
        >
          ✏️
        </button>
      </div>

      {open && (
        <Modal
          title="Mon avatar"
          onClose={() => setOpen(false)}
          footer={
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Fermer
            </Button>
          }
        >
          <p className="text-xs text-[var(--color-text-dim)] mb-4">
            Choisissez un emoji et une couleur — chaque changement est enregistré
            immédiatement.
          </p>

          <AvatarPicker
            emoji={player.emoji}
            color={player.avatarColor}
            onEmojiChange={(e) => saveField({ emoji: e })}
            onColorChange={(c) => saveField({ avatarColor: c })}
          />

          {busy && (
            <p className="text-xs text-[var(--color-text-dim)] mt-3">Enregistrement...</p>
          )}
        </Modal>
      )}
    </>
  );
}
