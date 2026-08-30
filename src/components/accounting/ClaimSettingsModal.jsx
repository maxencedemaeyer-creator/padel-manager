// ─────────────────────────────────────────────────────────────────────────
// Modale d'édition de la "créance de départ" d'un créancier : montant
// total, période couverte (du/au) et nombre de terrains couverts.
// Utilisée à la fois depuis "Ma comptabilité" (le créancier modifie sa
// propre créance) et depuis "Administration" (l'admin modifie celle de
// n'importe quel créancier) — un seul et même champ Firestore des deux
// côtés, donc toujours cohérent partout dans l'app.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { parseFeeInput } from "../../lib/utils";
import { Modal, Field, Button, inputClass } from "../ui";

export function ClaimSettingsModal({ creditor, onClose }) {
  const [amount, setAmount] = useState(
    creditor.advancedAmount != null ? String(creditor.advancedAmount) : ""
  );
  const [periodStart, setPeriodStart] = useState(creditor.advancedAmountPeriodStart || "");
  const [periodEnd, setPeriodEnd] = useState(creditor.advancedAmountPeriodEnd || "");
  const [courts, setCourts] = useState(
    creditor.advancedAmountCourts != null ? String(creditor.advancedAmountCourts) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");

    const parsedAmount = parseFeeInput(amount);
    const parsedCourts = courts.trim() === "" ? null : parseInt(courts, 10);
    if (courts.trim() !== "" && (!Number.isFinite(parsedCourts) || parsedCourts < 0)) {
      setError("Le nombre de terrains doit être un nombre valide.");
      return;
    }
    if (periodStart && periodEnd && periodStart > periodEnd) {
      setError("La date de fin doit être postérieure à la date de début.");
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, "players", creditor.id), {
        advancedAmount: parsedAmount,
        advancedAmountPeriodStart: periodStart || null,
        advancedAmountPeriodEnd: periodEnd || null,
        advancedAmountCourts: parsedCourts,
      });
      onClose();
    } catch (err) {
      setError("Erreur Firestore : " + err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Créance de départ"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="claim-settings-form" disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </>
      }
    >
      <form id="claim-settings-form" onSubmit={handleSave}>
        <Field label="Montant total de la créance (€)">
          <input
            type="text"
            inputMode="decimal"
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ex. 800"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Période couverte — du">
            <input
              type="date"
              className={inputClass}
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </Field>
          <Field label="Période couverte — au">
            <input
              type="date"
              className={inputClass}
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Nombre de terrains couverts">
          <input
            type="number"
            min="0"
            step="1"
            className={inputClass}
            value={courts}
            onChange={(e) => setCourts(e.target.value)}
            placeholder="Ex. 2"
          />
        </Field>

        <p className="text-[11px] text-[var(--color-text-faint)] -mt-2">
          Le nombre de matchs couverts est calculé automatiquement à partir de
          ces informations et des séances réellement enregistrées sur la
          période — purement indicatif.
        </p>

        {error && <p className="text-xs font-semibold text-rose-600 mt-2">{error}</p>}
      </form>
    </Modal>
  );
}
