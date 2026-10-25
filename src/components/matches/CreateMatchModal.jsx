// ─────────────────────────────────────────────────────────────────────────
// Création d'un match ponctuel (hors saison, hors comptabilité).
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { todayISO } from "../../lib/utils";
import { useAppData } from "../../context/AppContext";
import { Modal, Field, Button, inputClass } from "../ui";

export function CreateMatchModal({ onClose }) {
  const { perms } = useAppData();
  // Coach (étape 3 des rôles, 25/10/2026) : un match ponctuel peut être daté
  // au plus 30 jours dans le passé (pour enregistrer un match déjà joué) ;
  // l'admin, sans limite.
  const maxPastDays = perms.createMatchMaxPastDays;
  const minDate = (() => {
    if (maxPastDays == null) return undefined;
    const d = new Date();
    d.setDate(d.getDate() - maxPastDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("20:00");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = Boolean(date && time) && (!minDate || date >= minDate);

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
            min={minDate}
            onChange={(e) => setDate(e.target.value)}
          />
          {minDate && date && date < minDate && (
            <p className="text-[11px] text-rose-600 mt-1">
              Au plus {maxPastDays} jours dans le passé.
            </p>
          )}
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
