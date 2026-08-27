// ─────────────────────────────────────────────────────────────────────────
// Fiche joueur en édition — réservée à l'admin (accessible uniquement depuis
// l'onglet "Équipe") : nom, email, PIN, rôles, connexion secrète test.
// Un joueur modifie ses propres infos de jeu et son PIN depuis "Mon profil".
// ─────────────────────────────────────────────────────────────────────────
import { useState, useMemo } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { cn, findDuplicateOwner, generateUniqueCode, normalizeSide, parseFeeInput } from "../../lib/utils";
import { LEVELS, HAND_OPTIONS, SIDE_OPTIONS, FEDERATION_OPTIONS, AVATAR_COLOR_CHOICES } from "../../lib/constants";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal, Field, Button, inputClass } from "../ui";
import { AvatarPicker } from "./AvatarPicker";

export function EditPlayerModal({ player, onClose }) {
  const { isAdmin, players, connectedPlayer } = useAppData();

  // Champs de jeu — modifiables par le joueur lui-même ou par l'admin
  const [dominantHand, setDominantHand] = useState(player.dominantHand || "Droitier");
  const [preferredSide, setPreferredSide] = useState(
    normalizeSide(player.preferredSide) || "Polyvalent"
  );
  const [federation, setFederation] = useState(player.federation || "Aucune");
  const [level, setLevel] = useState(player.level || "Pas de niveau");

  // Champs de profil complets — modifiables uniquement par l'administrateur
  const [name, setName] = useState(player.name || "");
  const [email, setEmail] = useState(player.email || "");
  const [emoji, setEmoji] = useState(player.emoji || "🎾");
  const [avatarColor, setAvatarColor] = useState(player.avatarColor || AVATAR_COLOR_CHOICES[0]);
  const [accessCode, setAccessCode] = useState(player.accessCode || "");
  const [playerIsAdmin, setPlayerIsAdmin] = useState(player.isAdmin === true);
  const [isCreditor, setIsCreditor] = useState(player.isCreditor === true);
  const [isTest, setIsTest] = useState(player.isTest === true);
  const [secondaryTestCode, setSecondaryTestCode] = useState(player.secondaryTestCode || "");
  const [secondaryTestPlayerId, setSecondaryTestPlayerId] = useState(
    player.secondaryTestPlayerId || ""
  );
  const [advancedAmount, setAdvancedAmount] = useState(
    player.advancedAmount != null ? String(player.advancedAmount) : ""
  );

  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const duplicateOwner = useMemo(
    () => findDuplicateOwner(players, accessCode, player.id),
    [players, accessCode, player.id]
  );
  const generateCode = () => setAccessCode(generateUniqueCode(players, player.id));

  const canSubmit = name.trim().length > 0 && accessCode.length === 4 && !duplicateOwner;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const levelInfo = LEVELS.find((l) => l.label === level);
      const payload = {
        dominantHand,
        preferredSide,
        federation,
        level,
        levelSortValue: levelInfo ? levelInfo.value : 0,
        accessCode,
        name: name.trim(),
        email: email.trim(),
        emoji,
        avatarColor,
        isAdmin: playerIsAdmin,
        isCreditor,
        isTest,
        secondaryTestCode: secondaryTestCode || null,
        secondaryTestPlayerId: secondaryTestPlayerId || null,
        advancedAmount: parseFeeInput(advancedAmount),
      };
      await updateDoc(doc(db, "players", player.id), payload);
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // "Supprimer" un joueur ne l'efface jamais réellement de Firebase : on le
  // marque simplement `archived: true`. Il disparaît alors immédiatement de
  // toute l'app (écran de connexion, onglet Équipe, assignation aux matchs,
  // etc.) mais reste conservé en base — si un jour quelqu'un recrée un
  // joueur avec exactement le même nom, l'app proposera de réactiver ce
  // profil au lieu d'en créer un nouveau (voir AddPlayerModal.jsx).
  const archivePlayer = async () => {
    setDeleting(true);
    try {
      await updateDoc(doc(db, "players", player.id), {
        archived: true,
        archivedAt: serverTimestamp(),
      });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
      setDeleting(false);
    }
  };

  const isSelf = connectedPlayer && player.id === connectedPlayer.id;

  return (
    <Modal
      title={`Profil de ${player.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </>
      }
    >
      <AvatarPicker
        emoji={emoji}
        color={avatarColor}
        onEmojiChange={setEmoji}
        onColorChange={setAvatarColor}
      />

      <Field label="Nom complet">
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. Camille Dupuis"
        />
      </Field>

      <Field label="Email">
        <input
          type="email"
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="camille@email.com"
        />
      </Field>

      <Field label="Code PIN (4 chiffres)">
        <div className="flex gap-2">
          <input
            className={cn(inputClass, "pm-mono tracking-[0.3em] text-center")}
            value={accessCode}
            maxLength={4}
            onChange={(e) =>
              setAccessCode(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
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
        <Field label="Main dominante">
          <select
            className={inputClass}
            value={dominantHand}
            onChange={(e) => setDominantHand(e.target.value)}
          >
            {HAND_OPTIONS.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </Field>
        <Field label="Position de jeu">
          <select
            className={inputClass}
            value={preferredSide}
            onChange={(e) => setPreferredSide(e.target.value)}
          >
            {SIDE_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Fédération">
        <select
          className={inputClass}
          value={federation}
          onChange={(e) => setFederation(e.target.value)}
        >
          {FEDERATION_OPTIONS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </Field>

      <Field label="Niveau estimé">
        <select className={inputClass} value={level} onChange={(e) => setLevel(e.target.value)}>
          {LEVELS.map((l) => (
            <option key={l.label} value={l.label}>
              {l.label}
            </option>
          ))}
        </select>
      </Field>

      {isAdmin && (
        <div className="flex flex-col gap-2 mb-2">
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={playerIsAdmin}
              onChange={(e) => setPlayerIsAdmin(e.target.checked)}
              className="w-4 h-4 accent-[var(--color-lime)]"
            />
            Administrateur (gestion complète du club)
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={isCreditor}
              onChange={(e) => setIsCreditor(e.target.checked)}
              className="w-4 h-4 accent-[var(--color-lime)]"
            />
            Créancier (peut recevoir des paiements de match)
          </label>
          {isCreditor && (
            <Field label="Montant avancé au club — € (optionnel)">
              <input
                type="text"
                inputMode="decimal"
                className={inputClass}
                value={advancedAmount}
                onChange={(e) => setAdvancedAmount(e.target.value)}
                placeholder="Ex. 300"
              />
            </Field>
          )}
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={isTest}
              onChange={(e) => setIsTest(e.target.checked)}
              className="w-4 h-4 accent-[var(--color-lime)]"
            />
            Compte test (invisible sur l'écran de connexion et pour les autres joueurs)
          </label>

          <div className="pt-3 mt-1 border-t border-[var(--color-border)]">
            <p className="text-xs font-semibold text-[var(--color-text-dim)] mb-1">
              Connexion secrète (optionnel)
            </p>
            <p className="text-[11px] text-[var(--color-text-faint)] mb-2">
              Un second code PIN sur CETTE fiche connecte directement vers un
              autre profil (ex. un compte test) — sans qu'aucune nouvelle
              carte n'apparaisse jamais sur l'écran de connexion.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code PIN secondaire">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  className={cn(inputClass, "pm-mono tracking-[0.3em] text-center")}
                  value={secondaryTestCode}
                  onChange={(e) =>
                    setSecondaryTestCode(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="0000"
                />
              </Field>
              <Field label="Connecte vers">
                <select
                  className={inputClass}
                  value={secondaryTestPlayerId}
                  onChange={(e) => setSecondaryTestPlayerId(e.target.value)}
                >
                  <option value="">— Choisir un joueur —</option>
                  {players
                    .filter((p) => p.id !== player.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.isTest ? " (test)" : ""}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="pt-3 mt-1 border-t border-[var(--color-border)]">
            <p className="text-xs font-semibold text-[var(--color-danger)] mb-1">
              Zone de danger
            </p>
            {!confirmDelete ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={isSelf}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold hover:border-rose-400 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  <Icon.Trash className="w-4 h-4" /> Supprimer ce joueur
                </button>
                {isSelf && (
                  <p className="text-[11px] text-[var(--color-text-faint)] mt-2">
                    Vous ne pouvez pas supprimer votre propre compte pendant
                    que vous êtes connecté dessus.
                  </p>
                )}
              </>
            ) : (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                <p className="text-xs text-rose-700 mb-3">
                  {player.name} sera retiré de l'app : plus aucun accès, plus
                  visible nulle part (connexion, équipe, matchs...). Son
                  profil reste conservé en interne — s'il se réinscrit un
                  jour avec exactement le même prénom et nom, l'app vous
                  proposera de réactiver ce profil.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1 !py-2"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                  >
                    Annuler
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1 !py-2"
                    onClick={archivePlayer}
                    disabled={deleting}
                  >
                    {deleting ? "Suppression..." : "Confirmer la suppression"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
