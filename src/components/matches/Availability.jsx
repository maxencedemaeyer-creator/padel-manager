// ─────────────────────────────────────────────────────────────────────────
// Présences pour les matchs "Reste de la saison" : les 3 boutons Présent /
// Absent / Je ne sais pas encore, remplacés une fois qu'on a répondu par un
// rectangle plein (angles droits, couleur pleine, sans contour) affichant
// clairement la réponse du joueur — cliquable pour rouvrir une petite
// fenêtre de changement de réponse — accompagné de 3 mini-compteurs (pastille
// de couleur + chiffre) poussés à droite, avec pop-up listant les joueurs
// par statut. Côté admin : le panneau "qui a répondu" à côté de la date,
// avec sélection rapide pour placer un joueur sur le terrain sans repasser
// par la recherche, ainsi qu'une modale "Gérer les présences" permettant à
// l'admin de modifier sa propre présence ou celle de n'importe quel autre
// joueur (même s'il n'a pas encore répondu), avec possibilité de
// réinitialiser une réponse.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { cn, getFirstName } from "../../lib/utils";
import {
  AVAILABILITY_STATUSES,
  getAvailabilityGroups,
  setSessionAvailability,
  resetSessionAvailability,
} from "../../lib/availability";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal } from "../ui";

const STATUS_META = {
  present: { label: "Présent", dot: "bg-emerald-500" },
  absent: { label: "Absent", dot: "bg-rose-500" },
  unknown: { label: "Je ne sais pas encore", dot: "bg-amber-500" },
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
  const { players, connectedPlayer } = useAppData();
  const [saving, setSaving] = useState(false);
  const [openList, setOpenList] = useState(null); // "present" | "absent" | "pending" | null
  const [showChangeModal, setShowChangeModal] = useState(false);

  const { availability, present, absent, pending } = getAvailabilityGroups(
    sessionMatches,
    players
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

// Panneau admin "qui a répondu" — chips cliquables triées présents / en
// attente / absents. On en sélectionne un, puis on touche une place sur le
// terrain pour l'y placer (voir CourtPanel : quickAssignPlayer).
export function RespondedPlayersPanel({ sessionMatches, selectedPlayerId, onSelectPlayer }) {
  const { players } = useAppData();
  const { responded } = getAvailabilityGroups(sessionMatches, players);

  if (responded.length === 0) {
    return (
      <p className="text-xs text-[var(--color-text-faint)] italic mb-3">
        Aucune réponse de présence pour l'instant.
      </p>
    );
  }

  const order = { present: 0, unknown: 1, absent: 2 };
  const sorted = [...responded].sort(
    (a, b) => order[a.status] - order[b.status] || a.player.name.localeCompare(b.player.name)
  );

  return (
    <div className="mb-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
        Réponses des joueurs
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map(({ player, status }) => {
          const selected = selectedPlayerId === player.id;
          return (
            <button
              key={player.id}
              type="button"
              onClick={() => onSelectPlayer(selected ? null : player)}
              className={cn(
                "flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border text-xs font-medium transition-all",
                selected
                  ? "bg-sky-200 border-sky-400 text-sky-900"
                  : "bg-[var(--color-surface-2)] border-[var(--color-border)] hover:border-sky-300"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full shrink-0", STATUS_META[status]?.dot)} />
              {getFirstName(player.name)}
            </button>
          );
        })}
      </div>
      {selectedPlayerId && (
        <p className="text-[11px] text-sky-700 font-semibold mt-1.5">
          Touchez une place sur le terrain pour l'y placer.
        </p>
      )}
    </div>
  );
}

// Modale admin "Gérer les présences" — TOUS les joueurs du club pour cette
// session (qu'ils aient déjà répondu ou non), chacun avec ses 3 boutons
// Présent / Absent / Je ne sais pas encore, plus un 4e bouton pour
// réinitialiser sa réponse. Permet à l'administrateur de modifier sa propre
// présence ou celle de n'importe quel autre joueur.
export function ManagePresenceModal({ sessionMatches, onClose }) {
  const { players } = useAppData();
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState(null);

  const { availability } = getAvailabilityGroups(sessionMatches, players);

  const filteredPlayers = [...players]
    .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const setStatus = async (playerId, status) => {
    setSavingId(playerId);
    try {
      await setSessionAvailability(sessionMatches, playerId, status);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSavingId(null);
    }
  };

  // Réinitialise la réponse d'un joueur — il redevient "en attente" et devra
  // rechoisir lui-même (utile si un joueur s'est trompé de bouton).
  const resetStatus = async (playerId) => {
    setSavingId(playerId);
    try {
      await resetSessionAvailability(sessionMatches, playerId);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSavingId(null);
    }
  };

  const statusIcon = {
    present: Icon.Check,
    absent: Icon.X,
    unknown: Icon.Question,
  };
  const statusActiveClass = {
    present: "bg-emerald-500 border-emerald-500 text-white",
    absent: "bg-rose-500 border-rose-500 text-white",
    unknown: "bg-amber-500 border-amber-500 text-white",
  };

  return (
    <Modal title="Gérer les présences" onClose={onClose}>
      <p className="text-xs text-[var(--color-text-dim)] mb-3">
        Modifiez la présence de n'importe quel joueur pour cette date — y compris la vôtre.
      </p>

      <input
        className="w-full mb-3 px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] text-sm outline-none focus:border-sky-300"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un joueur..."
        autoFocus
      />

      <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pm-scroll-visible pr-1">
        {filteredPlayers.length === 0 ? (
          <p className="text-xs text-[var(--color-text-faint)] italic py-2">
            Aucun joueur ne correspond à cette recherche.
          </p>
        ) : (
          filteredPlayers.map((p) => {
            const status = availability[p.id];
            const busy = savingId === p.id;
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 p-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]"
              >
                <span className="flex-1 min-w-0 truncate text-sm font-medium">
                  {p.emoji} {p.name}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {AVAILABILITY_STATUSES.map((s) => {
                    const StatusIcon = statusIcon[s];
                    const active = status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={busy}
                        onClick={() => setStatus(p.id, s)}
                        aria-label={STATUS_META[s].label}
                        title={STATUS_META[s].label}
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center border transition-all disabled:opacity-40",
                          active
                            ? statusActiveClass[s]
                            : "bg-white border-[var(--color-border)] text-[var(--color-text-faint)] hover:border-sky-300"
                        )}
                      >
                        <StatusIcon className="w-3.5 h-3.5" />
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    disabled={busy || !status}
                    onClick={() => resetStatus(p.id)}
                    aria-label="Réinitialiser sa réponse"
                    title="Réinitialiser — il devra rechoisir lui-même"
                    className="w-8 h-8 ml-1 rounded-full flex items-center justify-center border border-[var(--color-border)] bg-white text-[var(--color-text-faint)] hover:border-slate-400 hover:text-slate-600 disabled:opacity-30 transition-all"
                  >
                    <Icon.Refresh className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
