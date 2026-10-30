// ─────────────────────────────────────────────────────────────────────────
// Fenêtre « Versement entre créanciers » (chantier du 30/10/2026).
//
// Enregistre un transfert d'argent RÉEL d'un créancier vers un autre, pour
// remettre deux comptabilités à l'équilibre — soit un versement proposé par
// le bilan (« Remettre à l'équilibre », champs pré-remplis), soit un
// versement libre (montant et motif au choix, ex. « arrangement terrain
// déplacé »). Réservé à l'admin.
//
// Le versement est rangé dans le document de l'abonnement choisi
// (`abonnement.transfers[]`) : une seule écriture Firebase, aucune lecture
// en plus (les abonnements sont déjà chargés par l'app). Il apparaît ensuite
// dans la comptabilité des deux créanciers et dans le bilan de l'abonnement,
// et il est noté dans le journal d'activité.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { arrayUnion, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { parseFeeInput } from "../../lib/utils";
import { getAllCreditorPlayerIds, round2 } from "../../lib/stats";
import { newTransferId } from "../../lib/settlement";
import { useAppData } from "../../context/AppContext";
import { logActivity, playerName } from "../../lib/activityLog";
import { Modal, Button, Field, inputClass } from "../ui";

export function TransferModal({ defaultAbonnementId, prefill, onClose }) {
  const { players, abonnements, clubs, connectedPlayer } = useAppData();

  // Les abonnements actifs d'abord, puis les archivés (un versement peut
  // aussi servir à rééquilibrer un abonnement déjà clôturé).
  const abonnementOptions = useMemo(
    () =>
      [...(abonnements || [])].sort(
        (a, b) =>
          Number(Boolean(a.archived)) - Number(Boolean(b.archived)) ||
          String(b.startDate || "").localeCompare(String(a.startDate || ""))
      ),
    [abonnements]
  );
  const abonnementLabel = (a) => {
    const club = (clubs || []).find((c) => c.id === a.clubId);
    const base = a.label || club?.name || "Abonnement";
    const courts = (a.courts || []).length > 0 ? ` (T${a.courts.join(", T")})` : "";
    return `${base}${courts}${a.archived ? " — clôturé" : ""}`;
  };

  const [abonnementId, setAbonnementId] = useState(
    defaultAbonnementId || abonnementOptions[0]?.id || ""
  );
  const [fromId, setFromId] = useState(prefill?.fromId || "");
  const [toId, setToId] = useState(prefill?.toId || "");
  const [amount, setAmount] = useState(
    prefill?.amount != null ? String(prefill.amount).replace(".", ",") : ""
  );
  const [note, setNote] = useState(prefill?.note || "");
  const [saving, setSaving] = useState(false);

  // Créanciers en premier (ceux de l'abonnement choisi, puis les autres
  // créanciers de l'app), puis le reste des joueurs : un versement concerne
  // presque toujours deux créanciers, mais on ne bloque aucun cas.
  const peopleOptions = useMemo(() => {
    const abonnement = (abonnements || []).find((a) => a.id === abonnementId);
    const abCreditorIds = new Set((abonnement?.creditors || []).map((c) => c.playerId));
    const allCreditorIds = getAllCreditorPlayerIds(players, abonnements);
    const rank = (p) => (abCreditorIds.has(p.id) ? 0 : allCreditorIds.has(p.id) ? 1 : 2);
    return [...(players || [])].sort(
      (a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name))
    );
  }, [players, abonnements, abonnementId]);

  const parsedAmount = round2(parseFeeInput(amount) || 0);
  const canSave =
    Boolean(abonnementId) && Boolean(fromId) && Boolean(toId) && fromId !== toId && parsedAmount > 0;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const transfer = {
        id: newTransferId(),
        fromId,
        toId,
        amount: parsedAmount,
        note: note.trim() || null,
        at: new Date().toISOString(),
        by: connectedPlayer?.id || null,
      };
      await updateDoc(doc(db, "abonnements", abonnementId), {
        transfers: arrayUnion(transfer),
      });
      const abonnement = (abonnements || []).find((a) => a.id === abonnementId);
      logActivity(
        "money",
        `Versement de ${playerName(players, fromId)} à ${playerName(players, toId)} : ${parsedAmount.toLocaleString("fr-FR")} €${transfer.note ? ` (${transfer.note})` : ""} — ${abonnement ? abonnementLabel(abonnement) : "abonnement"}`
      );
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const selectClass = `${inputClass} appearance-none`;

  return (
    <Modal
      title="Versement entre créanciers"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={save} disabled={!canSave || saving}>
            {saving ? "Enregistrement…" : "Versement effectué"}
          </Button>
        </>
      }
    >
      <p className="text-xs text-[var(--color-text-dim)] -mt-1 mb-3">
        À enregistrer une fois l'argent réellement remis. Le reste net de celui qui verse
        augmente du montant, celui de celui qui reçoit diminue d'autant.
      </p>

      <Field label="Abonnement">
        <select
          className={selectClass}
          value={abonnementId}
          onChange={(e) => setAbonnementId(e.target.value)}
        >
          {abonnementOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {abonnementLabel(a)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="De (verse l'argent)">
        <select className={selectClass} value={fromId} onChange={(e) => setFromId(e.target.value)}>
          <option value="">Choisir…</option>
          {peopleOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="À (reçoit l'argent)">
        <select className={selectClass} value={toId} onChange={(e) => setToId(e.target.value)}>
          <option value="">Choisir…</option>
          {peopleOptions.map((p) => (
            <option key={p.id} value={p.id} disabled={p.id === fromId}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Montant (€)">
        <input
          type="text"
          inputMode="decimal"
          className={inputClass}
          placeholder="Ex. 40,5"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>

      <Field label="Motif (facultatif)">
        <input
          type="text"
          className={inputClass}
          placeholder="Ex. arrangement terrain déplacé"
          maxLength={120}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      {fromId && toId && fromId === toId && (
        <p className="text-xs font-semibold text-rose-600">
          Choisissez deux personnes différentes.
        </p>
      )}
    </Modal>
  );
}
