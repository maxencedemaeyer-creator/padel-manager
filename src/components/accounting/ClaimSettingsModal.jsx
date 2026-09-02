// ─────────────────────────────────────────────────────────────────────────
// Modale d'édition du montant de la créance de départ d'UN créancier POUR UN
// abonnement précis (voir chantier du 02/09/2026, claude/accounting-module-
// notes.md) : un même créancier peut désormais cumuler plusieurs créances,
// une par abonnement où il figure dans `abonnement.creditors[]` — il n'y a
// donc plus un seul champ global sur la fiche joueur, mais un montant par
// (créancier, abonnement). Utilisée à la fois depuis "Ma comptabilité" (le
// créancier modifie sa propre créance) et depuis "Administration" (l'admin
// modifie celle de n'importe quel créancier) — la même écriture Firestore
// des deux côtés, sur le document de l'abonnement concerné.
//
// La période, le club et le(s) terrain(s) ne sont plus modifiables ici : ce
// sont désormais des informations structurelles de l'abonnement lui-même
// (définies à sa génération, voir CreateSeasonModal.jsx), affichées ici à
// titre indicatif uniquement.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { parseFeeInput, formatClaimPeriodLabel } from "../../lib/utils";
import { useAppData } from "../../context/AppContext";
import { Modal, Field, Button, inputClass } from "../ui";

export function ClaimSettingsModal({ creditorId, creditorName, abonnement, onClose }) {
  const { clubs } = useAppData();
  const currentEntry = (abonnement?.creditors || []).find((c) => c.playerId === creditorId);
  const [amount, setAmount] = useState(
    currentEntry?.advancedAmount != null ? String(currentEntry.advancedAmount) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const club = (clubs || []).find((c) => c.id === abonnement?.clubId);
  const periodLabel = formatClaimPeriodLabel(abonnement?.startDate, abonnement?.endDate);

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    if (!abonnement) {
      setError("Abonnement introuvable.");
      return;
    }
    const parsedAmount = parseFeeInput(amount) || 0;

    setSaving(true);
    try {
      const existing = abonnement.creditors || [];
      const found = existing.some((c) => c.playerId === creditorId);
      const updated = found
        ? existing.map((c) =>
            c.playerId === creditorId ? { ...c, advancedAmount: parsedAmount } : c
          )
        : [...existing, { playerId: creditorId, advancedAmount: parsedAmount }];
      await updateDoc(doc(db, "abonnements", abonnement.id), { creditors: updated });
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
      <p className="text-xs text-[var(--color-text-dim)] mb-3">
        Créance de <span className="font-semibold text-[var(--color-text)]">{creditorName}</span>{" "}
        pour l'abonnement
        {abonnement?.label ? ` « ${abonnement.label} »` : ""}
        {club ? ` — ${club.name}` : ""}
        {(abonnement?.courts || []).length > 0 &&
          ` — Terrain${abonnement.courts.length > 1 ? "s" : ""} ${abonnement.courts.join(", ")}`}
        {periodLabel ? ` — ${periodLabel}` : ""}.
      </p>
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

        <p className="text-[11px] text-[var(--color-text-faint)] -mt-2">
          La période, le club et le(s) terrain(s) sont ceux de l'abonnement généré — pour les
          corriger, générez un nouvel abonnement depuis l'onglet Administration.
        </p>

        {error && <p className="text-xs font-semibold text-rose-600 mt-2">{error}</p>}
      </form>
    </Modal>
  );
}
