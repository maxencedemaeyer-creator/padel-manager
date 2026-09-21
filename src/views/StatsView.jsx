// ─────────────────────────────────────────────────────────────────────────
// Onglet "Mon profil" — en-tête, statistiques (ranking + anneau de
// progression), forme récente, personnes marquantes, préférences. Le PIN de
// connexion et les préférences de jeu se modifient tous les deux depuis un
// seul endroit : le bouton réglages (engrenage) en haut de l'écran.
// Le face-à-face est volontairement masqué (voir SHOW_HEAD_TO_HEAD plus bas)
// mais son code est conservé pour une réactivation future.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  cn,
  formatDateFR,
  getInitials,
  getFirstName,
  normalizeSide,
} from "../lib/utils";
import {
  LEVELS,
  HAND_OPTIONS,
  SIDE_OPTIONS,
  FEDERATION_OPTIONS,
} from "../lib/constants";
import {
  computePlayerStats,
  getRecentForm,
  computeHeadToHead,
  getPlayerPayments,
  getPlayerDebts,
} from "../lib/stats";
import { countMvpWins } from "../lib/mvp";
import { getPlayerRatingState, getRecentLevelDeltaHistory } from "../lib/levelRating";
import { useAppData } from "../context/AppContext";
import { Card, Badge, Field, inputClass, Modal, Button } from "../components/ui";
import Icon from "../components/icons/Icon";
import { AvatarSelfEditor } from "../components/players/AvatarSelfEditor";
import { MyPaymentsModal } from "../components/accounting/MyPaymentsModal";
import { MyDebtsModal } from "../components/accounting/MyDebtsModal";

// Le face-à-face n'est plus affiché (carte jugée peu prioritaire face à la
// densité de l'écran "Mon profil") — le code reste en place, prêt à être
// réactivé en repassant cette constante à `true`.
const SHOW_HEAD_TO_HEAD = false;

function ProgressRing({
  value,
  size = 110,
  stroke = 10,
  label,
  valueClassName = "text-2xl",
  labelClassName = "text-[10px]",
}) {
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
        <span className={cn("pm-display font-extrabold leading-none", valueClassName)}>
          {clamped}%
        </span>
        {label && (
          <span
            className={cn(
              "text-[var(--color-text-dim)] mt-0.5 leading-tight px-1",
              labelClassName
            )}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

// Carte "personne mise en avant" — avatar rond (émoji ou initiales,
// sur un fond coloré selon la catégorie) au-dessus du nom + info. Le rond
// imite l'affichage des avatars utilisé partout ailleurs dans l'app.
function PersonHighlightCard({ player, title, subtitle, accentTone = "dark" }) {
  const accent = {
    dark: "bg-slate-900",
    emerald: "bg-emerald-600",
    rose: "bg-rose-500",
  }[accentTone];
  return (
    <div className="w-36 shrink-0 rounded-2xl border border-[var(--color-border)] bg-white shadow-sm p-4 flex flex-col items-center text-center">
      <div
        className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center overflow-hidden shrink-0 mb-3",
          accent
        )}
      >
        {player.emoji ? (
          <span className="text-2xl">{player.emoji}</span>
        ) : (
          <span className="text-white pm-display font-extrabold text-lg">
            {getInitials(player.name)}
          </span>
        )}
      </div>
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-faint)] font-semibold mb-0.5">
        {title}
      </p>
      <p className="text-sm font-bold truncate w-full">{player.name}</p>
      <p className="text-[11px] text-[var(--color-text-dim)] mt-0.5 truncate w-full">
        {subtitle}
      </p>
    </div>
  );
}

// Variante de PersonHighlightCard sans joueur : affichée à la place de la
// carte "Bête noire" quand le joueur n'a encaissé aucune défaite (voir
// highlightPeople plus bas) — pas d'adversaire à mettre en avant dans ce cas.
function NoNemesisCard() {
  return (
    <div className="w-36 shrink-0 rounded-2xl border border-[var(--color-border)] bg-white shadow-sm p-4 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center bg-emerald-600 mb-3">
        <span className="text-2xl">🏆</span>
      </div>
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-faint)] font-semibold mb-0.5">
        Bête noire
      </p>
      <p className="text-sm font-bold">Aucune</p>
      <p className="text-[11px] text-[var(--color-text-dim)] mt-0.5">
        Tu as tout gagné pour l'instant
      </p>
    </div>
  );
}

// Ligne de préférence — icône ronde à gauche, libellé fin, valeur en gras.
// Conçue pour vivre à l'intérieur d'une carte commune (voir "Préférences du
// joueur" plus bas), affichée en tuile (grille 2x2) : bordure et coins
// arrondis propres à la tuile, plus de séparateur géré par le parent. Si
// `onEdit` est fourni, un petit bouton crayon apparaît à droite pour
// modifier cette préférence.
function PreferenceRow({ emoji, label, value, onEdit }) {
  return (
    <div className="flex items-center gap-2.5 p-3 rounded-xl border border-[var(--color-border)]">
      <span className="w-9 h-9 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-base shrink-0">
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
          className="p-1.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-sky-700 hover:border-sky-300 shrink-0"
        >
          <Icon.Edit className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// Fenêtre unique "Paramètres" — regroupe le code PIN de connexion ET les 4
// préférences de jeu (main, position, niveau, fédération), ouverte via le
// bouton réglages sur l'en-tête de "Mon profil". Le PIN reste optionnel :
// laissé vide, il n'est pas modifié (le code actuel n'est de toute façon
// jamais lisible depuis le navigateur, voir firestore.rules) et passe par le
// serveur (api/manage-pin.js, seul à avoir accès à la collection verrouillée
// player_credentials) ; les préférences s'écrivent directement sur Firebase
// (collection players), en un seul "Enregistrer".
function SettingsModal({ player, players, sessionToken, onClose }) {
  const [accessCode, setAccessCode] = useState("");
  const [generating, setGenerating] = useState(false);
  const [duplicateOwner, setDuplicateOwner] = useState(null);

  const [dominantHand, setDominantHand] = useState(player.dominantHand || "Droitier");
  const [preferredSide, setPreferredSide] = useState(
    normalizeSide(player.preferredSide) || "Polyvalent"
  );
  const [federation, setFederation] = useState(player.federation || "Aucune");
  const [level, setLevel] = useState(player.level || "Pas de niveau");

  const [saving, setSaving] = useState(false);

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

  // Champ PIN optionnel : vide = inchangé. Rempli, il doit faire 4 chiffres
  // et ne pas être déjà pris par quelqu'un d'autre.
  const pinValid = accessCode.length === 0 || (accessCode.length === 4 && !duplicateOwner);
  const canSubmit = pinValid;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      if (accessCode.length === 4) {
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
      }

      const levelInfo = LEVELS.find((l) => l.label === level);
      await updateDoc(doc(db, "players", player.id), {
        dominantHand,
        preferredSide,
        federation,
        level,
        levelSortValue: levelInfo ? levelInfo.value : 0,
      });

      onClose();
    } catch (error) {
      alert("Erreur : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Paramètres de mon profil"
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
      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] mb-2">
        Connexion
      </p>
      <Field label="Nouveau code PIN (laisser vide pour ne pas le changer)">
        <div className="flex gap-2">
          <input
            className={cn(inputClass, "pm-mono tracking-[0.3em] text-center")}
            value={accessCode}
            maxLength={4}
            placeholder="••••"
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

      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] mb-2 mt-5">
        Préférences de jeu
      </p>
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
        <Field label="Position sur le court">
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

      <Field label="Niveau estimé">
        <select className={inputClass} value={level} onChange={(e) => setLevel(e.target.value)}>
          {LEVELS.map((l) => (
            <option key={l.label} value={l.label}>
              {l.label}
            </option>
          ))}
        </select>
      </Field>

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
    </Modal>
  );
}

// Ranking (voir claude/feature-ranking-padel-manager.md §6) — désormais
// incorporé directement dans la carte "Statistiques" (pastille "🎾 nombre"
// ou "🎾 N.C.", avec le libellé "Ranking" au-dessus). Popup d'explication, courte
// et à la demande seulement (bouton "?").
function RankingInfoModal({ onClose }) {
  return (
    <Modal
      title="Qu'est-ce que le Ranking ?"
      onClose={onClose}
      footer={<Button onClick={onClose}>Compris</Button>}
    >
      <p className="text-sm text-[var(--color-text-dim)]">
        Ce ranking reflète votre niveau interne au club. Il évolue automatiquement selon vos
        résultats en matchs officiels : une victoire face à plus fort que vous rapporte davantage,
        une défaite face à plus fort que vous coûte peu, et l'écart de jeux compte aussi. Jouer
        régulièrement fait aussi progresser doucement votre ranking, même après une défaite. Il se
        recale si vous changez votre niveau officiel dans votre profil.
      </p>
      <p className="text-sm font-semibold mt-4 mb-1.5">Comment augmenter mon ranking ?</p>
      <ul className="text-sm text-[var(--color-text-dim)] list-disc pl-5 flex flex-col gap-1">
        <li>Jouer souvent : la régularité fait progresser doucement, même après une défaite.</li>
        <li>Gagner plus de matchs.</li>
        <li>Battre des joueurs plus forts que vous : c'est ce qui rapporte le plus.</li>
        <li>Gagner nettement (grand écart de jeux) quand vous étiez l'outsider.</li>
      </ul>
    </Modal>
  );
}

// Popup d'explication du code couleur de la "Série récente" — masqué par
// défaut derrière un bouton "?" discret pour ne pas alourdir la carte.
function RecentFormInfoModal({ onClose }) {
  return (
    <Modal
      title="Comment lire cette série ?"
      onClose={onClose}
      footer={<Button onClick={onClose}>Compris</Button>}
    >
      <p className="text-sm text-[var(--color-text-dim)]">
        Du plus ancien au plus récent · <span className="font-semibold text-emerald-600">V</span> vert
        (victoire), <span className="font-semibold text-rose-600">D</span> rouge (défaite),{" "}
        <span className="font-semibold text-amber-600">N</span> orange (match nul), pastille orange
        vide (sans score).
      </p>
    </Modal>
  );
}

// Mini-sparkline épurée et minimaliste — sans axe, sans chiffres, sans
// interaction : juste un trait fin donnant la tendance sur les derniers
// matchs officiels notés.
function RankingSparkline({ values, width = 150, height = 28 }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-lime)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StatsView() {
  const { connectedPlayer, players, matches, sessionToken, isAdmin, rankingEnabled } = useAppData();
  // Ranking — même condition d'affichage que PlayerRow.jsx/MyMatchSummary.jsx.
  const showRanking = isAdmin || rankingEnabled;
  // Mémoïsé (04/09/2026) : ces calculs reparcourent TOUS les matchs (et,
  // pour `ranked`, une fois PAR JOUEUR du club) — recalculés jusqu'ici à
  // chaque rendu de l'onglet "Mon profil", même pour un rendu qui n'a rien
  // à voir avec les matchs (ouvrir une préférence, changer le face-à-face).
  // Ne sont refaits que si les matchs, les joueurs ou le joueur connecté
  // changent réellement.
  const myStats = useMemo(
    () => computePlayerStats(connectedPlayer.id, matches),
    [connectedPlayer.id, matches]
  );
  const recentForm = useMemo(
    () => getRecentForm(connectedPlayer.id, matches),
    [connectedPlayer.id, matches]
  );
  // Ranking — état + historique du joueur connecté, utilisés dans la carte
  // "Statistiques" (voir RankingSparkline plus haut).
  const rankingState = useMemo(
    () => getPlayerRatingState(connectedPlayer),
    [connectedPlayer]
  );
  const rankingHistory = useMemo(
    () => getRecentLevelDeltaHistory(connectedPlayer.id, matches, 10),
    [connectedPlayer.id, matches]
  );
  const rankingSparklineValues = rankingHistory.map(({ entry }) => entry.apres);
  const rankingLastEntry = rankingHistory[rankingHistory.length - 1] || null;
  const nameOf = (id) => players.find((p) => p.id === id)?.name || "Joueur inconnu";
  const playerOf = (id) => players.find((p) => p.id === id);

  const otherPlayers = players.filter((p) => p.id !== connectedPlayer.id);
  const [h2hA, setH2hA] = useState(connectedPlayer.id);
  const [h2hB, setH2hB] = useState(otherPlayers[0]?.id || "");
  const h2h = useMemo(
    () => (h2hA && h2hB && h2hA !== h2hB ? computeHeadToHead(h2hA, h2hB, matches) : null),
    [h2hA, h2hB, matches]
  );

  const [showSettings, setShowSettings] = useState(false);
  const [showRankingInfo, setShowRankingInfo] = useState(false);
  const [showFormInfo, setShowFormInfo] = useState(false);

  // "Mes paiements" — visible pour TOUT joueur (normal, créancier ou admin) :
  // même un créancier peut avoir remboursé un AUTRE créancier pour un match
  // donné (ex. son propre créancier de session était absent ce jour-là), ce
  // qui n'apparaît alors pas dans "Ma consommation personnelle" de sa propre
  // comptabilité créancier — voir getPlayerPayments dans lib/stats.js.
  const myPayments = useMemo(
    () => getPlayerPayments(connectedPlayer.id, matches),
    [connectedPlayer.id, matches]
  );
  const myPaymentsMatchesCount = useMemo(
    () => new Set(myPayments.payments.map((p) => p.matchId)).size,
    [myPayments]
  );
  const [showMyPayments, setShowMyPayments] = useState(false);

  // "Ce que je dois" — miroir de "Mes paiements" côté dette : matchs déjà
  // joués où ma part n'est pas encore réglée. Réutilise le même calcul que
  // la liste "impayés" de "Ma comptabilité" (voir getPlayerDebts, lib/
  // stats.js). Bloc volontairement invisible si aucune dette (myDebts.total === 0).
  const myDebts = useMemo(
    () => getPlayerDebts(connectedPlayer.id, matches, players),
    [connectedPlayer.id, matches, players]
  );
  const [showMyDebts, setShowMyDebts] = useState(false);

  // Jeu "Homme du match" (Game Center) — nombre de fois où CE joueur a été
  // élu, toute la saison confondue. Rien n'est affiché s'il n'a jamais été
  // élu (voir lib/mvp.js → countMvpWins).
  const [mvpWins, setMvpWins] = useState(0);
  useEffect(() => {
    let cancelled = false;
    countMvpWins(connectedPlayer.id).then((count) => {
      if (!cancelled) setMvpWins(count);
    });
    return () => {
      cancelled = true;
    };
  }, [connectedPlayer.id]);

  const formStyle = {
    V: "bg-emerald-500 text-white",
    D: "bg-rose-500 text-white",
    N: "bg-amber-500 text-white",
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
        subtitle: `${myStats.topOpponent.losses} défaite${myStats.topOpponent.losses > 1 ? "s" : ""} sur ${myStats.topOpponent.count} confrontation${myStats.topOpponent.count > 1 ? "s" : ""}`,
        accentTone: "rose",
      },
    // Pas de bête noire à afficher (aucun adversaire n'a de défaite face à
    // nous) mais on a bien des matchs décidés au compteur : le dire
    // explicitement plutôt que de laisser disparaître la carte en silence.
    !myStats.topOpponent &&
      myStats.losses === 0 &&
      myStats.wins > 0 && { noNemesis: true },
  ].filter(Boolean);

  const preferences = [
    {
      emoji: "👋",
      label: "Main dominante",
      value: connectedPlayer.dominantHand || "Non renseigné",
    },
    {
      emoji: "📍",
      label: "Position sur le court",
      value: normalizeSide(connectedPlayer.preferredSide) || "Non renseigné",
    },
    {
      emoji: "🎖️",
      label: "Niveau",
      value:
        (LEVELS.find((l) => l.value === connectedPlayer.levelSortValue)?.label) ||
        connectedPlayer.level ||
        "Non renseigné",
    },
    {
      emoji: "🏛️",
      label: "Fédération",
      value:
        connectedPlayer.federation && connectedPlayer.federation !== "Aucune"
          ? connectedPlayer.federation
          : "Aucune",
    },
  ];

  return (
    <div className="pb-28">
      {/* En-tête profil — grand avatar, prénom (nom de famille masqué, trop
          de place sur mobile), contexte */}
      <div className="px-4 pt-2 pb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <AvatarSelfEditor player={connectedPlayer} size={80} />
            <div className="min-w-0">
              <p className="pm-display font-extrabold text-2xl text-white leading-tight truncate">
                {getFirstName(connectedPlayer.name)}
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
            onClick={() => setShowSettings(true)}
            aria-label="Paramètres de mon profil"
            title="Paramètres"
            className="p-2.5 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0"
          >
            <Icon.Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          player={connectedPlayer}
          players={players}
          sessionToken={sessionToken}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div className="px-4">
        {mvpWins > 0 && (
          <Card className="p-4 mb-4 flex items-center gap-3 bg-gradient-to-r from-amber-50 to-amber-100/80 border-amber-200/70">
            <span className="text-3xl leading-none">🥇</span>
            <div>
              <p className="pm-display font-extrabold text-2xl leading-none">{mvpWins}</p>
              <p className="text-xs text-amber-800 mt-1">
                fois élu homme du match
              </p>
            </div>
          </Card>
        )}

        {/* Bloc "Statistiques" — tout tient désormais sur une seule ligne :
            à gauche la colonne Ranking (pastille identique à celle de l'onglet
            Équipe mais en grand, puis la tendance en petit,
            puis le delta du dernier match encore plus petit, du plus au
            moins important visuellement), à droite les totaux + le rond
            d'efficacité, réduits pour respirer sur la même hauteur. */}
        {(showRanking || myStats.played > 0) && (
          <>
            <h3 className="pm-display font-bold text-lg text-white mb-3">Statistiques</h3>
            <Card className="p-5 mb-6 relative">
              {showRanking && (
                <button
                  type="button"
                  onClick={() => setShowRankingInfo(true)}
                  aria-label="En savoir plus sur le Ranking"
                  title="En savoir plus"
                  className="absolute top-4 right-4 p-1.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-lime)]"
                >
                  <Icon.Question className="w-3.5 h-3.5" />
                </button>
              )}

              <div className="flex items-center gap-4">
                {showRanking && (
                  <div
                    className={cn(
                      "flex flex-col items-center shrink-0 text-center",
                      myStats.played > 0 && "pr-4 border-r border-[var(--color-border)]"
                    )}
                  >
                    <p className="text-[9px] uppercase tracking-wide text-[var(--color-text-faint)] font-semibold mb-1.5">
                      Ranking
                    </p>
                    {/* Même pastille que dans l'onglet Équipe (Badge "lime" :
                        fond turquoise, balle de tennis + nombre, ou "N.C."
                        pour un joueur non classé), en plus grand. */}
                    <Badge
                      tone="lime"
                      className="pm-display !px-3.5 !py-1.5 !text-xl !font-extrabold !gap-1.5 leading-none"
                    >
                      <span className="text-lg leading-none">🎾</span>
                      {rankingState.hasRanking
                        ? rankingState.score.toFixed(1).replace(".", ",")
                        : "N.C."}
                    </Badge>
                    {rankingState.hasRanking && rankingSparklineValues.length >= 2 ? (
                      <>
                        <div className="mt-1.5">
                          <RankingSparkline values={rankingSparklineValues} width={72} height={16} />
                        </div>
                        {rankingLastEntry && (
                          <p className="text-[9px] text-[var(--color-text-dim)] mt-1 leading-none whitespace-nowrap">
                            Dernier :{" "}
                            <span
                              className={
                                rankingLastEntry.entry.delta >= 0
                                  ? "text-emerald-600 font-semibold"
                                  : "text-rose-600 font-semibold"
                              }
                            >
                              {rankingLastEntry.entry.delta >= 0 ? "▲" : "▼"}{" "}
                              {rankingLastEntry.entry.delta >= 0 ? "+" : ""}
                              {rankingLastEntry.entry.delta.toFixed(1).replace(".", ",")}
                            </span>
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-[9px] text-[var(--color-text-dim)] mt-1.5 leading-tight max-w-[76px]">
                        Pas encore de ranking
                      </p>
                    )}
                  </div>
                )}

                {myStats.played > 0 ? (
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 flex-1 min-w-0">
                      <div>
                        <p className="pm-display font-extrabold text-xl leading-none">
                          {myStats.played}
                        </p>
                        <p className="text-[10px] text-[var(--color-text-dim)] mt-0.5">Total</p>
                      </div>
                      <div>
                        <p className="pm-display font-extrabold text-xl leading-none text-emerald-600">
                          {myStats.wins}
                        </p>
                        <p className="text-[10px] text-emerald-600 mt-0.5">Remportés</p>
                      </div>
                      <div>
                        <p className="pm-display font-extrabold text-xl leading-none">
                          {last10.length}
                        </p>
                        <p className="text-[10px] text-[var(--color-text-dim)] mt-0.5">10 derniers</p>
                      </div>
                      <div>
                        <p className="pm-display font-extrabold text-xl leading-none text-emerald-600">
                          {last10Wins}
                        </p>
                        <p className="text-[10px] text-emerald-600 mt-0.5">Remportés</p>
                      </div>
                    </div>
                    <ProgressRing
                      value={last10Rate}
                      size={64}
                      stroke={6}
                      label="Efficacité"
                      valueClassName="text-sm"
                      labelClassName="text-[8px]"
                    />
                  </div>
                ) : (
                  showRanking && (
                    <p className="text-xs text-[var(--color-text-dim)] flex-1 text-center">
                      Aucune statistique disponible pour le moment.
                    </p>
                  )
                )}
              </div>
            </Card>
          </>
        )}

        {showRankingInfo && <RankingInfoModal onClose={() => setShowRankingInfo(false)} />}

        {myStats.played > 0 && (
          <>
            {/* Bandeau forme (10 pastilles V/R/X) — légende disponible via le
                bouton "?" plutôt qu'affichée en permanence */}
            <Card className="p-4 mb-6 relative">
              <div className="flex items-center justify-between mb-2 pr-6">
                <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-faint)] font-semibold">
                  Série récente
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFormInfo(true)}
                aria-label="Comment lire cette série ?"
                title="Comment lire cette série ?"
                className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-lime)]"
              >
                <Icon.Question className="w-3.5 h-3.5" />
              </button>
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
            </Card>

            {showFormInfo && <RecentFormInfoModal onClose={() => setShowFormInfo(false)} />}

            {/* Carrousel de personnes fétiches / rivales */}
            {highlightPeople.length > 0 && (
              <>
                <h3 className="pm-display font-bold text-lg text-white mb-3">
                  Personnes marquantes
                </h3>
                <div className="flex gap-3 overflow-x-auto pb-3 mb-6 -mx-4 px-4 snap-x snap-mandatory">
                  {highlightPeople.map((p, i) => (
                    <div key={i} className="snap-start">
                      {p.noNemesis ? <NoNemesisCard /> : <PersonHighlightCard {...p} />}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* Préférences du joueur — carte en lecture seule ; se modifient
            désormais depuis le bouton Paramètres (engrenage) en haut de
            l'écran, avec le code PIN. */}
        <h3 className="pm-display font-bold text-lg text-white mb-3">Préférences du joueur</h3>
        <Card className="p-4 mb-6">
          <div className="grid grid-cols-2 gap-2.5">
            {preferences.map((p) => (
              <PreferenceRow key={p.label} emoji={p.emoji} label={p.label} value={p.value} />
            ))}
          </div>
        </Card>

        {/* Face-à-face — masqué pour l'instant (voir SHOW_HEAD_TO_HEAD en
            haut de fichier), code conservé pour réactivation future */}
        {SHOW_HEAD_TO_HEAD && (
          <>
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
          </>
        )}

        {/* Ce que je dois — matchs déjà joués pas encore réglés de mon côté.
            N'apparaît pas du tout si je suis à jour, pour ne rien ajouter à
            l'écran des joueurs qui n'ont aucune dette. */}
        {myDebts.total > 0 && (
          <>
            <h3 className="pm-display font-bold text-lg text-white mb-3">Ce que je dois</h3>
            <Card className="mb-6 overflow-hidden p-0">
              <button
                type="button"
                onClick={() => setShowMyDebts(true)}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/40 active:bg-white/50 transition-colors"
              >
                <span className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                  <Icon.AlertCircle className="w-5 h-5 text-orange-600" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block pm-display font-extrabold text-2xl leading-none text-orange-600">
                    {myDebts.total.toLocaleString("fr-FR")} €
                  </span>
                  <span className="block text-xs text-[var(--color-text-dim)] mt-1.5">
                    {myDebts.debts.length} match{myDebts.debts.length > 1 ? "s" : ""} à régler
                  </span>
                </span>
                <Icon.Chevron className="w-4 h-4 text-[var(--color-text-faint)] shrink-0" />
              </button>
            </Card>

            {showMyDebts && (
              <MyDebtsModal
                debts={myDebts.debts}
                players={players}
                onClose={() => setShowMyDebts(false)}
              />
            )}
          </>
        )}

        {/* Mes paiements — tout ce que j'ai remboursé à un créancier, quel
            que soit mon propre rôle dans l'app. Clic sur le bloc = liste
            nominative complète (référence du match, montant, créancier). */}
        <h3 className="pm-display font-bold text-lg text-white mb-3">Mes paiements</h3>
        <Card className="mb-6 overflow-hidden p-0">
          <button
            type="button"
            onClick={() => myPayments.payments.length > 0 && setShowMyPayments(true)}
            disabled={myPayments.payments.length === 0}
            className="w-full flex items-center gap-4 p-5 text-left disabled:cursor-default hover:bg-white/40 active:bg-white/50 transition-colors disabled:hover:bg-transparent"
          >
            <span className="w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center shrink-0">
              <Icon.Coin className="w-5 h-5 text-sky-600" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block pm-display font-extrabold text-2xl leading-none">
                {myPayments.total.toLocaleString("fr-FR")} €
              </span>
              <span className="block text-xs text-[var(--color-text-dim)] mt-1.5">
                {myPayments.payments.length > 0
                  ? `${myPaymentsMatchesCount} match${myPaymentsMatchesCount > 1 ? "s" : ""} remboursé${myPaymentsMatchesCount > 1 ? "s" : ""}`
                  : "Aucun paiement enregistré pour le moment"}
              </span>
            </span>
            {myPayments.payments.length > 0 && (
              <Icon.Chevron className="w-4 h-4 text-[var(--color-text-faint)] shrink-0" />
            )}
          </button>
        </Card>

        {showMyPayments && (
          <MyPaymentsModal
            payments={myPayments.payments}
            players={players}
            onClose={() => setShowMyPayments(false)}
          />
        )}
      </div>
    </div>
  );
}
