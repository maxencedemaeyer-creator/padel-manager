// ─────────────────────────────────────────────────────────────────────────
// Présences pour les matchs "Reste de la saison" : les 3 boutons Présent /
// Absent / Je ne sais pas encore, remplacés une fois qu'on a répondu par un
// rectangle plein (angles droits, couleur pleine, sans contour) affichant
// clairement la réponse du joueur — cliquable pour rouvrir une petite
// fenêtre de changement de réponse — accompagné de 3 mini-compteurs (pastille
// de couleur + chiffre) poussés à droite, avec pop-up listant les joueurs
// par statut. Côté admin : le panneau "qui a répondu" à côté de la date
// (aperçu, non cliquable), ainsi qu'une modale "Gérer les présences"
// permettant à l'admin de modifier sa propre présence ou celle de n'importe
// quel autre joueur (même s'il n'a pas encore répondu), avec possibilité de
// réinitialiser une réponse.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { cn, getFirstName } from "../../lib/utils";
import {
  AVAILABILITY_STATUSES,
  getAvailabilityGroups,
  setSessionAvailability,
  resetSessionAvailability,
  autoPlacePresentPlayer,
} from "../../lib/availability";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal } from "../ui";

const STATUS_META = {
  present: { label: "Présent", dot: "bg-emerald-500" },
  absent: { label: "Absent", dot: "bg-rose-500" },
  unknown: { label: "Je ne sais pas encore", dot: "bg-amber-500" },
};

// En-têtes de colonne teintés (fond + texte + icône) utilisés dans le
// mini-tableau "Réponses des joueurs" — une colonne par statut, très
// compacte, plus lisible qu'un simple point de couleur.
const STATUS_COLUMN_CLASS = {
  present: "bg-emerald-50 text-emerald-800",
  absent: "bg-rose-50 text-rose-700",
  unknown: "bg-amber-50 text-amber-800",
};
const STATUS_PILL_ICON = {
  present: Icon.Check,
  absent: Icon.X,
  unknown: Icon.Question,
};

// Couleurs pleines (non pastel) utilisées pour le rectangle "ma réponse" —
// mêmes teintes -500 que les états actifs de ManagePresenceModal, pour
// rester cohérent avec le reste de l'app.
const STATUS_SOLID_CLASS = {
  present: "bg-emerald-500 text-white",
  absent: "bg-rose-500 text-white",
  unknown: "bg-amber-500 text-white",
};

function PlayerListModal({ title, players, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      {players.length === 0 ? (
        <p className="text-sm text-[var(--color-text-faint)] italic py-2">
          Personne pour l'instant.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {players.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[var(--color-surface-2)] text-sm font-medium"
            >
              <span>{p.emoji}</span>
              <span className="truncate">{p.name}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// Petite fenêtre ouverte en cliquant sur le rectangle "ma réponse" — permet
// de choisir directement un nouveau statut (Présent/Absent/Je ne sais pas)
// sans repasser par un état "non répondu" intermédiaire.
function ChangeMyResponseModal({ myStatus, saving, onChoose, onClose }) {
  const statusIcon = {
    present: Icon.Check,
    absent: Icon.X,
    unknown: Icon.Question,
  };

  return (
    <Modal title="Modifier ma présence" onClose={onClose}>
      <p className="text-xs text-[var(--color-text-dim)] mb-3">
        Réponse actuelle : <strong>{STATUS_META[myStatus]?.label || myStatus}</strong>
      </p>
      <div className="grid grid-cols-3 gap-2">
        {AVAILABILITY_STATUSES.map((s) => {
          const StatusIcon = statusIcon[s];
          const active = myStatus === s;
          return (
            <button
              key={s}
              type="button"
              disabled={saving}
              onClick={() => onChoose(s)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-3 rounded-xl border transition-all disabled:opacity-50",
                active
                  ? cn(STATUS_SOLID_CLASS[s], "border-transparent")
                  : "bg-[var(--color-surface-2)] border-[var(--color-border)] hover:border-sky-300"
              )}
            >
              <StatusIcon className="w-4 h-4" />
              <span className="text-[11px] font-bold text-center leading-tight">
                {STATUS_META[s].label}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// Bouton/compteur RSVP pour le joueur connecté (admin ou non). Avant réponse :
// 3 boutons de choix. Après réponse : un rectangle plein affichant la
// réponse du joueur (cliquable → petite fenêtre de changement) + 3
// mini-compteurs cliquables ouvrant la liste des joueurs correspondants.
//
// Le changement de réponse écrit directement le nouveau statut dans
// Firestore via setSessionAvailability (et non plus un reset complet) : ça
// reste cohérent avec ManagePresenceModal, et — via setSessionAvailability —
// le joueur est aussi retiré de sa place sur le terrain s'il s'y était
// auto-inscrit lui-même (jamais une place attribuée par un admin, toujours
// conservée).
export function AvailabilityButtons({ sessionMatches }) {
  const { players, connectedPlayer, isAdmin, matches } = useAppData();
  const [saving, setSaving] = useState(false);
  const [openList, setOpenList] = useState(null); // "present" | "absent" | "pending" | null
  const [showChangeModal, setShowChangeModal] = useState(false);

  // Les comptes test (isTest) sont exclus des compteurs/listes Présent·Absent·
  // En attente pour tout le monde SAUF l'admin — même logique que l'écran de
  // connexion (AuthGate) et l'onglet Joueurs (PlayersView).
  const visiblePlayers = isAdmin ? players : players.filter((p) => !p.isTest);

  const { availability, present, absent, pending } = getAvailabilityGroups(
    sessionMatches,
    visiblePlayers
  );
  const myStatus = availability[connectedPlayer.id];
  const hasAnswered = Boolean(myStatus);
  const isSelfPlaced = (sessionMatches || []).some((m) =>
    (m.participants || []).some(
      (p) => p.playerId === connectedPlayer.id && p.selfJoined === true
    )
  );

  const respond = async (status) => {
    setSaving(true);
    try {
      await setSessionAvailability(sessionMatches, connectedPlayer.id, status);
      if (status === "present") {
        await autoPlacePresentPlayer(sessionMatches, matches, connectedPlayer);
      }
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const chooseNewStatus = async (status) => {
    if (status === myStatus) {
      setShowChangeModal(false);
      return;
    }
    if (
      status !== "present" &&
      isSelfPlaced &&
      !window.confirm(
        "Vous êtes actuellement placé sur le terrain — changer votre réponse vous en retirera. Continuer ?"
      )
    ) {
      return;
    }
    await respond(status);
    setShowChangeModal(false);
  };

  if (hasAnswered) {
    const myMeta = STATUS_META[myStatus];
    return (
      <div>
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => setShowChangeModal(true)}
            className={cn(
              "flex-1 flex items-center justify-center px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide active:scale-[0.98] transition-transform disabled:opacity-50",
              STATUS_SOLID_CLASS[myStatus]
            )}
          >
            {myMeta?.label || myStatus}
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setOpenList("present")}
              className="flex flex-col items-center justify-center gap-0 px-2 py-1.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 hover:bg-emerald-200 transition-colors"
            >
              <span className="text-[11px] font-extrabold pm-mono leading-none">
                {present.length}
              </span>
              <span className="text-[7px] font-semibold uppercase tracking-wide leading-none mt-0.5">
                Prés.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setOpenList("absent")}
              className="flex flex-col items-center justify-center gap-0 px-2 py-1.5 rounded-lg bg-rose-100 border border-rose-300 text-rose-700 hover:bg-rose-200 transition-colors"
            >
              <span className="text-[11px] font-extrabold pm-mono leading-none">
                {absent.length}
              </span>
              <span className="text-[7px] font-semibold uppercase tracking-wide leading-none mt-0.5">
                Abs.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setOpenList("pending")}
              className="flex flex-col items-center justify-center gap-0 px-2 py-1.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 transition-colors"
            >
              <span className="text-[11px] font-extrabold pm-mono leading-none">
                {pending.length}
              </span>
              <span className="text-[7px] font-semibold uppercase tracking-wide leading-none mt-0.5">
                Att.
              </span>
            </button>
          </div>
        </div>

        {openList && (
          <PlayerListModal
            title={
              openList === "present"
                ? "Joueurs présents"
                : openList === "absent"
                ? "Joueurs absents"
                : "En attente de réponse"
            }
            players={openList === "present" ? present : openList === "absent" ? absent : pending}
            onClose={() => setOpenList(null)}
          />
        )}

        {showChangeModal && (
          <ChangeMyResponseModal
            myStatus={myStatus}
            saving={saving}
            onChoose={chooseNewStatus}
            onClose={() => setShowChangeModal(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <button
        type="button"
        disabled={saving}
        onClick={() => respond("present")}
        className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 hover:bg-emerald-200 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        <Icon.Check className="w-4 h-4" />
        <span className="text-[11px] font-bold">Présent</span>
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => respond("absent")}
        className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-rose-100 border border-rose-300 text-rose-700 hover:bg-rose-200 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        <Icon.X className="w-4 h-4" />
        <span className="text-[11px] font-bold">Absent</span>
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => respond("unknown")}
        className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        <Icon.Question className="w-4 h-4" />
        <span className="text-[11px] font-bold text-center leading-tight">Je ne sais pas</span>
      </button>
    </div>
  );
}

// Panneau admin "qui a répondu" — mini-tableau (non cliquable) à 3 colonnes
// Présents / Incertains / Absents, chaque en-tête teinté avec sa petite
// icône de statut (✓ / ? / ✕), pour rester lisible d'un coup d'œil tout en
// restant très compact. Le nom d'un joueur déjà placé sur une place de
// terrain (voir CourtPanel → PickPlayerModal) est mis en gras, pour repérer
// immédiatement qui, parmi les présents, reste encore à placer. Le
// placement lui-même se fait uniquement en touchant une place.
const RESPONSE_COLUMNS = [
  { key: "present", label: "Présents" },
  { key: "unknown", label: "Incertains" },
  { key: "absent", label: "Absents" },
];

export function RespondedPlayersPanel({ sessionMatches }) {
  const { players } = useAppData();
  const { responded } = getAvailabilityGroups(sessionMatches, players);

  if (responded.length === 0) {
    return (
      <p className="text-xs text-[var(--color-text-faint)] italic mb-3">
        Aucune réponse de présence pour l'instant.
      </p>
    );
  }

  // Joueurs déjà assignés à une place sur l'un des terrains de la session
  // (peu importe le terrain ou l'équipe) — pour les distinguer en gras.
  const placedPlayerIds = new Set();
  (sessionMatches || []).forEach((m) => {
    (m.participants || []).forEach((p) => placedPlayerIds.add(p.playerId));
  });

  // Un tableau par colonne de statut, joueurs triés alphabétiquement dans
  // chacune.
  const byStatus = { present: [], unknown: [], absent: [] };
  responded
    .slice()
    .sort((a, b) => a.player.name.localeCompare(b.player.name))
    .forEach(({ player, status }) => {
      (byStatus[status] || byStatus.unknown).push(player);
    });

  return (
    <div className="mb-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
        Réponses des joueurs
      </p>
      <div className="rounded-xl border
