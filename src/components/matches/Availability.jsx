// ─────────────────────────────────────────────────────────────────────────
// Présences pour les matchs "Reste de la saison" : les 3 boutons Présent /
// Absent / Je ne sais pas encore (remplacés par leurs compteurs une fois
// qu'on a répondu, avec pop-up listant les joueurs par statut), et — côté
// admin — le panneau "qui a répondu" à côté de la date, avec sélection
// rapide pour placer un joueur sur le terrain sans repasser par la recherche.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { cn, getFirstName } from "../../lib/utils";
import { getAvailabilityGroups, setSessionAvailability } from "../../lib/availability";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal } from "../ui";

const STATUS_META = {
  present: { label: "Présent", dot: "bg-emerald-500" },
  absent: { label: "Absent", dot: "bg-rose-500" },
  unknown: { label: "Je ne sais pas encore", dot: "bg-amber-500" },
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

// Bouton/compteur RSVP pour un joueur non-admin. Avant réponse : 3 boutons
// de choix. Après réponse : 3 compteurs cliquables ouvrant la liste des
// joueurs correspondants, + un lien discret pour changer d'avis.
export function AvailabilityButtons({ sessionMatches }) {
  const { players, connectedPlayer } = useAppData();
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [openList, setOpenList] = useState(null); // "present" | "absent" | "pending" | null

  const { availability, present, absent, pending } = getAvailabilityGroups(
    sessionMatches,
    players
  );
  const myStatus = availability[connectedPlayer.id];
  const hasAnswered = Boolean(myStatus) && !editing;

  const respond = async (status) => {
    setSaving(true);
    try {
      await setSessionAvailability(sessionMatches, connectedPlayer.id, status);
      setEditing(false);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (hasAnswered) {
    return (
      <div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setOpenList("present")}
            className="flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 hover:bg-emerald-200 transition-colors"
          >
            <span className="text-base font-extrabold pm-mono">{present.length}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              Présent{present.length > 1 ? "s" : ""}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setOpenList("absent")}
            className="flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl bg-rose-100 border border-rose-300 text-rose-700 hover:bg-rose-200 transition-colors"
          >
            <span className="text-base font-extrabold pm-mono">{absent.length}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              Absent{absent.length > 1 ? "s" : ""}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setOpenList("pending")}
            className="flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 transition-colors"
          >
            <span className="text-base font-extrabold pm-mono">{pending.length}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide">En attente</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 text-[11px] font-semibold text-[var(--color-text-dim)] hover:text-sky-700 underline decoration-dotted"
        >
          Modifier ma réponse ({STATUS_META[myStatus]?.label || myStatus})
        </button>

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
