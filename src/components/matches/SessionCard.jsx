// ─────────────────────────────────────────────────────────────────────────
// Cartes de session : SessionCard (un ou plusieurs terrains, vue complète),
// et les variantes compactes utilisées pour "Dernier match joué".
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { cn, formatDateFR, getFirstName } from "../../lib/utils";
import { hasMatchScore, getSetDisplay } from "../../lib/matchLogic";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Card, Badge } from "../ui";
import { CourtPanel } from "./CourtPanel";
import { EditMatchDateTimeModal, CourtSettingsMenu, DeleteMatchConfirmModal } from "./MatchSettingsModals";
import { EndMatchModal } from "./EndMatchModal";
import {
  AvailabilityButtons,
  RespondedPlayersPanel,
  ManagePresenceModal,
} from "./Availability";

export function SessionCard({ sessionMatches, now }) {
  const { isAdmin } = useAppData();
  // Admin : joueur sélectionné dans le panneau "réponses" pour un placement
  // rapide sur le terrain (touche le joueur, puis touche une place vide).
  const [quickAssignPlayer, setQuickAssignPlayer] = useState(null);
  // Admin : modale permettant de modifier la présence (la sienne ou celle
  // d'un autre joueur) sans passer par le placement sur le terrain.
  const [showManagePresence, setShowManagePresence] = useState(false);
  const first = sessionMatches[0];
  return (
    <Card className="p-4 pm-rise">
      <div className="flex items-baseline justify-between mb-3">
        <p className="pm-display font-bold text-base">
          {formatDateFR(first.date)} · {first.time}
        </p>
        <Badge tone="neutral" className="!text-[10px]">
          {sessionMatches.length} terrain{sessionMatches.length > 1 ? "s" : ""}
        </Badge>
      </div>

      {isAdmin && (
        <div className="flex items-center justify-end mb-1">
          <button
            type="button"
            onClick={() => setShowManagePresence(true)}
            className="text-[11px] font-semibold text-sky-700 hover:text-sky-900 underline decoration-dotted"
          >
            Modifier une présence
          </button>
        </div>
      )}
      {isAdmin && (
        <RespondedPlayersPanel
          sessionMatches={sessionMatches}
          selectedPlayerId={quickAssignPlayer?.id || null}
          onSelectPlayer={setQuickAssignPlayer}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sessionMatches.map((m) => (
          <CourtPanel
            key={m.id}
            match={m}
            now={now}
            quickAssignPlayer={quickAssignPlayer}
            onQuickAssignDone={() => setQuickAssignPlayer(null)}
          />
        ))}
      </div>

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

// Carte simplifiée pour "Reste de la saison" (joueurs non-admin) — un match
// aussi lointain n'affiche pas encore la composition détaillée : juste la
// date, le(s) lieu(x) et la présence.
export function AvailabilitySessionCard({ sessionMatches }) {
  const first = sessionMatches[0];
  const locations = [...new Set(sessionMatches.map((m) => m.location).filter(Boolean))];

  return (
    <Card className="p-4 pm-rise">
      <div className="mb-3">
        <p className="pm-display font-bold text-base">
          {formatDateFR(first.date)} · {first.time}
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
// "Dernier match joué" (purement informative, pas besoin des détails).
export function CompactMatchResult({ match }) {
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
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-amber-200/70 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm truncate",
            aWon ? "font-bold text-amber-900" : "font-medium text-[var(--color-text-dim)]"
          )}
        >
          {aWon && "🏆 "}
          {teamALabel}
        </p>
        <p
          className={cn(
            "text-sm truncate",
            bWon ? "font-bold text-amber-900" : "font-medium text-[var(--color-text-dim)]"
          )}
        >
          {bWon && "🏆 "}
          {teamBLabel}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {scoreEntered ? (
          <span className="pm-mono text-sm font-bold text-amber-900">{scoreText}</span>
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

// Carte "Dernier match joué" — mise en évidence visuellement (accent doré),
// et volontairement simplifiée : juste la date, les noms et le score.
export function LastMatchCard({ sessionMatches }) {
  const first = sessionMatches[0];
  return (
    <div className="rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-white shadow-sm p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon.Trophy className="w-4 h-4 text-amber-600 shrink-0" />
        <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
          Dernier résultat
        </p>
      </div>
      <p className="text-sm font-semibold text-amber-900 mb-1">{formatDateFR(first.date)}</p>
      <div className="flex flex-col">
        {sessionMatches.map((m) => (
          <CompactMatchResult key={m.id} match={m} />
        ))}
      </div>
    </div>
  );
}
