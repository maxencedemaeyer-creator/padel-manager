// ─────────────────────────────────────────────────────────────────────────
// Création d'un match ponctuel (hors saison, hors comptabilité).
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { todayISO } from "../../lib/utils";
import { Modal, Field, Button, inputClass } from "../ui";

export function CreateMatchModal({ onClose }) {
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("20:00");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = Boolean(date && time);

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "matches"), {
        date,
        time,
        location: location.trim(),
        type: "Ponctuel",
        matchFeePerPlayer: null,
        participants: [],
        scores: { set1: "", set2: "", set3: "" },
        status: "À venir",
        createdAt: serverTimestamp(),
      });
      onClose();
    } catch (error) {
      alert("Erreur de création : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Nouveau match ponctuel"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Création..." : "Créer le match"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Heure">
          <input
            type="time"
            className={inputClass}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Terrain / lieu (optionnel)">
        <input
          className={inputClass}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Ex. Terrain 2"
        />
      </Field>
      <p className="text-xs text-[var(--color-text-dim)]">
        Un match ponctuel accueille 4 joueurs, même après sa date (utile pour
        enregistrer un match déjà passé). Il n'a pas de système de paiement —
        seuls les matchs de saison sont comptabilisés dans les créances.
      </p>
    </Modal>
  );
}
