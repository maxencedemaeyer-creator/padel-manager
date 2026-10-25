// ─────────────────────────────────────────────────────────────────────────
// Cartes de session : SessionCard (un ou plusieurs terrains, vue complète),
// et les variantes compactes utilisées pour "Dernier match joué".
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { cn, formatDateFR, formatTimeFR, clubNameOnly, getFirstName } from "../../lib/utils";
import { hasMatchScore, getSetDisplay, getMatchTiming, getMatchStart, useNow } from "../../lib/matchLogic";
import { isCompositionPublished, setCompositionPublished } from "../../lib/composition";
import {
  getConvocationOverride,
  getAutoOpenDate,
  isConvocationOpen,
  setConvocationOverride,
} from "../../lib/convocation";
import { getAvailabilityGroups } from "../../lib/availability";
import { useAppData } from "../../context/AppContext";
import { canEditExistingScore } from "../../lib/permissions";
import Icon from "../icons/Icon";
import { Card, Badge, Modal } from "../ui";
import { CourtPanel } from "./CourtPanel";
import { EditMatchDateTimeModal, CourtSettingsMenu, DeleteMatchConfirmModal } from "./MatchSettingsModals";
import { EndMatchModal } from "./EndMatchModal";
import { RoundModal, deleteRoundAndRanking } from "./RoundModal";
import { expandRounds, getRounds } from "../../lib/rounds";
import { ReplacePlayerModal } from "./PickPlayerModal";
import {
  AvailabilityButtons,
  RespondedPlayersPanel,
  ManagePresenceModal,
  InvitePlayersModal,
} from "./Availability";

// ─────────────────────────────────────────────────────────────────────────
// (19/10/2026) Bandeau admin « 5 boutons » — remplace les anciens bandeaux
// empilés (convocation, publication, bouton occasionnel, lien « Modifier une
// présence » et tableau des réponses toujours affiché). Même esprit que la
// barre de tri de l'onglet Équipe : un seul cadre, cases de même taille, sur
// UNE ligne. Chaque case ouvre sa fenêtre pop-up :
//   1. Composition  — vert si publiée, rouge sinon
//   2. Convocation  — vert si ouverte, rouge si fermée
//   3. Réponses     — tableau Présents / Incertains / Absents + « Sans réponse »
//   4. Présence     — fenêtre « Modifier une présence » existante
//   5. Occasionnel  — fenêtre « Convoquer un joueur occasionnel » existante
//                     (case masquée s'il n'existe aucun joueur occasionnel)
// Purement visuel : aucune lecture / écriture Firebase en plus.
// ─────────────────────────────────────────────────────────────────────────
function AdminSessionBar({ sessionMatches }) {
  const { presenceWindowDays, players } = useAppData();
  const now = useNow();
  const [openModal, setOpenModal] = useState(null);
  const close = () => setOpenModal(null);

  const published = isCompositionPublished(sessionMatches);
  const convocOpen = isConvocationOpen(sessionMatches, now, presenceWindowDays);
  const { present } = getAvailabilityGroups(sessionMatches, players);
  const hasOccasionalPlayers = players.some((p) => p.isOccasional);

  const buttons = [
    {
      id: "compo",
      icon: Icon.Users,
      lines: ["Compo", published ? "publiée" : "masquée"],
      tone: published ? "ok" : "ko",
      aria: published ? "Composition publiée" : "Composition non publiée",
    },
    {
      id: "convoc",
      icon: Icon.Bell,
      lines: ["Convoc.", convocOpen ? "ouverte" : "fermée"],
      tone: convocOpen ? "ok" : "ko",
      aria: convocOpen ? "Convocation ouverte" : "Convocation fermée",
    },
    {
      id: "responses",
      icon: Icon.Check,
      lines: ["Réponses", `${present.length} présent${present.length > 1 ? "s" : ""}`],
      tone: "neutral",
      aria: "Voir les réponses des joueurs",
    },
    {
      id: "presence",
      icon: Icon.Edit,
      lines: ["Modifier", "présence"],
      tone: "neutral",
      aria: "Modifier une présence",
    },
    hasOccasionalPlayers && {
      id: "invite",
      icon: Icon.Plus,
      lines: ["Inviter", "un joueur"],
      tone: "neutral",
      aria: "Convoquer un joueur occasionnel",
    },
  ].filter(Boolean);

  return (
    <>
      <div
        role="group"
        aria-label="Gestion de la session"
        className="grid gap-1 p-1 mb-3 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)]"
        style={{ gridTemplateColumns: `repeat(${buttons.length}, minmax(0, 1fr))` }}
      >
        {buttons.map((b) => {
          const BtnIcon = b.icon;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setOpenModal(b.id)}
              aria-label={b.aria}
              title={b.aria}
              className={cn(
                "h-14 px-0.5 rounded-xl flex flex-col items-center justify-center gap-0.5 text-center",
                "text-[9px] min-[390px]:text-[10px] sm:text-xs font-semibold leading-[1.1] tracking-tight whitespace-nowrap",
                "transition-all active:scale-95",
                b.tone === "ok" && "bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200",
                b.tone === "ko" && "bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200",
                b.tone === "neutral" &&
                  "bg-white text-[var(--color-text-dim)] border border-[var(--color-border)] hover:border-sky-300 hover:text-sky-700"
              )}
            >
              <BtnIcon className="w-3.5 h-3.5 shrink-0 mb-0.5" />
              {b.lines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </button>
          );
        })}
      </div>

      {openModal === "compo" && (
        <PublishCompositionModal sessionMatches={sessionMatches} onClose={close} />
      )}
      {openModal === "convoc" && (
        <ConvocationSettingsModal sessionMatches={sessionMatches} onClose={close} />
      )}
      {openModal === "responses" && (
        <ResponsesModal
          sessionMatches={sessionMatches}
          onClose={close}
          onEditPresence={() => setOpenModal("presence")}
        />
      )}
      {openModal === "presence" && (
        <ManagePresenceModal sessionMatches={sessionMatches} onClose={close} />
      )}
      {openModal === "invite" && (
        <InvitePlayersModal sessionMatches={sessionMatches} onClose={close} />
      )}
    </>
  );
}

// Fenêtre « Composition » : rappelle l'état actuel et permet de publier ou
// dépublier la composition de TOUS les terrains de la date à la fois. Tant
// qu'elle n'est pas publiée, les joueurs ne voient que leurs boutons de
// présence (voir MatchesView.jsx / isCompositionPublished).
function PublishCompositionModal({ sessionMatches, onClose }) {
  const [busy, setBusy] = useState(false);
  const published = isCompositionPublished(sessionMatches);

  const toggle = async () => {
    setBusy(true);
    try {
      await setCompositionPublished(sessionMatches, !published);
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Composition" onClose={onClose}>
      <div
        className={cn(
          "flex items-center gap-2 p-3 rounded-xl border",
          published ? "border-emerald-300 bg-emerald-50" : "border-rose-200 bg-rose-50"
        )}
      >
        <span
          className={cn("w-2.5 h-2.5 rounded-full shrink-0", published ? "bg-emerald-500" : "bg-rose-500")}
        />
        <p className="text-sm font-semibold">
          {published ? "Publiée — visible par les joueurs" : "Non publiée — visible par vous uniquement"}
        </p>
      </div>
      <p className="text-xs text-[var(--color-text-dim)]">
        {published
          ? "Dépublier cache à nouveau les terrains aux joueurs : ils ne verront plus que leur présence."
          : "Publier rend la composition de tous les terrains de cette date visible par tous les joueurs."}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={toggle}
        className={cn(
          "w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 active:scale-[0.98]",
          published
            ? "bg-white border border-rose-300 text-rose-700 hover:bg-rose-50"
            : "bg-emerald-500 text-white hover:bg-emerald-600"
        )}
      >
        {busy ? "Enregistrement..." : published ? "Dépublier la composition" : "Publier la composition"}
      </button>
    </Modal>
  );
}

// Fenêtre « Gérer la convocation » — 3 choix mutuellement exclusifs :
// automatique (comportement par défaut, piloté par le réglage global),
// forcer l'ouverture (utile pour convoquer plus tôt qu'à l'accoutumée), ou
// forcer la fermeture (utile pour un match pas encore certain). Rappelle
// explicitement que les réponses déjà données ne sont jamais affectées.
function ConvocationSettingsModal({ sessionMatches, onClose }) {
  const { presenceWindowDays } = useAppData();
  const now = useNow();
  const [saving, setSaving] = useState(false);
  const currentOverride = getConvocationOverride(sessionMatches);
  const open = isConvocationOpen(sessionMatches, now, presenceWindowDays);
  const autoOpenDate = currentOverride ? null : getAutoOpenDate(sessionMatches, presenceWindowDays);

  let statusLabel;
  if (currentOverride === "open") statusLabel = "Ouverte (forcée par vous)";
  else if (currentOverride === "closed") statusLabel = "Fermée (forcée par vous)";
  else if (open) statusLabel = "Ouverte (automatique)";
  else statusLabel = `Fermée — ouvrira le ${formatDateFR(autoOpenDate)}`;

  const choose = async (value) => {
    setSaving(true);
    try {
      await setConvocationOverride(sessionMatches, value);
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const OPTIONS = [
    {
      value: null,
      label: "Automatique",
      desc: "S'ouvre toute seule selon le réglage global (Administration).",
    },
    {
      value: "open",
      label: "Forcer l'ouverture",
      desc: "Les joueurs peuvent répondre dès maintenant, même hors fenêtre.",
    },
    {
      value: "closed",
      label: "Forcer la fermeture",
      desc: "Personne (sauf vous) ne peut répondre, même dans la fenêtre.",
    },
  ];

  return (
    <Modal title="Gérer la convocation" onClose={onClose}>
      <div
        className={cn(
          "flex items-center gap-2 p-3 rounded-xl border",
          open ? "border-emerald-300 bg-emerald-50" : "border-rose-200 bg-rose-50"
        )}
      >
        <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", open ? "bg-emerald-500" : "bg-rose-500")} />
        <p className="text-sm font-semibold">{statusLabel}</p>
      </div>
      <p className="text-xs text-[var(--color-text-dim)]">
        Ne change jamais les réponses déjà données par les joueurs — contrôle
        uniquement qui peut encore répondre à partir de maintenant.
      </p>
      <div className="flex flex-col gap-2">
        {OPTIONS.map((opt) => {
          const active = (currentOverride || null) === opt.value;
          return (
            <button
              key={opt.label}
              type="button"
              disabled={saving}
              onClick={() => choose(opt.value)}
              className={cn(
                "text-left p-3 rounded-xl border transition-all disabled:opacity-50",
                active
                  ? "border-sky-400 bg-sky-50"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-sky-300"
              )}
            >
              <p className="text-sm font-bold flex items-center gap-1.5">
                {active && <Icon.Check className="w-3.5 h-3.5 text-sky-600" />}
                {opt.label}
              </p>
              <p className="text-[11px] text-[var(--color-text-dim)] mt-0.5">{opt.desc}</p>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// Fenêtre « Réponses des joueurs » : reprend le tableau Présents / Incertains
// / Absents (en gras = déjà placé sur un terrain) et ajoute en dessous la
// liste de ceux qui n'ont PAS encore répondu — pratique pour savoir qui
// relancer. Un bouton en bas mène directement à « Modifier une présence ».
function ResponsesModal({ sessionMatches, onClose, onEditPresence }) {
  const { players } = useAppData();
  const { pending } = getAvailabilityGroups(sessionMatches, players);
  const waiting = pending
    .filter((p) => !p.isTest)
    .map((p) => getFirstName(p.name))
    .sort((a, b) => a.localeCompare(b, "fr"));

  return (
    <Modal
      title="Réponses des joueurs"
      onClose={onClose}
      wide
      footer={
        <button
          type="button"
          onClick={onEditPresence}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold bg-sky-500 text-white hover:bg-sky-600 active:scale-[0.98] transition-all"
        >
          <Icon.Edit className="w-4 h-4" />
          Modifier une présence
        </button>
      }
    >
      <RespondedPlayersPanel sessionMatches={sessionMatches} />
      <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] mb-1">
          Sans réponse · {waiting.length}
        </p>
        <p className="text-xs text-[var(--color-text-dim)]">
          {waiting.length ? waiting.join(", ") : "Tout le monde a répondu 🎉"}
        </p>
      </div>
      <p className="text-[11px] text-[var(--color-text-faint)]">
        En gras : joueurs déjà placés sur un terrain.
      </p>
    </Modal>
  );
}

export function SessionCard({ sessionMatches, now }) {
  const { perms } = useAppData();
  // Admin : la flèche en haut à droite déplie / replie la grille des
  // terrains et le bandeau de gestion (repliés par défaut = carte compacte et plus légère). Simple état
  // d'affichage LOCAL (aucune écriture Firestore) : sans effet sur ce que
  // voient les joueurs. Le bandeau des 5 boutons est dans ce volet dépliant
  // (le laisser toujours visible chargeait trop l'écran — retour de Max).
  const [prepExpanded, setPrepExpanded] = useState(false);
  const first = sessionMatches[0];
  const published = isCompositionPublished(sessionMatches);
  // Le coach prépare seulement les sessions pas encore terminées (les
  // présences d'un match passé restent réservées à l'admin).
  const canPrepare =
    perms.manageSession &&
    (perms.editPastPresences || getMatchTiming(first, now) !== "finished");
  const showCourts = !canPrepare || prepExpanded;
  return (
    <Card className="p-4 pm-rise">
      <div className={cn("flex items-baseline justify-between gap-2", showCourts ? "mb-3" : "mb-2")}>
        <div className="flex items-baseline gap-2 flex-wrap min-w-0">
          <p className="pm-display font-bold text-base">
            {formatDateFR(first.date)} · {formatTimeFR(first.time)}
          </p>
          {published && !canPrepare && (
            <span className="text-[11px] font-semibold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full shrink-0">
              Suggestion de feuille de match
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge tone="neutral" className="!text-[10px] shrink-0">
            {sessionMatches.length} terrain{sessionMatches.length > 1 ? "s" : ""}
          </Badge>
          {canPrepare && (
            <button
              type="button"
              onClick={() => setPrepExpanded((v) => !v)}
              aria-label={prepExpanded ? "Replier la préparation" : "Déplier la préparation"}
              title={prepExpanded ? "Replier la préparation" : "Déplier la préparation"}
              className="p-1.5 rounded-full bg-white border border-[var(--color-border)] text-[var(--color-text-dim)] hover:border-sky-300 hover:text-sky-700 active:scale-95 transition-all"
            >
              <Icon.Chevron
                className={cn("w-3.5 h-3.5 transition-transform", prepExpanded && "rotate-90")}
              />
            </button>
          )}
        </div>
      </div>

      {canPrepare && prepExpanded && <AdminSessionBar sessionMatches={sessionMatches} />}

      {showCourts && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessionMatches.map((m) => (
            <CourtPanel key={m.id} match={m} now={now} />
          ))}
        </div>
      )}

      <div className={cn(showCourts && "mt-4 pt-4 border-t border-[var(--color-border)]")}>
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
          Votre présence
        </p>
        <AvailabilityButtons sessionMatches={sessionMatches} />
      </div>
    </Card>
  );
}

// Carte simplifiée pour "Prochains matchs" / "Reste de la saison" (joueurs
// non-admin) — un match aussi lointain n'affiche pas encore la composition
// détaillée : juste la date, le(s) lieu(x) et la présence.
//
// Dans la partie "Reste de la saison" (restOfSeason = true), les joueurs n'ont
// accès qu'aux boutons de présence et à leurs totaux : on n'affiche alors que
// le(s) nom(s) de club (sans numéro de terrain), placé(s) directement après
// l'heure, dans la même police que la date/heure.
//
// Une fois le match terminé (onglet "Terminés" de "Reste de la saison") :
// - si le joueur connecté y a participé, le score s'affiche directement
//   (même présentation que le bloc "Dernier match joué", en plus petit) ;
// - sinon, seules la date/heure/le(s) club(s) restent affichées (plus de
//   boutons de présence, le match ayant déjà commencé) — un clic dessus
//   ouvre une petite fenêtre montrant, elle aussi, le score.
export function AvailabilitySessionCard({ sessionMatches, restOfSeason = false, now }) {
  const { connectedPlayer } = useAppData();
  const [showResult, setShowResult] = useState(false);
  const first = sessionMatches[0];

  if (restOfSeason) {
    const clubs = [
      ...new Set(sessionMatches.map((m) => clubNameOnly(m.location)).filter(Boolean)),
    ];
    const dateLine = (
      <p className="pm-display font-bold text-base">
        {formatDateFR(first.date)} · {formatTimeFR(first.time)}
        {clubs.length > 0 && <> · {clubs.join(" · ")}</>}
      </p>
    );
    const isFinished = getMatchTiming(first, now) === "finished";
    const participated = sessionMatches.some((m) =>
      (m.participants || []).some((p) => p.playerId === connectedPlayer?.id)
    );

    if (isFinished && participated) {
      return (
        <Card className="p-4 pm-rise">
          <div className="mb-2.5">{dateLine}</div>
          <MatchResultBlock sessionMatches={sessionMatches} compact />
        </Card>
      );
    }

    if (isFinished) {
      return (
        <>
          <Card className="p-4 pm-rise">
            <button
              type="button"
              onClick={() => setShowResult(true)}
              className="w-full text-left"
            >
              <p className="pm-display font-bold text-base underline decoration-dotted decoration-2 underline-offset-2 decoration-[var(--color-text-faint)]">
                {formatDateFR(first.date)} · {formatTimeFR(first.time)}
                {clubs.length > 0 && <> · {clubs.join(" · ")}</>}
              </p>
              <p className="text-[11px] text-[var(--color-text-faint)] mt-1">
                Match terminé · touchez pour voir le score
              </p>
            </button>
          </Card>
          {showResult && (
            <Modal title="Résultat du match" onClose={() => setShowResult(false)}>
              <MatchResultBlock sessionMatches={sessionMatches} compact />
            </Modal>
          )}
        </>
      );
    }

    return (
      <Card className="p-4 pm-rise">
        <div className="mb-3">{dateLine}</div>
        <AvailabilityButtons sessionMatches={sessionMatches} />
      </Card>
    );
  }

  const locations = [...new Set(sessionMatches.map((m) => m.location).filter(Boolean))];

  return (
    <Card className="p-4 pm-rise">
      <div className="mb-3">
        <p className="pm-display font-bold text-base">
          {formatDateFR(first.date)} · {formatTimeFR(first.time)}
        </p>
        <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
          {locations.length > 0 ? locations.join(" · ") : "Lieu à confirmer"}
        </p>
      </div>
      <AvailabilityButtons sessionMatches={sessionMatches} />
    </Card>
  );
}

// Score affiché « en colonnes » (ajout du 04/10/2026) : un set par colonne, le
// score de l'équipe du haut au-dessus de celui de l'équipe du bas — chaque
// ligne s'aligne ainsi sur le nom de son équipe, comme dans l'encodage du
// score. Même taille de texte et même hauteur de ligne que les deux lignes de
// noms : le bloc ne prend donc pas plus de hauteur qu'avant (et moins de
// largeur). Le vainqueur de chaque set est en gras.
function StackedScore({ scores, compact = false }) {
  const sets = ["set1", "set2", "set3"]
    .map((k) => getSetDisplay(scores?.[k]))
    .filter(Boolean)
    .map((txt) => {
      const [a, b] = String(txt).split("-").map((v) => v.trim());
      return { a, b, aWon: Number(a) > Number(b), bWon: Number(b) > Number(a) };
    });
  const size = compact ? "text-xs" : "text-sm";
  const cell = (won) =>
    cn(
      "pm-mono text-center min-w-[1.1rem]",
      size,
      won ? "font-bold text-amber-900" : "font-medium text-[var(--color-text-dim)]"
    );
  return (
    <div className="flex gap-2">
      {sets.map((st, i) => (
        <div key={i} className="flex flex-col">
          <span className={cell(st.aWon)}>{st.a}</span>
          <span className={cell(st.bWon)}>{st.b}</span>
        </div>
      ))}
    </div>
  );
}

// Résultat compact d'un terrain — juste les noms et le score, pour la carte
// "Dernier match joué" (purement informative, pas besoin des détails), et,
// en version "compact" (encore plus petite), pour les matchs terminés de
// "Reste de la saison".
// `roundLabel` : étiquette « Manche 1 » affichée au-dessus des équipes, seulement
// quand la session compte au moins une manche supplémentaire (voir
// MatchResultBlock).
// `canEditScore` : true pour un joueur de la session (non-admin) dans le bloc
// « Dernier résultat » — affiche la même roulette ⚙️ que l'admin, limitée à « Modifier le score du match ».
export function CompactMatchResult({
  match,
  compact = false,
  roundLabel = null,
  canEditScore = false,
}) {
  const { perms, players } = useAppData();
  const [showMenu, setShowMenu] = useState(false);
  const [showDateTime, setShowDateTime] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [showComposition, setShowComposition] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const teamA = (match.participants || []).filter((p) => p.team === "A");
  const teamB = (match.participants || []).filter((p) => p.team === "B");
  const untracked = (match.participants || []).filter((p) => p.team !== "A" && p.team !== "B");
  // Nom affiché : celui de la fiche joueur actuelle, pas l'instantané figé
  // dans participant.name au moment de l'assignation (sinon un renommage
  // depuis l'onglet Équipe n'apparaît pas sur ces cartes de résultat).
  const nameOf = (p) => players.find((pl) => pl.id === p.playerId)?.name || p.name;
  const labelOf = (list) =>
    list.length ? list.map((p) => getFirstName(nameOf(p))).join(" & ") : "—";
  const teamALabel = labelOf(teamA.length ? teamA : untracked.slice(0, 2));
  const teamBLabel = labelOf(teamB.length ? teamB : untracked.slice(2, 4));

  const scoreEntered = hasMatchScore(match);
  const aWon = match.winningTeam === "A";
  const bWon = match.winningTeam === "B";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-amber-200/70 last:border-b-0",
        compact ? "py-1.5" : "py-2.5"
      )}
    >
      <div className="min-w-0 flex-1">
        {roundLabel && (
          <p className="text-[9px] font-bold uppercase tracking-wide text-amber-600 mb-0.5">
            {roundLabel}
          </p>
        )}
        <p
          className={cn(
            "truncate",
            compact ? "text-xs" : "text-sm",
            aWon ? "font-bold text-amber-900" : "font-medium text-[var(--color-text-dim)]"
          )}
        >
          {aWon && "🏆 "}
          {teamALabel}
        </p>
        <p
          className={cn(
            "truncate",
            compact ? "text-xs" : "text-sm",
            bWon ? "font-bold text-amber-900" : "font-medium text-[var(--color-text-dim)]"
          )}
        >
          {bWon && "🏆 "}
          {teamBLabel}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {scoreEntered ? (
          <StackedScore scores={match.scores} compact={compact} />
        ) : (
          <span className="text-xs text-[var(--color-text-faint)] italic">Sans score</span>
        )}
        {(canEditExistingScore(perms, match) || (canEditScore && !scoreEntered)) && (
          <button
            type="button"
            onClick={() => setShowMenu(true)}
            aria-label="Paramètres du terrain"
            className="p-1.5 rounded-full bg-white border border-amber-200 text-amber-700 hover:border-amber-400 shrink-0"
          >
            <Icon.Settings className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showMenu && (
        <CourtSettingsMenu
          scoreOnly={!perms.editMatchSettings}
          canDelete={perms.deleteMatch}
          onClose={() => setShowMenu(false)}
          onPickDateTime={() => {
            setShowMenu(false);
            setShowDateTime(true);
          }}
          onPickScore={() => {
            setShowMenu(false);
            setShowEnd(true);
          }}
          onPickComposition={() => {
            setShowMenu(false);
            setShowComposition(true);
          }}
          onPickDelete={() => {
            setShowMenu(false);
            setShowDeleteConfirm(true);
          }}
        />
      )}
      {showDateTime && (
        <EditMatchDateTimeModal match={match} onClose={() => setShowDateTime(false)} />
      )}
      {showEnd && <EndMatchModal match={match} onClose={() => setShowEnd(false)} />}
      {showComposition && (
        <ReplacePlayerModal match={match} onClose={() => setShowComposition(false)} />
      )}
      {showDeleteConfirm && (
        <DeleteMatchConfirmModal match={match} onClose={() => setShowDeleteConfirm(false)} />
      )}
    </div>
  );
}

// Une manche supplémentaire (voir lib/rounds.js) dans le bloc de résultat : même
// présentation qu'un résultat de terrain, avec l'étiquette « Manche N » (le match
// de base est la manche 1). Pour l'admin, la roulette ⚙️ permet de modifier ou
// de supprimer la manche en cas d'erreur.
function RoundResultRow({
  match,
  sessionMatches,
  roundIndex,
  compact = false,
  canEditScore = false,
}) {
  const { perms, players, matches } = useAppData();
  const [showMenu, setShowMenu] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const round = expandRounds([match])[roundIndex];
  if (!round) return null;

  const nameOf = (p) => players.find((pl) => pl.id === p.playerId)?.name || p.name;
  const labelOf = (team) => {
    const list = (round.participants || []).filter((p) => p.team === team);
    return list.length ? list.map((p) => getFirstName(nameOf(p))).join(" & ") : "—";
  };
  const scoreEntered = hasMatchScore(round);
  const aWon = round.winningTeam === "A";
  const bWon = round.winningTeam === "B";

  const remove = async () => {
    setBusy(true);
    try {
      await deleteRoundAndRanking({ match, roundIndex, players, matches });
      setShowDelete(false);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-amber-200/70 last:border-b-0",
        compact ? "py-1.5" : "py-2.5"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-bold uppercase tracking-wide text-amber-600 mb-0.5">
          Manche supplémentaire
        </p>
        <p
          className={cn(
            "truncate",
            compact ? "text-xs" : "text-sm",
            aWon ? "font-bold text-amber-900" : "font-medium text-[var(--color-text-dim)]"
          )}
        >
          {aWon && "🏆 "}
          {labelOf("A")}
        </p>
        <p
          className={cn(
            "truncate",
            compact ? "text-xs" : "text-sm",
            bWon ? "font-bold text-amber-900" : "font-medium text-[var(--color-text-dim)]"
          )}
        >
          {bWon && "🏆 "}
          {labelOf("B")}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {scoreEntered ? (
          <StackedScore scores={round.scores} compact={compact} />
        ) : (
          <span className="text-xs text-[var(--color-text-faint)] italic">Sans score</span>
        )}
        {(canEditExistingScore(perms, match) || (canEditScore && !scoreEntered)) && (
          <button
            type="button"
            onClick={() => setShowMenu(true)}
            aria-label="Paramètres de la manche"
            className="p-1.5 rounded-full bg-white border border-amber-200 text-amber-700 hover:border-amber-400 shrink-0"
          >
            <Icon.Settings className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showMenu && (
        <Modal title={"Paramètres de la manche supplémentaire"} onClose={() => setShowMenu(false)}>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setShowMenu(false);
                setShowEdit(true);
              }}
              className="p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] hover:border-sky-300 text-left text-sm font-medium"
            >
              {perms.composeCourts ? "Modifier la composition ou le score" : "Encoder le score de la manche"}
            </button>
            {perms.deleteRounds && (
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  setShowDelete(true);
                }}
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-left text-sm font-medium text-rose-700"
              >
                Supprimer cette manche
              </button>
            )}
          </div>
        </Modal>
      )}
      {showEdit && (
        <RoundModal
          match={match}
          sessionMatches={sessionMatches}
          roundIndex={roundIndex}
          scoreOnly={!perms.composeCourts}
          onClose={() => setShowEdit(false)}
        />
      )}
      {showDelete && (
        <Modal title="Supprimer cette manche ?" onClose={() => setShowDelete(false)}>
          <p className="text-sm text-[var(--color-text-dim)] mb-4">
            Cette manche supplémentaire sera supprimée et son effet sur le niveau des joueurs sera
            annulé. La composition de base du match et la comptabilité ne sont pas touchées.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowDelete(false)}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-sm font-semibold"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Suppression..." : "Supprimer"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Bloc "score" réutilisable — accent doré, une ligne de titre + la date +
// le(s) résultat(s) compact(s). Utilisé en taille normale pour la carte
// "Dernier match joué", et en taille réduite (compact = true) pour les
// matchs terminés de "Reste de la saison" (affichage direct ou dans la
// petite fenêtre de résultat).
// `allowScoreEdit` : uniquement pour « Dernier résultat » (LastMatchCard) — les
// joueurs de la session peuvent alors ENCODER un score manquant (roulette ⚙️) ; modifier un score existant reste réservé à l'admin.
export function MatchResultBlock({
  sessionMatches,
  compact = false,
  label = "Résultat",
  allowScoreEdit = false,
  // Ajout du 04/10/2026 : si `collapsible` est vrai, un petit bouton (chevron)
  // permet de replier / déplier la liste des manches (le bandeau devenait très
  // long quand il y a beaucoup de manches). `defaultOpen` fixe l'état au
  // premier affichage. L'état choisi par le joueur n'est PAS sauvegardé
  // (aucune écriture Firebase) : il repart de `defaultOpen` à chaque visite.
  collapsible = false,
  defaultOpen = true,
}) {
  const { perms, connectedPlayer } = useAppData();
  const [showAddRound, setShowAddRound] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const showBody = !collapsible || open;
  const first = sessionMatches[0];
  // Ajout d'une manche (bouton « + » rond en haut à droite, un seul par bloc,
  // toujours visible) : ouvert à tous les joueurs de la session (ayant joué sur
  // l'un des terrains) et à l'admin ; la fenêtre propose tous les terrains de
  // la session.
  const canAddRound =
    perms.addRoundAnySession ||
    sessionMatches.some((m) =>
      (m.participants || []).some((p) => p.playerId === connectedPlayer?.id)
    );
  const addRoundCourts = canAddRound ? sessionMatches : [];
  const canEditScore = allowScoreEdit && canAddRound;
  // Nombre de manches de la session = le plus grand nombre de manches d'un terrain
  // (le match de base compte pour la manche 1).
  const totalRounds = 1 + Math.max(0, ...sessionMatches.map((m) => getRounds(m).length));
  return (
    <div
      className={cn(
        "rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-white",
        compact ? "p-3" : "shadow-sm p-4"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon.Trophy className={cn("text-amber-600 shrink-0", compact ? "w-3.5 h-3.5" : "w-4 h-4")} />
        <p
          className={cn(
            "font-bold uppercase tracking-wide text-amber-700",
            compact ? "text-[10px]" : "text-xs"
          )}
        >
          {label}
        </p>
        {addRoundCourts.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAddRound(true)}
            aria-label="Ajouter une manche"
            title="Ajouter une manche"
            className={cn(
              "ml-auto shrink-0 rounded-full border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 active:scale-95 transition-all flex items-center justify-center",
              compact ? "w-6 h-6" : "w-8 h-8"
            )}
          >
            <Icon.Plus className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          </button>
        )}
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Replier les résultats" : "Déplier les résultats"}
            title={open ? "Replier" : "Déplier"}
            className={cn(
              "shrink-0 rounded-full border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 active:scale-95 transition-all flex items-center justify-center w-8 h-8",
              addRoundCourts.length === 0 && "ml-auto"
            )}
          >
            <Icon.Chevron className={cn("w-4 h-4 transition-transform", open ? "-rotate-90" : "rotate-90")} />
          </button>
        )}
      </div>
      <p className={cn("font-semibold text-amber-900", compact ? "text-xs" : "text-sm", showBody && "mb-1")}>
        {formatDateFR(first.date)}
      </p>
      {showBody && (
      <div className="flex flex-col">
        {/* Ordre d'affichage : toutes les manches 1 (un résultat par terrain)
            d'abord, puis toutes les manches 2, etc., quel que soit le terrain.
            « Manche principale » n'est affiché que si la session a au moins 2 manches. */}
        {Array.from({ length: totalRounds }, (_, r) =>
          sessionMatches.map((m) => {
            if (r === 0) {
              return (
                <CompactMatchResult
                  key={m.id}
                  match={m}
                  compact={compact}
                  roundLabel={totalRounds > 1 ? "Manche principale" : null}
                  canEditScore={canEditScore}
                />
              );
            }
            if (!getRounds(m)[r - 1]) return null;
            return (
              <RoundResultRow
                key={`${m.id}#r${r}`}
                match={m}
                sessionMatches={sessionMatches}
                roundIndex={r}
                compact={compact}
                canEditScore={canEditScore}
              />
            );
          })
        )}
      </div>
      )}
      {showAddRound && (
        <RoundModal
          courtChoices={addRoundCourts}
          sessionMatches={sessionMatches}
          onClose={() => setShowAddRound(false)}
        />
      )}
    </div>
  );
}

// Carte "Dernier match joué" — mise en évidence visuellement (accent doré),
// et volontairement simplifiée : juste la date, les noms et le score.
//
// Ajout du 04/10/2026 : bandeau repliable. Déplié par défaut pendant les 24 h
// qui suivent le DÉBUT de la session (heure de début du 1er terrain), replié
// ensuite — le joueur peut toujours le déplier / replier d'un clic.
// (Passé de 48 h à 24 h le 10/10/2026.)
const LAST_RESULT_OPEN_HOURS = 24;
export function LastMatchCard({ sessionMatches }) {
  const now = useNow();
  const sessionStart = Math.min(...sessionMatches.map((m) => getMatchStart(m).getTime()));
  const [defaultOpen] = useState(
    () => now.getTime() - sessionStart < LAST_RESULT_OPEN_HOURS * 3600 * 1000
  );
  return (
    <MatchResultBlock
      sessionMatches={sessionMatches}
      label="Dernier résultat"
      allowScoreEdit
      collapsible
      defaultOpen={defaultOpen}
    />
  );
}
