// ─────────────────────────────────────────────────────────────────────────
// Modale "Ajouter un score" : grille de sets par équipe, vainqueur déduit
// automatiquement, ou "pas de score" pour un match amical / équipes changées.
// ─────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { cn } from "../../lib/utils";
import { computeWinnerFromSets } from "../../lib/matchLogic";
import { useAppData } from "../../context/AppContext";
import { Modal, Button } from "../ui";

export function EndMatchModal({ match, onClose }) {
  const { players } = useAppData();

  const initSet = (set) => {
    if (set && typeof set === "object") return { a: set.a ?? "", b: set.b ?? "" };
    if (typeof set === "string" && set.includes("-")) {
      const [a, b] = set.split("-");
      return { a: (a || "").trim(), b: (b || "").trim() };
    }
    return { a: "", b: "" };
  };
  const [sets, setSets] = useState(() => ({
    set1: initSet(match.scores?.set1),
    set2: initSet(match.scores?.set2),
    set3: initSet(match.scores?.set3),
  }));
  const [saving, setSaving] = useState(false);

  const teamAParticipants = (match.participants || []).filter((p) => p.team === "A");
  const teamBParticipants = (match.participants || []).filter((p) => p.team === "B");
  const teamLabel = (list, fallback) =>
    list.length
      ? list
          .map((p) => players.find((pl) => pl.id === p.playerId)?.name || p.name)
          .join(" & ")
      : fallback;

  const updateSet = (key, side, value) => {
    const digits = value.replace(/\D/g, "").slice(0, 2);
    setSets((prev) => ({ ...prev, [key]: { ...prev[key], [side]: digits } }));
  };
  const isSuspicious = (v) => v !== "" && Number(v) > 7;
  const anySuspicious = ["set1", "set2", "set3"].some(
    (k) => isSuspicious(sets[k].a) || isSuspicious(sets[k].b)
  );

  // Un score saisi ici correspond toujours à un match officiel — les deux
  // boutons "Pas de score" ci-dessous couvrent déjà les autres cas.
  const submit = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "matches", match.id), {
        scores: sets,
        matchType: "Officiel",
        winningTeam: computeWinnerFromSets(sets),
        teamsUnreliable: false,
      });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Les deux cas "pas de score" enregistrent et referment immédiatement,
  // sans passer par le bouton principal.
  const noScore = async (teamsChanged) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "matches", match.id), {
        scores: { set1: null, set2: null, set3: null },
        matchType: "Amical",
        winningTeam: null,
        teamsUnreliable: teamsChanged,
      });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    { side: "a", label: teamLabel(teamAParticipants, "Équipe A"), tone: true },
    { side: "b", label: teamLabel(teamBParticipants, "Équipe B"), tone: false },
  ];

  return (
    <Modal
      title="Ajouter un score"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </>
      }
    >
      <p className="text-xs text-[var(--color-text-dim)] mb-4">
        Le vainqueur est déterminé automatiquement à partir des sets encodés
        ci-dessous.
      </p>

      <div className="grid grid-cols-[1fr_48px_48px_48px] gap-2 items-center mb-2">
        <span />
        {["Set 1", "Set 2", "Set 3"].map((label) => (
          <span
            key={label}
            className="text-center text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-faint)]"
          >
            {label}
          </span>
        ))}
      </div>

      {rows.map((row, i) => (
        <React.Fragment key={row.side}>
          <div className="grid grid-cols-[1fr_48px_48px_48px] gap-2 items-center mb-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold truncate pr-2">
              <span
                className={cn(
                  "w-2.5 h-2.5 rounded-full shrink-0",
                  row.tone ? "bg-emerald-400" : "bg-sky-400"
                )}
              />
              {row.label}
            </span>
            {["set1", "set2", "set3"].map((k) => (
              <input
                key={k}
                type="text"
                inputMode="numeric"
                value={sets[k][row.side]}
                onChange={(e) => updateSet(k, row.side, e.target.value)}
                className={cn(
                  "w-12 h-12 rounded-xl border text-center text-lg font-bold pm-mono focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-300",
                  row.tone
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-sky-200 bg-sky-50"
                )}
              />
            ))}
          </div>
          {i === 0 && <div className="h-px bg-[var(--color-border)] mb-2" />}
        </React.Fragment>
      ))}
      {anySuspicious && (
        <p className="text-[var(--color-danger)] text-[11px] font-semibold mb-2">
          ⚠️ Un score de set dépasse généralement 7 jeux — vérifiez la saisie.
        </p>
      )}

      <div className="flex flex-col gap-2 mt-3">
        <Button
          variant="secondary"
          className="w-full !text-xs"
          onClick={() => noScore(true)}
          disabled={saving}
        >
          Pas de score — Les équipes ont changé au cours du match
        </Button>
        <Button
          variant="secondary"
          className="w-full !text-xs"
          onClick={() => noScore(false)}
          disabled={saving}
        >
          Pas de score — Match amical
        </Button>
      </div>
    </Modal>
  );
}
