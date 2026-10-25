// ─────────────────────────────────────────────────────────────────────────
// Formulaire "Ajouter un joueur" — admin, et coach depuis le 25/10/2026
// (étape 3 des rôles). Le coach crée un simple joueur : aucun rôle ni
// étiquette "test" à cocher, pas de réactivation d'un joueur supprimé.
// Après la création, le code PIN est affiché UNE fois, avec un bouton pour
// l'envoyer par WhatsApp (lien wa.me, aucun numéro stocké dans l'app).
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo } from "react";
import { collection, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { cn } from "../../lib/utils";
import { LEVELS, HAND_OPTIONS, SIDE_OPTIONS, FEDERATION_OPTIONS, AVATAR_COLOR_CHOICES, levelDisplayLabel } from "../../lib/constants";
import { useAppData } from "../../context/AppContext";
import { getOwnerId, updateRoles } from "../../lib/roles";
import { logActivity } from "../../lib/activityLog";
import Icon from "../icons/Icon";
import { Modal, Field, Button, inputClass } from "../ui";
import { AvatarPicker } from "./AvatarPicker";

export function AddPlayerModal({ onClose }) {
  const { players, archivedPlayers, sessionToken, connectedPlayer, perms } = useAppData();
  // 25/10/2026 (rôles, étape 1) : seul l'admin principal peut créer un
  // nouvel administrateur (le serveur le revérifie).
  const amOwner = Boolean(connectedPlayer) && getOwnerId(players) === connectedPlayer.id;
  const [form, setForm] = useState({
    name: "",
    email: "",
    accessCode: "",
    isAdmin: false,
    isCreditor: false,
    isCoach: false,
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
  // Joueur tout juste créé : { name, code } → écran de confirmation avec le
  // code et le bouton WhatsApp (affiché une seule fois).
  const [created, setCreated] = useState(null);

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

  // Un coach ne peut pas réactiver un joueur supprimé : si le nom
  // correspond à un ancien joueur, il est invité à passer par l'admin
  // (plutôt que de créer un doublon).
  const blockedByArchived = Boolean(matchedArchived) && !perms.restorePlayers;
  const canSubmit =
    form.name.trim().length > 0 &&
    form.accessCode.length === 4 &&
    !duplicateOwner &&
    !blockedByArchived;

  const reactivate = async () => {
    if (!matchedArchived) return;
    setReactivating(true);
    try {
      await updateDoc(doc(db, "players", matchedArchived.id), {
        archived: false,
        archivedAt: null,
      });
      logActivity("player", `${matchedArchived.name} réactivé (profil restauré)`);
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
        // Rôles (admin, créancier) et étiquette "test" : jamais écrits ici
        // (la base le refuse depuis le 25/10/2026) — attribués juste après
        // via le serveur (api/manage-roles.js).
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
      const roleChanges = {};
      if (perms.manageRoles) {
        if (form.isAdmin && amOwner) roleChanges.isAdmin = true;
        if (form.isCreditor) roleChanges.isCreditor = true;
        if (form.isCoach) roleChanges.isCoach = true;
        if (form.isTest) roleChanges.isTest = true;
      }
      try {
        await updateRoles(sessionToken, [{ playerId: playerRef.id, changes: roleChanges }]);
      } catch (roleError) {
        alert(
          "Le joueur a bien été créé, mais ses rôles n'ont pas pu être enregistrés : " +
            roleError.message +
            "\nVous pouvez les cocher à nouveau depuis sa fiche."
        );
      }
      logActivity("player", `${form.name.trim()} ajouté au club`);
      setCreated({ name: form.name.trim(), code: form.accessCode });
    } catch (error) {
      alert("Erreur : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Ouvre WhatsApp avec le message déjà rédigé (même texte que le volet
  // « Codes PIN » de l'admin) ; le contact se choisit dans WhatsApp.
  const sendOnWhatsApp = () => {
    if (!created) return;
    const firstName = created.name.split(" ")[0];
    const text =
      `Salut ${firstName} ! 👋\n` +
      `Voici ton code PIN pour Padel Manager : ${created.code}\n` +
      `N'hésite pas à le changer toi-même dans l'onglet « Mon profil ».\n` +
      `Connexion : ${window.location.origin}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  if (created) {
    return (
      <Modal
        title="Joueur ajouté ✅"
        onClose={onClose}
        footer={<Button onClick={onClose}>Terminé</Button>}
      >
        <p className="text-sm text-[var(--color-text)] mb-3">
          <strong>{created.name}</strong> peut maintenant se connecter avec ce code :
        </p>
        <p className="pm-mono text-3xl font-bold tracking-[0.4em] text-center py-3 mb-3 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)]">
          {created.code}
        </p>
        <Button className="w-full" onClick={sendOnWhatsApp}>
          Envoyer le code par WhatsApp
        </Button>
        <p className="text-[11px] text-[var(--color-text-faint)] mt-3">
          Ce code ne sera plus affiché après la fermeture de cette fenêtre
          {perms.manageRoles ? " (vous le retrouverez dans le volet « Codes PIN » de l'onglet Admin)." : " : seul l'administrateur pourra le retrouver."}
        </p>
      </Modal>
    );
  }

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

      {matchedArchived && !perms.restorePlayers && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-xs text-amber-800">
            <strong>{matchedArchived.name}</strong> a déjà fait partie du club. Demande à
            l'administrateur de réactiver son profil (il retrouvera tout son historique).
          </p>
        </div>
      )}

      {matchedArchived && perms.restorePlayers && (
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
        <Field label="Classement">
          <select
            className={inputClass}
            value={form.level}
            onChange={(e) => setF("level", e.target.value)}
          >
            {LEVELS.map((l) => (
              <option key={l.label} value={l.label}>
                {levelDisplayLabel(l.label)}
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

      {perms.manageRoles && (
      <div className="flex flex-col gap-2 mb-2">
        {amOwner && (
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={form.isAdmin}
              onChange={(e) => setF("isAdmin", e.target.checked)}
              className="w-4 h-4 accent-[var(--color-lime)]"
            />
            Administrateur (gestion complète du club)
          </label>
        )}
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
            checked={form.isCoach}
            onChange={(e) => setF("isCoach", e.target.checked)}
            className="w-4 h-4 accent-[var(--color-lime)]"
          />
          Coach (présences, composition des terrains, scores)
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
      )}
    </Modal>
  );
}
