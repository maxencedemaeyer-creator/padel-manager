// ─────────────────────────────────────────────────────────────────────────
// Cartes de session : SessionCard (un ou plusieurs terrains, vue complète),
// et les variantes compactes utilisées pour "Dernier match joué".
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { cn, formatDateFR, formatTimeFR, clubNameOnly, getFirstName } from "../../lib/utils";
import { hasMatchScore, getSetDisplay, getMatchTiming } from "../../lib/matchLogic";
import { isCompositionPublished, setCompositionPublished } from "../../lib/composition";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Card, Badge, Modal } from "../ui";
import { CourtPanel } from "./CourtPanel";
import { EditMatchDateTimeModal, CourtSettingsMenu, DeleteMatchConfirmModal } from "./MatchSettingsModals";
import { EndMatchModal } from "./EndMatchModal";
import {
  AvailabilityButtons,
  RespondedPlayersPanel,
  ManagePresenceModal,
} from "./Availability";

// Bandeau admin permettant de publier/dépublier la composition d'une
// session (tous les terrains de la date à la fois) — tant qu'elle n'est pas
// publiée, les joueurs ne voient que leurs boutons de présence (voir
// MatchesView.jsx qui décide, pour les non-admins, d'afficher SessionCard ou
// AvailabilitySessionCard selon isCompositionPublished).
function PublishCompositionBar({ sessionMatches }) {
  const [busy, setBusy] = useState(false);
  const published = isCompositionPublished(sessionMatches);

  const toggle = async () => {
    setBusy(true);
    try {
      await setCompositionPublished(sessionMatches, !published);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 mb-3 p-2.5 rounded-xl border",
        published
          ? "border-emerald-300 bg-emerald-50"
          : "border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            published ? "bg-emerald-500" : "bg-amber-500"
          )}
        />
        <p className="text-[11px] font-semibold text-[var(--color-text-dim)] truncate">
          {published
            ? "Composition publiée — visible par les joueurs"
            : "Composition non publiée — visible par vous uniquement"}
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={toggle}
        className={cn(
          "shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all disabled:opacity-50 active:scale-[0.98]",
          published
            ? "bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100"
            : "bg-sky-200 text-sky-900 hover:bg-sky-300"
        )}
      >
        {published ? "Dépublier" : "Publier la composition"}
      </button>
    </div>
  );
}

export function SessionCard({ sessionMatches, now }) {
  const { isAdmin } = useAppData();
  // Admin : modale permettant de modifier la présence (la sienne ou celle
  // d'un autre joueur) sans passer par le placement sur le terrain.
  const [showManagePresence, setShowManagePresence] = useState(false);
  // Admin : le volet "préparation" (bandeau publier/dépublier, lien
  // "Modifier une présence", tableau des réponses de présence, ET la grille
  // des terrains/compositions elle-même) est replié par défaut — l'admin
  // voit alors exactement le même affichage qu'un joueur normal tant que la
  // composition n'a pas été publiée (uniquement sa propre présence). La
  // flèche en haut à droite de la carte permet de tout déplier pour
  // retrouver la vue complète actuelle (terrains compris). Ce repli est un
  // simple état d'affichage LOCAL à l'admin connecté (aucune écriture
  // Firestore) : il n'a aucun effet sur ce que voient les autres joueurs —
  // une fois la composition publiée (voir isCompositionPublished), elle
  // reste affichée d'office à tous les autres joueurs, quel que soit l'état
  // (replié/déplié) de la flèche admin. Replié par défaut = moins de
  // composants montés par carte, donc plus léger quand il y a beaucoup de
  // matchs à l'écran.
  const [prepExpanded, setPrepExpanded] = useState(false);
  const first = sessionMatches[0];
  // La composition n'étant affichée (via cette carte) qu'une fois publiée
  // pour les non-admins, ce badge est en pratique toujours visible des
  // joueurs qui voient SessionCard — mais on le conditionne quand même
  // explicitement pour qu'il disparaisse aussitôt côté admin en cas de
  // dépublication (SessionCard reste affichée à l'admin même non publiée).
  const published = isCompositionPublished(sessionMatches);
  return (
    <Card className="p-4 pm-rise">
      <div className="flex items-baseline justify-between mb-3 gap-2">
        <div className="flex items-baseline gap-2 flex-wrap min-w-0">
          <p className="pm-display font-bold text-base">
            {formatDateFR(first.date)} · {formatTimeFR(first.time)}
          </p>
          {published && (
            <span className="text-[11px] font-semibold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full shrink-0">
              Suggestion de feuille de match
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge tone="neutral" className="!text-[10px] shrink-0">
            {sessionMatches.length} terrain{sessionMatches.length > 1 ? "s" : ""}
          </Badge>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setPrepExpanded((v) => !v)}
              aria-label={
                prepExpanded
                  ? "Masquer les terrains, le tableau des présences et la publication de la composition"
                  : "Afficher les terrains, le tableau des présences et la publication de la composition"
              }
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

      {isAdmin && prepExpanded && (
        <>
          <PublishCompositionBar sessionMatches={sessionMatches} />

          <div className="flex items-center justify-end mb-1">
            <button
              type="button"
              onClick={() => setShowManagePresence(true)}
              className="text-[11px] font-semibold text-sky-700 hover:text-sky-900 underline decoration-dotted"
            >
              Modifier une présence
            </button>
          </div>

          <RespondedPlayersPanel sessionMatches={sessionMatches} />
        </>
      )}

      {(!isAdmin || prepExpanded) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessionMatches.map((m) => (
            <CourtPanel key={m.id} match={m} now={now} />
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
          Votre présence
        </p>
        <AvailabilityButtons sessionMatches={sessionMatches} />
      </div>

      {showManagePresence && (
        <ManagePresenceModal
          sessionMatches={sessionMatches}
          onClose={() => setShowManagePresence(false)}
        />
      )}
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

// Résultat compact d'un terrain — juste les noms et le score, pour la carte
// "Dernier match joué" (purement informative, pas besoin des détails), et,
// en version "compact" (encore plus petite), pour les matchs terminés de
// "Reste de la saison".
export function CompactMatchResult({ match, compact = false }) {
  const { isAdmin } = useAppData();
  const [showMenu, setShowMenu] = useState(false);
  const [showDateTime, setShowDateTime] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const teamA = (match.participants || []).filter((p) => p.team === "A");
  const teamB = (match.participants || []).filter((p) => p.team === "B");
  const untracked = (match.participants || []).filter((p) => p.team !== "A" && p.team !== "B");
  const labelOf = (list) =>
    list.length ? list.map((p) => getFirstName(p.name)).join(" & ") : "—";
  const teamALabel = labelOf(teamA.length ? teamA : untracked.slice(0, 2));
  const teamBLabel = labelOf(teamB.length ? teamB : untracked.slice(2, 4));

  const scoreEntered = hasMatchScore(match);
  const scoreText = ["set1", "set2", "set3"]
    .map((k) => getSetDisplay(match.scores?.[k]))
    .filter(Boolean)
    .join(" · ");
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
          <span
            className={cn(
              "pm-mono font-bold text-amber-900",
              compact ? "text-xs" : "text-sm"
            )}
          >
            {scoreText}
          </span>
        ) : (
          <span className="text-xs text-[var(--color-text-faint)] italic">Sans score</span>
        )}
        {isAdmin && (
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
          onClose={() => setShowMenu(false)}
          onPickDateTime={() => {
            setShowMenu(false);
            setShowDateTime(true);
          }}
          onPickScore={() => {
            setShowMenu(false);
            setShowEnd(true);
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
      {showDeleteConfirm && (
        <DeleteMatchConfirmModal match={match} onClose={() => setShowDeleteConfirm(false)} />
      )}
    </div>
  );
}

// Bloc "score" réutilisable — accent doré, une ligne de titre + la date +
// le(s) résultat(s) compact(s). Utilisé en taille normale pour la carte
// "Dernier match joué", et en taille réduite (compact = true) pour les
// matchs terminés de "Reste de la saison" (affichage direct ou dans la
// petite fenêtre de résultat).
export function MatchResultBlock({ sessionMatches, compact = false, label = "Résultat" }) {
  const first = sessionMatches[0];
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
      </div>
      <p className={cn("font-semibold text-amber-900 mb-1", compact ? "text-xs" : "text-sm")}>
        {formatDateFR(first.date)}
      </p>
      <div className="flex flex-col">
        {sessionMatches.map((m) => (
          <CompactMatchResult key={m.id} match={m} compact={compact} />
        ))}
      </div>
    </div>
  );
}

// Carte "Dernier match joué" — mise en évidence visuellement (accent doré),
// et volontairement simplifiée : juste la date, les noms et le score.
export function LastMatchCard({ sessionMatches }) {
  return <MatchResultBlock sessionMatches={sessionMatches} label="Dernier résultat" />;
}
