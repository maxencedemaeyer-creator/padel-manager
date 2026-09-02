// ─────────────────────────────────────────────────────────────────────────
// Trio ouvert depuis l'engrenage ⚙️ d'un terrain : menu de choix, modifier
// date/heure, et confirmation de suppression (action irréversible).
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { doc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import { formatDateFR } from "../../lib/utils";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal, Field, Button, inputClass } from "../ui";

export function EditMatchDateTimeModal({ match, onClose }) {
  // Si le match est actuellement "à une date inconnue" (voir "Reporter à
  // une date inconnue" plus bas), on repart de champs VIDES plutôt que de
  // pré-remplir avec l'ancienne date invalidée — pour forcer la saisie
  // d'une vraie nouvelle date plutôt que de risquer d'enregistrer par
  // erreur l'ancienne par inadvertance.
  const [date, setDate] = useState(match.dateTBD ? "" : match.date);
  const [time, setTime] = useState(match.dateTBD ? "" : match.time);
  const [saving, setSaving] = useState(false);

  // Un report à une AUTRE date (pas juste un changement d'heure le même
  // jour) remet à zéro la présence et la composition de CE match : les
  // réponses "Présent/Absent" et le placement sur le terrain n'ont plus de
  // sens une fois le match déplacé à une date différente. Le ou les
  // créanciers (`match.creditorIds`) ne sont volontairement JAMAIS touchés
  // ici : un report ne doit jamais changer qui a financé ce match (voir
  // claude/accounting-module-notes.md) — seuls `date`/`time` (et, si la date
  // change, `participants`/`availability`/`compositionPublished`) sont
  // écrits.
  const dateChanged = date !== match.date;

  const submit = async () => {
    if (!date || !time) return;
    setSaving(true);
    try {
      // `dateTBD: false` couvre le cas où ce match sortait d'un report "à
      // date inconnue" : on lui attribue ici une vraie date, il ressort donc
      // de la section "Matchs à reprogrammer".
      const updates = { date, time, dateTBD: false };
      if (dateChanged) {
        updates.participants = [];
        updates.availability = {};
        updates.compositionPublished = false;
      }
      await updateDoc(doc(db, "matches", match.id), updates);
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // "Reporter à une date inconnue" : pour un match qu'il faut déplacer mais
  // dont la nouvelle date n'est pas encore connue (terrain indisponible, en
  // attente d'un nouveau créneau...). Le match n'est PAS supprimé : il reste
  // visible de tous (admin ET joueurs), regroupé à part tout en haut de
  // l'onglet Matchs dans "Matchs à reprogrammer" (voir MatchesView.jsx et
  // getMatchTiming → "tbd"), le temps qu'un admin lui attribue une nouvelle
  // date/heure via cette même modale (bouton "Enregistrer" ci-dessus).
  // `date`/`time` sont volontairement laissés tels quels en base — seul
  // `dateTBD` change l'affichage, l'ancienne valeur ne sert plus à rien tant
  // qu'il vaut `true`. Comme pour un report à date connue, composition et
  // présences sont remises à zéro (elles n'ont plus de sens). Abonnement
  // (`abonnementId`), créancier(s) (`creditorIds`) et tarif
  // (`matchFeePerPlayer`) ne sont, eux, JAMAIS touchés : le match reste
  // rattaché à son abonnement et à son financement d'origine.
  const reportUnknownDate = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "matches", match.id), {
        dateTBD: true,
        participants: [],
        availability: {},
        compositionPublished: false,
      });
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
      {dateChanged && (
        <p className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          ⚠️ Ce match change de date : les présences déjà répondues et la
          composition du terrain seront remises à zéro (les joueurs devront
          répondre à nouveau, et l'admin recomposera l'équipe). Le ou les
          créanciers de ce match ne sont pas affectés.
        </p>
      )}
      <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
        <button
          type="button"
          onClick={reportUnknownDate}
          disabled={saving}
          className="w-full text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg py-2.5 hover:bg-amber-100 disabled:opacity-50 transition-all"
        >
          ⏳ Je ne connais pas encore la nouvelle date — Reporter à une date inconnue
        </button>
        <p className="mt-1.5 text-[11px] text-[var(--color-text-faint)]">
          Le match reste visible de tous dans « Matchs à reprogrammer », en
          attente d'une nouvelle date. L'abonnement et le(s) créancier(s)
          restent inchangés.
        </p>
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
  const { matches } = useAppData();
  const [deleting, setDeleting] = useState(false);

  // Ajout du 02/09/2026 (soir) — gestion des abonnements (voir
  // views/AdminView.jsx → "Gestion des abonnements") : si ce match est le
  // DERNIER match encore rattaché à son abonnement (`abonnementId`),
  // l'abonnement n'a plus aucune raison d'exister une fois celui-ci
  // supprimé — sinon il reste indéfiniment affiché (créance, soldes) dans
  // Administration sans plus aucun match derrière. On le supprime alors
  // automatiquement, dans le même batch Firestore pour rester atomique. Un
  // match ponctuel (sans abonnementId) n'est jamais concerné.
  const isLastOfAbonnement =
    Boolean(match.abonnementId) &&
    !matches.some((m) => m.id !== match.id && m.abonnementId === match.abonnementId);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "matches", match.id));
      if (isLastOfAbonnement) {
        batch.delete(doc(db, "abonnements", match.abonnementId));
      }
      await batch.commit();
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
        Cette action est irréversible. Le match
        {match.dateTBD ? (
          <> à une date inconnue</>
        ) : (
          <>
            {" du "}
            <span className="font-semibold text-[var(--color-text)]">
              {formatDateFR(match.date)}
              {match.time ? ` à ${match.time}` : ""}
            </span>
          </>
        )}
        {match.location ? ` (${match.location})` : ""} sera définitivement
        supprimé, ainsi que les joueurs assignés, le score et l'historique de
        paiement associés à ce match.
      </p>
      {isLastOfAbonnement && (
        <p className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          ⚠️ C'est le dernier match encore rattaché à son abonnement — celui-ci sera également
          supprimé (il ne resterait plus aucun match derrière).
        </p>
      )}
    </Modal>
  );
}
