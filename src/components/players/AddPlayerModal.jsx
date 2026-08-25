// ─────────────────────────────────────────────────────────────────────────
// Formulaire "Ajouter un joueur" (admin uniquement).
// ─────────────────────────────────────────────────────────────────────────
import { useState, useMemo } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { cn, findDuplicateOwner, generateUniqueCode } from "../../lib/utils";
import { LEVELS, HAND_OPTIONS, SIDE_OPTIONS, FEDERATION_OPTIONS, AVATAR_COLOR_CHOICES } from "../../lib/constants";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal, Field, Button, inputClass } from "../ui";
import { AvatarPicker } from "./AvatarPicker";

export function AddPlayerModal({ onClose }) {
  const { players } = useAppData();
  const [form, setForm] = useState({
    name: "",
    email: "",
    accessCode: "",
    isAdmin: false,
    isCreditor: false,
    isTest: false,
    level: "Pas de niveau",
    dominantHand: "Droitier",
    preferredSide: "Polyvalent",
    federation: "Aucune",
    emoji: "🎾",
    avatarColor: AVATAR_COLOR_CHOICES[0],
  });
  const [saving, setSaving] = useState(false);

  const duplicateOwner = useMemo(
    () => findDuplicateOwner(players, form.accessCode),
    [players, form.accessCode]
  );

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const generateCode = () => setF("accessCode", generateUniqueCode(players));

  const canSubmit =
    form.name.trim().length > 0 && form.accessCode.length === 4 && !duplicateOwner;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const levelInfo = LEVELS.find((l) => l.label === form.level);
      await addDoc(collection(db, "players"), {
        name: form.name.trim(),
        email: form.email.trim(),
        accessCode: form.accessCode,
        isAdmin: form.isAdmin,
        isCreditor: form.isCreditor,
        isTest: form.isTest,
        creditBalance: 0,
        level: form.level,
        levelSortValue: levelInfo ? levelInfo.value : 0,
        emoji: form.emoji,
        avatarColor: form.avatarColor,
        dominantHand: form.dominantHand,
        preferredSide: form.preferredSide,
        federation: form.federation,
        createdAt: serverTimestamp(),
      });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Ajouter un joueur"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Ajout en cours..." : "Ajouter le joueur"}
          </Button>
        </>
      }
    >
      <AvatarPicker
        emoji={form.emoji}
        color={form.avatarColor}
        onEmojiChange={(e) => setF("emoji", e)}
        onColorChange={(c) => setF("avatarColor", c)}
      />

      <Field label="Nom complet">
        <input
          className={inputClass}
          value={form.name}
          onChange={(e) => setF("name", e.target.value)}
          placeholder="Ex. Camille Dupuis"
        />
      </Field>

      <Field label="Email">
        <input
          type="email"
          className={inputClass}
          value={form.email}
          onChange={(e) => setF("email", e.target.value)}
          placeholder="camille@email.com"
        />
      </Field>

      <Field label="Code PIN (4 chiffres)">
        <div className="flex gap-2">
          <input
            className={cn(inputClass, "pm-mono tracking-[0.3em] text-center")}
            value={form.accessCode}
            maxLength={4}
            onChange={(e) => setF("accessCode", e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="0000"
          />
          <button
            onClick={generateCode}
            className="px-4 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-lime)] flex items-center gap-1.5 text-xs font-semibold shrink-0"
          >
            <Icon.Dice className="w-4 h-4" /> Générer
          </button>
        </div>
        {duplicateOwner && (
          <p className="text-[var(--color-danger)] text-xs font-semibold mt-2">
            ⚠️ Ce code est déjà attribué à {duplicateOwner.name}. Veuillez en
            choisir un autre.
          </p>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Niveau">
          <select
            className={inputClass}
            value={form.level}
            onChange={(e) => setF("level", e.target.value)}
          >
            {LEVELS.map((l) => (
              <option key={l.label} value={l.label}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Main dominante">
          <select
            className={inputClass}
            value={form.dominantHand}
            onChange={(e) => setF("dominantHand", e.target.value)}
          >
            {HAND_OPTIONS.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Côté préféré">
          <select
            className={inputClass}
            value={form.preferredSide}
            onChange={(e) => setF("preferredSide", e.target.value)}
          >
            {SIDE_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Fédération">
          <select
            className={inputClass}
            value={form.federation}
            onChange={(e) => setF("federation", e.target.value)}
          >
            {FEDERATION_OPTIONS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-col gap-2 mb-2">
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.isAdmin}
            onChange={(e) => setF("isAdmin", e.target.checked)}
            className="w-4 h-4 accent-[var(--color-lime)]"
          />
          Administrateur (gestion complète du club)
        </label>
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.isCreditor}
            onChange={(e) => setF("isCreditor", e.target.checked)}
            className="w-4 h-4 accent-[var(--color-lime)]"
          />
          Créancier (peut recevoir des paiements de match)
        </label>
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.isTest}
            onChange={(e) => setF("isTest", e.target.checked)}
            className="w-4 h-4 accent-[var(--color-lime)]"
          />
          Compte test (invisible sur l'écran de connexion et pour les autres joueurs)
        </label>
      </div>
    </Modal>
  );
}

