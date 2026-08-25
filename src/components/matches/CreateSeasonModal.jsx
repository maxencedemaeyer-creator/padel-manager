// ─────────────────────────────────────────────────────────────────────────
// Création d'une saison complète (récurrence × nombre de terrains) en un
// seul batch Firestore — la sélection des joueurs se fait ensuite.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { collection, doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { cn, todayISO, getRecurringDates, parseFeeInput, formatDateFR } from "../../lib/utils";
import { RECURRENCE_OPTIONS } from "../../lib/constants";
import { Modal, Field, Button, inputClass } from "../ui";

export function CreateSeasonModal({ onClose }) {
  const [startDate, setStartDate] = useState(todayISO());
  const [recurrence, setRecurrence] = useState(RECURRENCE_OPTIONS[0].label);
  const [numberOfMatches, setNumberOfMatches] = useState(10);
  const [time, setTime] = useState("20:00");
  const [fee, setFee] = useState("");
  const [courtsCount, setCourtsCount] = useState(1);
  const [courtNumbers, setCourtNumbers] = useState(["1"]);
  const [clubName, setClubName] = useState("");
  const [saving, setSaving] = useState(false);

  // Ajuste automatiquement le nombre de cases "numéro de terrain" pour qu'il
  // corresponde toujours exactement au nombre de terrains saisi.
  useEffect(() => {
    const n = Math.max(1, Number(courtsCount) || 1);
    setCourtNumbers((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) {
        next.push(String(next.length + 1));
      }
      return next;
    });
  }, [courtsCount]);

  const setCourtNumberAt = (index, value) => {
    setCourtNumbers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const canSubmit =
    Boolean(startDate) && Number(numberOfMatches) > 0 && courtNumbers.length > 0;

  const totalMatches = Number(numberOfMatches || 0) * courtNumbers.length;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const interval =
        RECURRENCE_OPTIONS.find((r) => r.label === recurrence)?.days || 7;
      const dates = getRecurringDates(startDate, interval, Number(numberOfMatches));
      const courtList = courtNumbers.map((c, i) => (c.trim() ? c.trim() : String(i + 1)));

      const parsedFee = parseFeeInput(fee);
      const club = clubName.trim();

      const batch = writeBatch(db);
      let writesQueued = 0;
      dates.forEach((d) => {
        courtList.forEach((court) => {
          const ref = doc(collection(db, "matches"));
          batch.set(ref, {
            date: d,
            time,
            location: club ? `${club} — Terrain ${court}` : `Terrain ${court}`,
            type: "Saison",
            matchFeePerPlayer: parsedFee,
            participants: [],
            scores: { set1: "", set2: "", set3: "" },
            status: "À venir",
            createdAt: serverTimestamp(),
          });
          writesQueued += 1;
        });
      });
      await batch.commit();
      alert(
        `${writesQueued} match(s) créé(s) avec succès dans Firestore ` +
          `(${dates.length} date(s) × ${courtList.length} terrain(s)).`
      );
      onClose();
    } catch (error) {
      alert("Erreur de création : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Créer une saison complète"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Génération en cours..." : `Générer les ${totalMatches} matchs`}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date du premier match">
          <input
            type="date"
            className={inputClass}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="Récurrence">
          <select
            className={inputClass}
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
          >
            {RECURRENCE_OPTIONS.map((r) => (
              <option key={r.label}>{r.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre de matchs">
          <input
            type="number"
            min="1"
            className={inputClass}
            value={numberOfMatches}
            onChange={(e) => setNumberOfMatches(e.target.value)}
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

      <Field label="Prix par joueur — € (optionnel)">
        <input
          type="text"
          inputMode="decimal"
          className={inputClass}
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          placeholder="Ex. 13,5"
        />
      </Field>

      <Field label="Nombre de terrains">
        <input
          type="number"
          min="1"
          className={inputClass}
          value={courtsCount}
          onChange={(e) => setCourtsCount(e.target.value)}
        />
      </Field>

      <Field label={`Numéros des terrains (${courtNumbers.length} case${courtNumbers.length > 1 ? "s" : ""})`}>
        <div className="grid grid-cols-3 gap-2">
          {courtNumbers.map((val, i) => (
            <input
              key={i}
              className={cn(inputClass, "text-center")}
              value={val}
              onChange={(e) => setCourtNumberAt(i, e.target.value)}
              placeholder={`Terrain ${i + 1}`}
            />
          ))}
        </div>
        <p className="text-[11px] text-[var(--color-text-faint)] mt-1.5">
          Une case par terrain — modifiez le nombre ci-dessus pour en ajouter ou en retirer.
        </p>
      </Field>

      <Field label="Nom du club (optionnel)">
        <input
          className={inputClass}
          value={clubName}
          onChange={(e) => setClubName(e.target.value)}
          placeholder="Ex. Padel Club Bruxelles"
        />
      </Field>

      <p className="text-xs text-[var(--color-text-dim)] mb-3">
        {totalMatches} match{totalMatches > 1 ? "s" : ""} seront générés (
        {numberOfMatches} date{Number(numberOfMatches) > 1 ? "s" : ""} ×{" "}
        {courtNumbers.length} terrain{courtNumbers.length > 1 ? "s" : ""}),{" "}
        {recurrence.toLowerCase()}, à partir du {formatDateFR(startDate)}. La
        sélection des joueurs se fera ensuite depuis la page d'accueil.
      </p>
    </Modal>
  );
}
