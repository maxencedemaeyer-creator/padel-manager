// ─────────────────────────────────────────────────────────────────────────
// Trio ouvert depuis l'engrenage ⚙️ d'un terrain : menu de choix, modifier
// date/heure, et confirmation de suppression (action irréversible).
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { doc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { formatDateFR } from "../../lib/utils";
import Icon from "../icons/Icon";
import { Modal, Field, Button, inputClass } from "../ui";

export function EditMatchDateTimeModal({ match, onClose }) {
  const [date, setDate] = useState(match.date);
  const [time, setTime] = useState(match.time);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!date || !time) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "matches", match.id), { date, time });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Modifier la date et l'heure"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving || !date || !time}>
            {saving ? "Enregistrement..." : "Enregistrer"}
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
    </Modal>
  );
}

export function CourtSettingsMenu({ onClose, onPickDateTime, onPickScore, onPickDelete }) {
  return (
    <Modal title="Paramètres du terrain" onClose={onClose}>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onPickDateTime}
          className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] hover:border-sky-300 text-left text-sm font-medium"
        >
          <Icon.Calendar className="w-4 h-4 text-[var(--color-lime)] shrink-0" />
          Modifier la date et l'heure du match
        </button>
        <button
          type="button"
          onClick={onPickScore}
          className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] hover:border-sky-300 text-left text-sm font-medium"
        >
          <Icon.Trophy className="w-4 h-4 text-[var(--color-lime)] shrink-0" />
          Modifier le score du match
        </button>
        <button
          type="button"
          onClick={onPickDelete}
          className="flex items-center gap-3 p-3 rounded-xl bg-rose-50 border border-rose-200 hover:border-rose-400 text-left text-sm font-semibold text-rose-700"
        >
          <Icon.Trash className="w-4 h-4 text-rose-600 shrink-0" />
          Supprimer le match
        </button>
      </div>
    </Modal>
  );
}

export function DeleteMatchConfirmModal({ match, onClose }) {
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "matches", match.id));
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
      setDeleting(false);
    }
  };

  return (
    <Modal
      title="Supprimer ce match ?"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Annuler
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? "Suppression..." : "Supprimer définitivement"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-text-dim)]">
        Cette action est irréversible. Le match du{" "}
        <span className="font-semibold text-[var(--color-text)]">
          {formatDateFR(match.date)}
          {match.time ? ` à ${match.time}` : ""}
        </span>
        {match.location ? ` (${match.location})` : ""} sera définitivement
        supprimé, ainsi que les joueurs assignés, le score et l'historique de
        paiement associés à ce match.
      </p>
    </Modal>
  );
}
