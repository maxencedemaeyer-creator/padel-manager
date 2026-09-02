// ─────────────────────────────────────────────────────────────────────────
// Création d'un abonnement (ex-"saison") : récurrence × terrain(s), sur une
// période et un club donnés, en un seul batch Firestore.
//
// Chantier du 02/09/2026 — les créanciers et leur créance de départ sont
// désormais définis ICI, à la génération, et non plus via un champ unique
// sur la fiche joueur : chaque match généré reçoit sa liste de créanciers
// (`match.creditorIds`) FIGÉE une bonne fois pour toutes. Un report
// ultérieur du match (EditMatchDateTimeModal, qui ne touche que date/heure)
// ne la modifie donc jamais — c'est précisément ce qui règle le risque de
// "couac" identifié par l'utilisateur (un match déplacé qui basculerait
// accidentellement vers un autre créancier que celui qui a réellement avancé
// l'argent). Plusieurs abonnements peuvent coexister sur les mêmes dates
// (ex. deux terrains du même club, chacun avec ses propres créanciers) : ils
// restent affichés groupés sous la même session grâce à
// groupMatchesBySession (voir lib/matchLogic.js), qui regroupe désormais par
// date + heure + club plutôt que par abonnement.
//
// La sélection des joueurs sur chaque terrain se fait ensuite, depuis la
// page d'accueil, comme avant.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { collection, doc, addDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { cn, formatDateFR, getRecurringDatesInRange, parseFeeInput, todayISO } from "../../lib/utils";
import { RECURRENCE_OPTIONS } from "../../lib/constants";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal, Field, Button, inputClass } from "../ui";
import { PlayerAvatar } from "../players/PlayerAvatar";

const NEW_CLUB_VALUE = "__new__";

export function CreateSeasonModal({ onClose }) {
  const { players, clubs } = useAppData();

  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [recurrence, setRecurrence] = useState(RECURRENCE_OPTIONS[0].label);
  const [time, setTime] = useState("20:00");
  const [fee, setFee] = useState("");
  const [courtsCount, setCourtsCount] = useState(1);
  const [courtNumbers, setCourtNumbers] = useState(["1"]);
  const [label, setLabel] = useState("");

  const [selectedClubId, setSelectedClubId] = useState("");
  const [newClubName, setNewClubName] = useState("");

  const [creditorIds, setCreditorIds] = useState(() => new Set());
  const [creditorAmounts, setCreditorAmounts] = useState({});

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

  const toggleCreditor = (playerId) => {
    setCreditorIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const setCreditorAmount = (playerId, value) => {
    setCreditorAmounts((prev) => ({ ...prev, [playerId]: value }));
  };

  const interval = RECURRENCE_OPTIONS.find((r) => r.label === recurrence)?.days || 7;
  const dates = getRecurringDatesInRange(startDate, interval, endDate);
  const totalMatches = dates.length * courtNumbers.length;
  const usingNewClub = selectedClubId === NEW_CLUB_VALUE;

  // Corrigé le 02/09/2026 (audit paiements) : rien n'empêchait jusqu'ici de
  // saisir un tarif ou un montant avancé négatif (ex. faute de frappe "-5"
  // au lieu de "15") — ça aurait faussé silencieusement tous les totaux
  // dérivés (soldes créanciers, impayés, synthèse "Ma comptabilité") pour
  // tout l'abonnement généré. Un champ vide reste autorisé (tarif optionnel).
  const parsedFeePreview = parseFeeInput(fee);
  const feeError =
    parsedFeePreview != null && parsedFeePreview < 0
      ? "Le tarif par joueur ne peut pas être négatif."
      : "";
  const invalidCreditorAmountIds = [...creditorIds].filter((playerId) => {
    const parsed = parseFeeInput(creditorAmounts[playerId]);
    return parsed != null && parsed < 0;
  });
  const creditorAmountsError =
    invalidCreditorAmountIds.length > 0
      ? "Le montant avancé d'un créancier ne peut pas être négatif."
      : "";

  const canSubmit =
    Boolean(startDate) &&
    Boolean(endDate) &&
    startDate <= endDate &&
    dates.length > 0 &&
    courtNumbers.length > 0 &&
    (usingNewClub ? newClubName.trim().length > 0 : Boolean(selectedClubId)) &&
    !feeError &&
    !creditorAmountsError;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      // 1. Résout (ou crée à la volée) le club sélectionné.
      let clubId = selectedClubId;
      let clubName = clubs.find((c) => c.id === selectedClubId)?.name || "";
      if (usingNewClub) {
        const clubRef = await addDoc(collection(db, "clubs"), {
          name: newClubName.trim(),
          address: null,
          logoUrl: null,
          createdAt: serverTimestamp(),
        });
        clubId = clubRef.id;
        clubName = newClubName.trim();
      }

      const courtList = courtNumbers.map((c, i) => (c.trim() ? c.trim() : String(i + 1)));
      const parsedFee = parseFeeInput(fee);
      const creditors = [...creditorIds].map((playerId) => ({
        playerId,
        advancedAmount: parseFeeInput(creditorAmounts[playerId]) || 0,
      }));
      const creditorPlayerIds = creditors.map((c) => c.playerId);

      // 2. Crée le document "abonnement" — la créance de départ de chaque
      // créancier sélectionné vit désormais ici (voir lib/stats.js →
      // getCreditorClaims), pas sur sa fiche joueur.
      const abonnementRef = await addDoc(collection(db, "abonnements"), {
        clubId,
        courts: courtList,
        startDate,
        endDate,
        recurrenceDays: interval,
        time,
        matchFeePerPlayer: parsedFee,
        creditors,
        label: label.trim() || null,
        createdAt: serverTimestamp(),
      });

      // 3. Génère tous les matchs (dates × terrains) dans un seul batch,
      // chacun figeant sa liste de créanciers (`creditorIds`) et référençant
      // son abonnement (`abonnementId`).
      const batch = writeBatch(db);
      let writesQueued = 0;
      dates.forEach((d) => {
        courtList.forEach((court) => {
          const ref = doc(collection(db, "matches"));
          batch.set(ref, {
            date: d,
            time,
            location: `${clubName} — Terrain ${court}`,
            type: "Saison",
            matchFeePerPlayer: parsedFee,
            participants: [],
            scores: { set1: "", set2: "", set3: "" },
            status: "À venir",
            abonnementId: abonnementRef.id,
            clubId,
            court,
            creditorIds: creditorPlayerIds,
            createdAt: serverTimestamp(),
          });
          writesQueued += 1;
        });
      });
      // 4. Active automatiquement le statut "Créancier" sur la fiche de
      // chaque joueur sélectionné ci-dessus (s'il ne l'était pas déjà) — pas
      // besoin d'un aller-retour manuel par l'onglet Joueurs.
      creditorPlayerIds.forEach((playerId) => {
        batch.set(doc(db, "players", playerId), { isCreditor: true }, { merge: true });
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
      title="Créer un abonnement"
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
      <Field label="Club">
        <select
          className={inputClass}
          value={selectedClubId}
          onChange={(e) => setSelectedClubId(e.target.value)}
        >
          <option value="">— Choisir un club —</option>
          {(clubs || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NEW_CLUB_VALUE}>+ Nouveau club…</option>
        </select>
        {usingNewClub && (
          <input
            className={cn(inputClass, "mt-2")}
            value={newClubName}
            onChange={(e) => setNewClubName(e.target.value)}
            placeholder="Nom du nouveau club"
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date de début">
          <input
            type="date"
            className={inputClass}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="Date de fin">
          <input
            type="date"
            className={inputClass}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
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
        {feeError && <p className="text-[11px] font-semibold text-rose-600 mt-1">{feeError}</p>}
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

      <Field
        label={`Numéros des terrains (${courtNumbers.length} case${courtNumbers.length > 1 ? "s" : ""})`}
      >
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
          Une case par terrain — modifiez le nombre ci-dessus pour en ajouter ou en retirer. Tous
          les terrains de cet abonnement partagent les mêmes créanciers ci-dessous.
        </p>
      </Field>

      <Field label="Nom de l'abonnement (optionnel)">
        <input
          className={inputClass}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex. Terrain 2 — Automne 2026"
        />
        <p className="text-[11px] text-[var(--color-text-faint)] mt-1.5">
          Utile pour s'y retrouver quand plusieurs abonnements se chevauchent (ex. deux terrains
          avec des créanciers différents).
        </p>
      </Field>

      <Field label="Créanciers de cet abonnement">
        <div className="flex flex-col gap-2">
          {(players || []).length === 0 && (
            <p className="text-xs text-[var(--color-text-faint)]">
              Aucun joueur enregistré pour l'instant.
            </p>
          )}
          {(players || []).map((p) => {
            const checked = creditorIds.has(p.id);
            return (
              <div
                key={p.id}
                className={cn(
                  "flex items-center gap-3 p-2.5 rounded-2xl border",
                  checked
                    ? "border-[var(--color-lime)]/50 bg-[var(--color-lime)]/5"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
                )}
              >
                <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCreditor(p.id)}
                    className="w-4 h-4 accent-[var(--color-lime)] shrink-0"
                  />
                  <PlayerAvatar player={p} size={28} />
                  <span className="text-sm font-medium truncate">{p.name}</span>
                </label>
                {checked && (
                  <input
                    type="text"
                    inputMode="decimal"
                    className={cn(
                      inputClass,
                      "!py-1.5 !px-2.5 w-28 shrink-0 text-right",
                      invalidCreditorAmountIds.includes(p.id) && "!border-rose-400"
                    )}
                    value={creditorAmounts[p.id] || ""}
                    onChange={(e) => setCreditorAmount(p.id, e.target.value)}
                    placeholder="Montant €"
                  />
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--color-text-faint)] mt-1.5">
          Cochez chaque joueur ayant avancé de l'argent pour cet abonnement et indiquez le montant
          qu'il a avancé — cette créance de départ alimente directement son onglet « Ma
          comptabilité ». Ce sont ces joueurs, et uniquement eux, qui seront proposés comme
          créanciers sur chacun des matchs générés ci-dessous, quelle que soit la date à laquelle
          ce match sera finalement joué (même après un report).
        </p>
        {creditorAmountsError && (
          <p className="text-[11px] font-semibold text-rose-600 mt-1">{creditorAmountsError}</p>
        )}
      </Field>

      <p className="text-xs text-[var(--color-text-dim)] mb-3">
        {totalMatches} match{totalMatches > 1 ? "s" : ""} seront générés ({dates.length} date
        {dates.length > 1 ? "s" : ""} × {courtNumbers.length} terrain
        {courtNumbers.length > 1 ? "s" : ""}), {recurrence.toLowerCase()}
        {startDate && <> à partir du {formatDateFR(startDate)}</>}
        {endDate && <> jusqu'au {formatDateFR(endDate)}</>}.
      </p>
    </Modal>
  );
}
