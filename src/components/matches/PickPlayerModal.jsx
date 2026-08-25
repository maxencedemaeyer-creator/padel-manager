// ─────────────────────────────────────────────────────────────────────────
// Modale admin "assigner / remplacer un joueur" sur une place de terrain,
// avec recherche et détection des conflits (déjà engagé ce jour-là ailleurs).
// ─────────────────────────────────────────────────────────────────────────
import { useState, useMemo } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { cn, formatDateFR } from "../../lib/utils";
import { useAppData } from "../../context/AppContext";
import { Modal, Button, Badge, inputClass } from "../ui";

export function PickPlayerModal({ match, team, courtSide, currentParticipant, onClose }) {
  const { players, matches } = useAppData();
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Joueurs déjà engagés sur un AUTRE match le même jour (double terrain, etc.).
  const conflictByPlayerId = useMemo(() => {
    const map = new Map();
    matches.forEach((m) => {
      if (m.id === match.id || m.date !== match.date) return;
      (m.participants || []).forEach((p) => {
        if (!map.has(p.playerId)) map.set(p.playerId, m);
      });
    });
    return map;
  }, [matches, match.id, match.date]);

  // Joueurs déjà présents sur CE match, sur une autre place.
  const takenElsewhereIds = new Set(
    (match.participants || [])
      .filter((p) => p.playerId !== currentParticipant?.playerId)
      .map((p) => p.playerId)
  );

  const filteredPlayers = players.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  // Choisir un joueur assigne immédiatement cette place et referme la fenêtre —
  // pas de bouton "Valider" séparé, chaque emplacement se gère indépendamment.
  const pick = async (player) => {
    if (player.id === currentParticipant?.playerId) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const remaining = (match.participants || []).filter(
        (p) => p.playerId !== currentParticipant?.playerId && p.playerId !== player.id
      );
      const newParticipant = {
        playerId: player.id,
        name: player.name,
        paidStatus: "unpaid",
        creditorId: null,
        team,
        courtSide,
      };
      await updateDoc(doc(db, "matches", match.id), {
        participants: [...remaining, newParticipant],
      });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!currentParticipant) return;
    setSaving(true);
    try {
      const remaining = (match.participants || []).filter(
        (p) => p.playerId !== currentParticipant.playerId
      );
      await updateDoc(doc(db, "matches", match.id), { participants: remaining });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={currentParticipant ? "Remplacer ce joueur" : "Assigner un joueur"}
      onClose={onClose}
      footer={
        <>
          {currentParticipant && (
            <Button variant="danger" onClick={remove} disabled={saving}>
              Retirer
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
        </>
      }
    >
      <p className="text-xs text-[var(--color-text-dim)] mb-3">
        Choisissez un joueur pour cette place — {formatDateFR(match.date)}
        {match.time ? ` à ${match.time}` : ""}. La fenêtre se referme dès votre choix.
      </p>

      <input
        className={cn(inputClass, "mb-3")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un joueur..."
        autoFocus
      />

      <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pm-scroll-visible pr-1">
        {filteredPlayers.length === 0 ? (
          <p className="text-xs text-[var(--color-text-faint)] italic py-2">
            Aucun joueur ne correspond à cette recherche.
          </p>
        ) : (
          filteredPlayers.map((p) => {
            const isCurrent = p.id === currentParticipant?.playerId;
            const dayConflict = !isCurrent ? conflictByPlayerId.get(p.id) : null;
            const inThisMatch = !isCurrent && takenElsewhereIds.has(p.id);
            const disabled = saving || Boolean(dayConflict) || inThisMatch;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => pick(p)}
                className={cn(
                  "flex items-center gap-2.5 p-2.5 rounded-xl border text-left text-sm transition-colors",
                  isCurrent
                    ? "border-[var(--color-lime)]/60 bg-[var(--color-lime)]/10"
                    : disabled
                    ? "border-[var(--color-border)] bg-[var(--color-surface-2)]/50 opacity-50 cursor-not-allowed"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-sky-300"
                )}
              >
                <span className="flex-1 min-w-0 truncate">
                  {p.emoji} {p.name}
                </span>
                {isCurrent && (
                  <Badge tone="lime" className="!text-[10px] shrink-0">
                    Actuel
                  </Badge>
                )}
                {dayConflict && (
                  <span className="text-[10px] text-[var(--color-text-faint)] shrink-0 text-right">
                    Déjà sur {dayConflict.location || "un autre terrain"}
                    {dayConflict.time ? ` · ${dayConflict.time}` : ""}
                  </span>
                )}
                {!dayConflict && inThisMatch && (
                  <span className="text-[10px] text-[var(--color-text-faint)] shrink-0">
                    Déjà sur ce terrain
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}
