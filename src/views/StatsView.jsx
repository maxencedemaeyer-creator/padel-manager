// ─────────────────────────────────────────────────────────────────────────
// Onglet "Mon profil" — en-tête, statistiques (anneau de progression),
// forme récente, personnes marquantes, préférences (éditables), face-à-face.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  cn,
  formatDateFR,
  getInitials,
  normalizeSide,
} from "../lib/utils";
import {
  LEVELS,
  HAND_OPTIONS,
  SIDE_OPTIONS,
  FEDERATION_OPTIONS,
} from "../lib/constants";
import { computePlayerStats, getRecentForm, computeHeadToHead } from "../lib/stats";
import { useAppData } from "../context/AppContext";
import { Card, Field, inputClass, Modal, Button } from "../components/ui";
import Icon from "../components/icons/Icon";
import { AvatarSelfEditor } from "../components/players/AvatarSelfEditor";

function ProgressRing({ value, size = 110, stroke = 10, label }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - clamped / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#0F172A"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          fill="none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="pm-display font-extrabold text-2xl leading-none">{clamped}%</span>
        {label && (
          <span className="text-[10px] text-[var(--color-text-dim)] mt-0.5 leading-tight px-2">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

// Carte "personne mise en avant" style carrousel — avatar coloré en haut sur
// une bande sombre, nom + info dessous. Pour coéquipier / duo / bête noire.
function PersonHighlightCard({ player, title, subtitle, accentTone = "dark" }) {
  const accent = {
    dark: "bg-slate-900",
    emerald: "bg-emerald-600",
    rose: "bg-rose-500",
  }[accentTone];
  return (
    <div className="w-40 shrink-0 rounded-2xl overflow-hidden border border-[var(--color-border)] bg-white shadow-sm">
      <div className={cn("h-24 flex items-center justify-center", accent)}>
        {player.avatarPhotoUrl ? (
          <img src={player.avatarPhotoUrl} alt="" className="w-full h-full object-cover" />
        ) : player.emoji ? (
          <span className="text-4xl">{player.emoji}</span>
        ) : (
          <span className="text-white pm-display font-extrabold text-3xl">
            {getInitials(player.name)}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-faint)] font-semibold mb-0.5">
          {title}
        </p>
        <p className="text-sm font-bold truncate">{player.name}</p>
        <p className="text-[11px] text-[var(--color-text-dim)] mt-0.5 truncate">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

// Ligne de préférence — icône ronde à gauche, libellé fin, valeur en gras.
// Si `onEdit` est fourni, un petit bouton crayon apparaît en haut à droite
// de la zone pour permettre de modifier cette préférence.
function PreferenceRow({ emoji, label, value, onEdit }) {
  return (
    <div className="relative flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-[var(--color-border)]">
      <span className="w-10 h-10 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-lg shrink-0">
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-[var(--color-text-faint)]">{label}</p>
        <p className="text-sm font-bold truncate">{value}</p>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Modifier : ${label}`}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-sky-700 hover:border-sky-300 shrink-0"
        >
          <Icon.Edit className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// Petite fenêtre de modification d'une préférence — s'ouvre au clic sur le
// crayon d'une zone. Propose la liste de choix, "Valider" écrit directement
// sur Firebase (collection players) et referme la fenêtre.
function EditPreferenceModal({ player, field, title, options, onClose }) {
  const initial =
    field === "level"
      ? player.level || "Pas de niveau"
      : field === "preferredSide"
      ? normalizeSide(player.preferredSide) || "Polyvalent"
      : field === "federation"
      ? player.federation || "Aucune"
      : player.dominantHand || "Droitier";

  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const updates = { [field]: value };
      if (field === "level") {
        const levelInfo = LEVELS.find((l) => l.label === value);
        updates.levelSortValue = levelInfo ? levelInfo.value : 0;
      }
      await updateDoc(doc(db, "players", player.id), updates);
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Modifier : ${title}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Enregistrement..." : "Valider"}
          </Button>
        </>
      }
    >
      <Field label={title}>
        <select className={inputClass} value={value} onChange={(e) => setValue(e.target.value)}>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </Field>
    </Modal>
  );
}

// Petite fenêtre dédiée au changement du code PIN de connexion — ouverte via
// le bouton réglages sur l'en-tête de "Mon profil". Écrit directement sur
// Firebase (collection players) et referme la fenêtre.
function EditPinModal({ player, players, sessionToken, onClose }) {
  const [accessCode, setAccessCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [duplicateOwner, setDuplicateOwner] = useState(null);

  // Le code actuel n'est plus jamais lisible depuis le navigateur (voir
  // firestore.rules) : ce champ part vide, et la vérification de doublon se
  // fait via le serveur (api/manage-pin.js), seul à avoir accès à la
  // collection verrouillée player_credentials.
  useEffect(() => {
    if (accessCode.length !== 4) {
      setDuplicateOwner(null);
      return undefined;
    }
    let cancelled = false;
    fetch("/api/manage-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "check",
        code: accessCode,
        excludePlayerId: player.id,
        actingToken: sessionToken,
      }),
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
  }, [accessCode, players, player.id]);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const response = await fetch("/api/manage-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          excludePlayerId: player.id,
          actingToken: sessionToken,
        }),
      });
      const data = await response.json();
      if (data.ok) setAccessCode(data.code);
    } catch (e) {
      alert("Erreur lors de la génération du code.");
    } finally {
      setGenerating(false);
    }
  };

  const canSubmit = accessCode.length === 4 && !duplicateOwner;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const response = await fetch("/api/manage-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set",
          playerId: player.id,
          accessCode,
          actingToken: sessionToken,
        }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Échec de l'enregistrement du code PIN.");
      onClose();
    } catch (error) {
      alert("Erreur : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Modifier mon code PIN"
      onClose={onClose}
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
      <p className="text-xs text-[var(--color-text-dim)] mb-4">
        Ce code à 4 chiffres vous sert à vous connecter depuis l'écran d'accueil.
      </p>
      <Field label="Code PIN de connexion (4 chiffres)">
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
    </Modal>
  );
}

export function StatsView() {
  const { connectedPlayer, players, matches, sessionToken } = useAppData();
  const myStats = computePlayerStats(connectedPlayer.id, matches);
  const recentForm = getRecentForm(connectedPlayer.id, matches);
  const nameOf = (id) => players.find((p) => p.id === id)?.name || "Joueur inconnu";
  const playerOf = (id) => players.find((p) => p.id === id);

  const otherPlayers = players.filter((p) => p.id !== connectedPlayer.id);
  const [h2hA, setH2hA] = useState(connectedPlayer.id);
  const [h2hB, setH2hB] = useState(otherPlayers[0]?.id || "");
  const h2h = h2hA && h2hB && h2hA !== h2hB ? computeHeadToHead(h2hA, h2hB, matches) : null;

  const [editingPref, setEditingPref] = useState(null);
  const [showPinEdit, setShowPinEdit] = useState(false);

  const formStyle = {
    V: "bg-emerald-500 text-white",
    D: "bg-rose-500 text-white",
    X: "bg-amber-500",
  };

  // Résumé matchs — total joués vs 10 derniers, avec victoires pour chaque
  const last10 = recentForm.slice(-10);
  const last10Wins = last10.filter((f) => f.result === "V").length;
  const last10Rate = last10.length > 0 ? Math.round((last10Wins / last10.length) * 100) : 0;

  const highlightPeople = [
    myStats.topPartner &&
      playerOf(myStats.topPartner.id) && {
        player: playerOf(myStats.topPartner.id),
        title: "Coéquipier fétiche",
        subtitle: `${myStats.topPartner.count} match${myStats.topPartner.count > 1 ? "s" : ""} ensemble`,
        accentTone: "dark",
      },
    myStats.bestDuo &&
      playerOf(myStats.bestDuo.id) && {
        player: playerOf(myStats.bestDuo.id),
        title: "Duo gagnant",
        subtitle: `${myStats.bestDuo.rate}% de V (${myStats.bestDuo.wins}/${myStats.bestDuo.count})`,
        accentTone: "emerald",
      },
    myStats.topOpponent &&
      playerOf(myStats.topOpponent.id) && {
        player: playerOf(myStats.topOpponent.id),
        title: "Bête noire",
        subtitle: `${myStats.topOpponent.count} confrontation${myStats.topOpponent.count > 1 ? "s" : ""}`,
        accentTone: "rose",
      },
  ].filter(Boolean);

  const preferences = [
    {
      emoji: "👋",
      label: "Main dominante",
      value: connectedPlayer.dominantHand || "Non renseigné",
      field: "dominantHand",
      options: HAND_OPTIONS,
    },
    {
      emoji: "📍",
      label: "Position sur le court",
      value: normalizeSide(connectedPlayer.preferredSide) || "Non renseigné",
      field: "preferredSide",
      options: SIDE_OPTIONS,
    },
    {
      emoji: "🎖️",
      label: "Niveau",
      value:
        (LEVELS.find((l) => l.value === connectedPlayer.levelSortValue)?.label) ||
        connectedPlayer.level ||
        "Non renseigné",
      field: "level",
      options: LEVELS.map((l) => l.label),
    },
    {
      emoji: "🏛️",
      label: "Fédération",
      value:
        connectedPlayer.federation && connectedPlayer.federation !== "Aucune"
          ? connectedPlayer.federation
          : "Non renseignée",
      field: "federation",
      options: FEDERATION_OPTIONS,
    },
  ];

  return (
    <div className="pb-28">
      {/* En-tête profil — grand avatar, nom, contexte */}
      <div className="px-4 pt-2 pb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <AvatarSelfEditor player={connectedPlayer} size={80} />
            <div className="min-w-0">
              <p className="pm-display font-extrabold text-2xl text-white leading-tight truncate">
                {connectedPlayer.name}
              </p>
              <p className="text-sm text-white/80 mt-1">
                {connectedPlayer.isCreditor
                  ? "Créancier du club"
                  : connectedPlayer.isAdmin
                  ? "Administrateur"
                  : "Membre du club"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowPinEdit(true)}
            aria-label="Modifier mon code PIN"
            title="Modifier mon code PIN"
            className="p-2.5 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0"
          >
            <Icon.Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showPinEdit && (
        <EditPinModal
          player={connectedPlayer}
          players={players}
          sessionToken={sessionToken}
          onClose={() => setShowPinEdit(false)}
        />
      )}

      <div className="px-4">
        {myStats.played === 0 ? (
          <Card className="p-5 mb-6">
            <p className="text-sm text-[var(--color-text-dim)] text-center">
              Aucune statistique disponible pour le moment.
            </p>
          </Card>
        ) : (
          <>
            {/* Bloc "Statistiques" — chiffres à gauche + anneau à droite */}
            <h3 className="pm-display font-bold text-lg text-white mb-3">Statistiques</h3>
            <Card className="p-5 mb-4">
              <div className="flex items-center justify-between gap-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 flex-1">
                  <div>
                    <p className="pm-display font-extrabold text-3xl leading-none">
                      {myStats.played}
                    </p>
                    <p className="text-xs text-[var(--color-text-dim)] mt-1">Total</p>
                  </div>
                  <div>
                    <p className="pm-display font-extrabold text-3xl leading-none text-emerald-600">
                      {myStats.wins}
                    </p>
                    <p className="text-xs text-emerald-600 mt-1">Remportés</p>
                  </div>
                  <div>
                    <p className="pm-display font-extrabold text-3xl leading-none">
                      {last10.length}
                    </p>
                    <p className="text-xs text-[var(--color-text-dim)] mt-1">10 derniers</p>
                  </div>
                  <div>
                    <p className="pm-display font-extrabold text-3xl leading-none text-emerald-600">
                      {last10Wins}
                    </p>
                    <p className="text-xs text-emerald-600 mt-1">Remportés</p>
                  </div>
                </div>
                <ProgressRing value={last10Rate} label="Efficacité 10 derniers" />
              </div>
            </Card>

            {/* Bandeau forme (10 pastilles V/R/X) */}
            <Card className="p-4 mb-6">
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-faint)] font-semibold mb-2">
                Série récente
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {recentForm.map((f, i) => (
                  <span
                    key={f.id + i}
                    title={formatDateFR(f.date)}
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                      formStyle[f.result]
                    )}
                  >
                    {f.result !== "X" && f.result}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-[var(--color-text-faint)] mt-2">
                Du plus ancien au plus récent · V vert (victoire), D rouge (défaite), pastille
                orange (sans score)
              </p>
            </Card>

            {/* Carrousel de personnes fétiches / rivales */}
            {highlightPeople.length > 0 && (
              <>
                <h3 className="pm-display font-bold text-lg text-white mb-3">
                  Personnes marquantes
                </h3>
                <div className="flex gap-3 overflow-x-auto pb-3 mb-6 -mx-4 px-4 snap-x snap-mandatory">
                  {highlightPeople.map((p, i) => (
                    <div key={i} className="snap-start">
                      <PersonHighlightCard {...p} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* Préférences du joueur — modifiables via le crayon en haut à droite
            de chaque zone */}
        <h3 className="pm-display font-bold text-lg text-white mb-3">Préférences du joueur</h3>
        <div className="flex flex-col gap-2 mb-6">
          {preferences.map((p) => (
            <PreferenceRow
              key={p.label}
              emoji={p.emoji}
              label={p.label}
              value={p.value}
              onEdit={() => setEditingPref(p)}
            />
          ))}
        </div>

        {editingPref && (
          <EditPreferenceModal
            player={connectedPlayer}
            field={editingPref.field}
            title={editingPref.label}
            options={editingPref.options}
            onClose={() => setEditingPref(null)}
          />
        )}

        {/* Face-à-face — restylé plus léger */}
        <h3 className="pm-display font-bold text-lg text-white mb-3">Face-à-face</h3>
        <Card className="p-4 mb-6">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Joueur 1">
              <select className={inputClass} value={h2hA} onChange={(e) => setH2hA(e.target.value)}>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Joueur 2">
              <select className={inputClass} value={h2hB} onChange={(e) => setH2hB(e.target.value)}>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {h2hA === h2hB ? (
            <p className="text-xs text-[var(--color-text-faint)] italic">
              Choisissez deux joueurs différents pour voir leur face-à-face.
            </p>
          ) : h2h && (h2h.asOpponents > 0 || h2h.asPartners > 0) ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 rounded-xl bg-[var(--color-surface-2)]">
                <p className="pm-display font-extrabold text-xl">{h2h.asOpponents}</p>
                <p className="text-[10px] text-[var(--color-text-dim)] mt-1">Adversaires</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50">
                <p className="pm-display font-extrabold text-xl text-emerald-700">
                  {h2h.winsA}-{h2h.winsB}
                </p>
                <p className="text-[10px] text-emerald-700 mt-1">
                  Balance V ({nameOf(h2hA).split(" ")[0]} vs {nameOf(h2hB).split(" ")[0]})
                </p>
              </div>
              <div className="p-3 rounded-xl bg-sky-50">
                <p className="pm-display font-extrabold text-xl text-sky-700">
                  {h2h.asPartners}
                </p>
                <p className="text-[10px] text-sky-700 mt-1">Coéquipiers</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-faint)] italic">
              Aucun match commun trouvé entre {nameOf(h2hA)} et {nameOf(h2hB)}.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
