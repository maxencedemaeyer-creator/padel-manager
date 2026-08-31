// ─────────────────────────────────────────────────────────────────────────
// Formulaire "Ajouter un joueur" (admin uniquement).
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo } from "react";
import { collection, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { cn } from "../../lib/utils";
import { LEVELS, HAND_OPTIONS, SIDE_OPTIONS, FEDERATION_OPTIONS, AVATAR_COLOR_CHOICES } from "../../lib/constants";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal, Field, Button, inputClass } from "../ui";
import { AvatarPicker } from "./AvatarPicker";

export function AddPlayerModal({ onClose }) {
  const { players, archivedPlayers, sessionToken } = useAppData();
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
  const [reactivating, setReactivating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [duplicateOwner, setDuplicateOwner] = useState(null);

  // Les codes PIN ne sont plus lisibles depuis le navigateur (voir
  // firestore.rules) : la vérification de doublon se fait désormais via le
  // serveur (api/manage-pin.js), qui seul a accès à la collection
  // player_credentials.
  useEffect(() => {
    if (form.accessCode.length !== 4) {
      setDuplicateOwner(null);
      return undefined;
    }
    let cancelled = false;
    fetch("/api/manage-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check", code: form.accessCode, actingToken: sessionToken }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const owner = data.ok && data.duplicatePlayerId
          ? players.find((p) => p.id === data.duplicatePlayerId) || null
          : null;
        setDuplicateOwner(owner);
      })
      .catch(() => {
        if (!cancelled) setDuplicateOwner(null);
      });
    return () => {
      cancelled = true;
    };
  }, [form.accessCode, players]);

  // Si un joueur supprimé (archivé) porte EXACTEMENT le même nom que celui en
  // train d'être saisi, on le propose en réactivation plutôt que de forcer
  // la création d'une fiche toute neuve — ça évite les doublons et ça
  // conserve tout l'historique de matchs/statistiques de ce joueur.
  const matchedArchived = useMemo(() => {
    const normalized = form.name.trim().toLowerCase();
    if (!normalized) return null;
    return (
      (archivedPlayers || []).find(
        (p) => (p.name || "").trim().toLowerCase() === normalized
      ) || null
    );
  }, [archivedPlayers, form.name]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const generateCode = async () => {
    setGenerating(true);
    try {
      const response = await fetch("/api/manage-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", actingToken: sessionToken }),
      });
      const data = await response.json();
      if (data.ok) setF("accessCode", data.code);
    } catch (e) {
      alert("Erreur lors de la génération du code.");
    } finally {
      setGenerating(false);
    }
  };

  const canSubmit =
    form.name.trim().length > 0 && form.accessCode.length === 4 && !duplicateOwner;

  const reactivate = async () => {
    if (!matchedArchived) return;
    setReactivating(true);
    try {
      await updateDoc(doc(db, "players", matchedArchived.id), {
        archived: false,
        archivedAt: null,
      });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setReactivating(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const levelInfo = LEVELS.find((l) => l.label === form.level);
      // Le code PIN n'est jamais écrit sur la fiche joueur (lisible par
      // tous) : la fiche est créée sans lui, puis le code est enregistré à
      // part via le serveur, dans la collection verrouillée
      // player_credentials (voir api/manage-pin.js).
      const playerRef = await addDoc(collection(db, "players"), {
        name: form.name.trim(),
        email: form.email.trim(),
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
      const response = await fetch("/api/manage-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set",
          playerId: playerRef.id,
          accessCode: form.accessCode,
          actingToken: sessionToken,
        }),
      });
      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || "Échec de l'enregistrement du code PIN.");
      }
      onClose();
    } catch (error) {
      alert("Erreur : " + error.message);
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

      {matchedArchived && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-xs text-amber-800 mb-2">
            <strong>{matchedArchived.name}</strong> a déjà été supprimé du
            club, mais son profil est conservé en interne. Réactiver ce
            profil (plutôt que d'en créer un nouveau) lui rend l'accès et
            conserve tout son historique.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="w-full !py-2 !text-amber-800 !border-amber-300"
            onClick={reactivate}
            disabled={reactivating}
          >
            {reactivating ? "Réactivation..." : `Réactiver ${matchedArchived.name}`}
          </Button>
        </div>
      )}

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
            disabled={generating}
            className="px-4 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-lime)] flex items-center gap-1.5 text-xs font-semibold shrink-0 disabled:opacity-50"
          >
            <Icon.Dice className="w-4 h-4" /> {generating ? "..." : "Générer"}
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
