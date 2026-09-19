// ─────────────────────────────────────────────────────────────────────────
// Onglet "Administration" — KPIs du club, soldes des créanciers (éditables),
// gestion des clubs, génération d'abonnements.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { doc, deleteDoc, deleteField, onSnapshot, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { cn, formatClaimPeriodLabel } from "../lib/utils";
import { getMatchTiming } from "../lib/matchLogic";
import { DEFAULT_PRESENCE_WINDOW_DAYS, DEFAULT_PRESENCE_LOCK_HOURS } from "../lib/constants";
import {
  getCreditorAccounting,
  getCreditorClaims,
  getAllCreditorPlayerIds,
  getUnpaidPastParticipations,
  participantsOf,
} from "../lib/stats";
import { getDivergence, suggestLevelForScore, RANKING_ENGINE_VERSION } from "../lib/levelRating";
import { computeFullRecalculation } from "../lib/rankingRecalc";
import { useAppData } from "../context/AppContext";
import Icon from "../components/icons/Icon";
import { Card, Button, EmptyState, Switch, Modal, Field, inputClass } from "../components/ui";
import { CreateSeasonModal } from "../components/matches/CreateSeasonModal";
import { ClaimSettingsModal } from "../components/accounting/ClaimSettingsModal";
import { CreditorAccountingModal } from "../components/accounting/CreditorAccountingModal";
import { ManageClubsModal } from "../components/clubs/ManageClubsModal";
import { PlayerAvatar } from "../components/players/PlayerAvatar";
import { PlayerLinksCard } from "../components/admin/PlayerLinksCard";

// Carte "Game Center" — interrupteur pour rendre l'onglet accessible à tous
// les joueurs (par défaut, réservé à l'admin). Écrit directement dans
// settings/appConfig ; le changement est répercuté partout en temps réel
// via useAppSettings (voir src/hooks/useFirestoreData.js).
function GameCenterSettingCard({ enabled }) {
  const [saving, setSaving] = useState(false);

  const toggle = async (next) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "appConfig"), { gameCenterEnabled: next }, { merge: true });
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 flex items-center gap-3 mb-6">
      <span className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--color-lime)]/15 text-[var(--color-lime)] shrink-0">
        <Icon.Gamepad className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Game Center</p>
        <p className="text-[11px] text-[var(--color-text-dim)] mt-0.5">
          {enabled
            ? "Visible par tous les joueurs."
            : "Réservé à l'administrateur pour le moment."}
        </p>
      </div>
      <Switch checked={enabled} onChange={toggle} disabled={saving} />
    </Card>
  );
}

// Carte "Ranking" — interrupteur pour rendre le Ranking visible par tous
// les joueurs (par défaut, réservé à l'admin, voir §6 de
// claude/feature-ranking-padel-manager.md). Même mécanique exacte que
// GameCenterSettingCard ci-dessus : écrit `rankingEnabled` dans
// settings/appConfig, répercuté en temps réel via useAppSettings. Ne
// contrôle QUE l'affichage aux joueurs non-admin — le moteur de calcul
// tourne dans tous les cas dès le déploiement du code (§2).
function RankingSettingCard({ enabled }) {
  const [saving, setSaving] = useState(false);

  const toggle = async (next) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "appConfig"), { rankingEnabled: next }, { merge: true });
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 flex items-center gap-3 mb-6">
      <span className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--color-lime)]/15 text-[var(--color-lime)] shrink-0">
        <Icon.Chart className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Ranking</p>
        <p className="text-[11px] text-[var(--color-text-dim)] mt-0.5">
          {enabled
            ? "Visible par tous les joueurs."
            : "Réservé à l'administrateur pour le moment — le calcul tourne déjà en arrière-plan."}
        </p>
      </div>
      <Switch checked={enabled} onChange={toggle} disabled={saving} />
    </Card>
  );
}

// Carte "Recalcul du ranking" (§7 de
// claude/feature-ranking-v2-progression-assiduite-2026-09-19.md) — rejoue
// TOUT l'historique des matchs officiels notés avec les règles du code
// actuellement déployé (src/lib/rankingRecalc.js). Remplace les anciennes
// "Étape 1" et "Étape 2" de mise en place. Deux boutons : "Aperçu" (calcule
// et affiche ce qui changerait, sans rien écrire) et "Appliquer" (écrit,
// après confirmation). Un numéro de version du calcul
// (RANKING_ENGINE_VERSION, src/lib/levelRating.js) est comparé à celui du
// dernier recalcul appliqué (settings/appConfig) : s'ils diffèrent, la carte
// affiche "Recalcul conseillé". Lue directement ici (onSnapshot) plutôt que
// via useAppSettings, pour ne toucher qu'à ce fichier.
function formatRankingValue(value) {
  return value == null ? "—" : value.toFixed(2).replace(".", ",");
}

function RankingRecalcPreviewModal({ preview, onClose, onApply, busy }) {
  const rows = preview.playerRows
    .slice()
    .sort((a, b) => {
      const da = a.before != null && a.after != null ? Math.abs(a.after - a.before) : 0;
      const db2 = b.before != null && b.after != null ? Math.abs(b.after - b.before) : 0;
      return db2 - da || a.name.localeCompare(b.name);
    });
  const { stats } = preview;
  return (
    <Modal
      title="Aperçu du recalcul du ranking"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Fermer
          </Button>
          <Button onClick={onApply} disabled={busy}>
            {busy ? "Recalcul en cours..." : "Appliquer le recalcul"}
          </Button>
        </>
      }
    >
      <p className="text-xs text-[var(--color-text-dim)] mb-3">
        Rien n'est encore enregistré : voici ce que donnerait le rejeu de tout l'historique avec
        les règles actuelles. {stats.matchesReplayed} match{stats.matchesReplayed !== 1 ? "s" : ""}{" "}
        rejoué{stats.matchesReplayed !== 1 ? "s" : ""}, {stats.playersChanged} joueur
        {stats.playersChanged !== 1 ? "s" : ""} modifié{stats.playersChanged !== 1 ? "s" : ""}
        {stats.matchesSkipped > 0
          ? `, ${stats.matchesSkipped} match${stats.matchesSkipped !== 1 ? "s" : ""} ignoré${stats.matchesSkipped !== 1 ? "s" : ""} (composition incomplète)`
          : ""}
        .
      </p>
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const diff = row.before != null && row.after != null ? row.after - row.before : null;
          return (
            <div
              key={row.id}
              className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--color-surface-2)]"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{row.name}</p>
                <p className="text-[10px] text-[var(--color-text-faint)]">
                  {row.level} · {row.matchesCount} match{row.matchesCount !== 1 ? "s" : ""} noté
                  {row.matchesCount !== 1 ? "s" : ""}
                  {row.levelFixed ? " · niveau technique corrigé" : ""}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="pm-mono text-xs font-bold">
                  {formatRankingValue(row.before)} → {formatRankingValue(row.after)}
                </p>
                {diff != null && Math.abs(diff) >= 0.005 && (
                  <p
                    className={`pm-mono text-[10px] font-bold ${
                      diff > 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {diff > 0 ? "+" : ""}
                    {diff.toFixed(2).replace(".", ",")}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function RankingRecalcCard({ players, matches }) {
  const [applied, setApplied] = useState({ loading: true, version: 0, at: null });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onSnapshot(
        doc(db, "settings", "appConfig"),
        (snap) => {
          const data = snap.exists() ? snap.data() : {};
          setApplied({
            loading: false,
            version:
              typeof data.rankingEngineVersionApplied === "number"
                ? data.rankingEngineVersionApplied
                : 0,
            at: typeof data.rankingRecalcAt === "string" ? data.rankingRecalcAt : null,
          });
        },
        (error) => {
          console.error(error);
          setApplied((prev) => ({ ...prev, loading: false }));
        }
      );
    } catch (error) {
      console.error(error);
    }
    return () => unsub();
  }, []);

  const recommended = !applied.loading && applied.version !== RANKING_ENGINE_VERSION;

  const showPreview = () => {
    setResult(null);
    setPreview(computeFullRecalculation({ players, matches }));
  };

  // Le calcul est refait à partir des données les plus récentes au moment
  // du clic (jamais à partir d'un aperçu resté ouvert longtemps).
  const apply = async () => {
    const sure = window.confirm(
      "Appliquer le recalcul ? Le ranking de tous les joueurs et le détail de chaque match officiel seront réécrits à partir de l'historique complet. À lancer quand personne n'est en train d'encoder un score."
    );
    if (!sure) return;
    setBusy(true);
    try {
      const plan = computeFullRecalculation({ players, matches });
      const ops = [];
      plan.matchWrites.forEach((w) => {
        ops.push({ ref: doc(db, "matches", w.matchId), data: { levelDeltas: w.levelDeltas } });
      });
      plan.matchClears.forEach((matchId) => {
        ops.push({ ref: doc(db, "matches", matchId), data: { levelDeltas: deleteField() } });
      });
      Object.entries(plan.playerWrites).forEach(([playerId, write]) => {
        const data = {};
        if (write.levelSortValue !== undefined) data.levelSortValue = write.levelSortValue;
        if (write.unrank) {
          data.internalScore = deleteField();
          data.internalScoreReliability = deleteField();
        } else if (write.internalScore !== undefined) {
          data.internalScore = write.internalScore;
          data.internalScoreReliability = write.internalScoreReliability;
        }
        ops.push({ ref: doc(db, "players", playerId), data });
      });
      for (let i = 0; i < ops.length; i += 450) {
        const batch = writeBatch(db);
        ops.slice(i, i + 450).forEach((op) => batch.update(op.ref, op.data));
        await batch.commit();
      }
      await setDoc(
        doc(db, "settings", "appConfig"),
        {
          rankingEngineVersionApplied: RANKING_ENGINE_VERSION,
          rankingRecalcAt: new Date().toISOString(),
        },
        { merge: true }
      );
      setPreview(null);
      const { stats } = plan;
      setResult(
        `${stats.matchesReplayed} match${stats.matchesReplayed !== 1 ? "s" : ""} rejoué${stats.matchesReplayed !== 1 ? "s" : ""}, ${stats.playersChanged} joueur${stats.playersChanged !== 1 ? "s" : ""} mis à jour${
          stats.matchesSkipped > 0
            ? ` (${stats.matchesSkipped} match${stats.matchesSkipped !== 1 ? "s" : ""} ignoré${stats.matchesSkipped !== 1 ? "s" : ""}, composition incomplète)`
            : ""
        }.`
      );
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setBusy(false);
    }
  };

  let lastRecalcLabel = "Aucun recalcul enregistré pour l'instant.";
  if (applied.version > 0) {
    lastRecalcLabel = `Dernier recalcul : version ${applied.version}`;
    if (applied.at) {
      const when = new Date(applied.at);
      if (!Number.isNaN(when.getTime())) {
        lastRecalcLabel += ` · le ${when.toLocaleDateString("fr-FR")} à ${when.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
      }
    }
    lastRecalcLabel += ".";
  }

  return (
    <Card className={cn("p-4 sm:p-5 mb-6", recommended && "border-amber-200 bg-amber-50/70")}>
      <h3 className="font-semibold text-sm mb-1 flex items-center gap-1.5">
        <Icon.Refresh className="w-4 h-4 text-[var(--color-lime)]" /> Recalcul du ranking
      </h3>
      <p className="text-[11px] text-[var(--color-text-dim)] mb-3">
        Rejoue tout l'historique des matchs officiels notés avec les règles de calcul actuelles
        (version {RANKING_ENGINE_VERSION}), en repartant du niveau officiel actuel de chaque
        joueur. À utiliser après chaque changement des règles du ranking. Les rankings visibles
        peuvent changer d'un coup — lancez d'abord l'aperçu, et de préférence quand personne
        n'encode de score.
      </p>
      {recommended && (
        <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1 mb-2">
          <Icon.AlertCircle className="w-3.5 h-3.5" /> Recalcul conseillé — le calcul a changé
          depuis le dernier recalcul.
        </p>
      )}
      {!recommended && !applied.loading && (
        <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 mb-2">
          <Icon.CheckCircle className="w-3.5 h-3.5" /> Ranking à jour avec la version{" "}
          {RANKING_ENGINE_VERSION} du calcul.
        </p>
      )}
      <p className="text-[11px] text-[var(--color-text-faint)] mb-3">{lastRecalcLabel}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="!py-2.5 !text-xs w-full" onClick={showPreview} disabled={busy}>
          Aperçu
        </Button>
        <Button className="!py-2.5 !text-xs w-full" onClick={apply} disabled={busy}>
          {busy ? "Recalcul en cours..." : "Appliquer"}
        </Button>
      </div>
      {result && (
        <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 mt-3">
          <Icon.CheckCircle className="w-3.5 h-3.5" /> {result}
        </p>
      )}
      {preview && (
        <RankingRecalcPreviewModal
          preview={preview}
          onClose={() => setPreview(null)}
          onApply={apply}
          busy={busy}
        />
      )}
    </Card>
  );
}

// Carte "Écarts de ranking" (§13) — liste uniquement les joueurs dont le
// signal de divergence est actif. Pas de mécanisme de masquage/snooze :
// apparaît/disparaît automatiquement selon la condition de déclenchement —
// donc invisible dès qu'aucun joueur n'est concerné (comme les autres
// bandeaux d'alerte de l'app).
function RankingDivergenceCard({ players }) {
  const flagged = players
    .map((player) => ({ player, divergence: getDivergence(player) }))
    .filter((x) => x.divergence && x.divergence.active)
    .sort((a, b) => Math.abs(b.divergence.divergence) - Math.abs(a.divergence.divergence));

  if (flagged.length === 0) return null;

  return (
    <Card className="p-4 sm:p-5 mb-6 border-amber-200 bg-amber-50/70">
      <h3 className="font-semibold text-sm mb-1 flex items-center gap-1.5">
        <Icon.AlertCircle className="w-4 h-4 text-amber-600" /> Écarts de ranking
      </h3>
      <p className="text-[11px] text-[var(--color-text-dim)] mb-3">
        Ce n'est pas une preuve d'erreur de déclaration — juste une observation interne au club,
        à interpréter au cas par cas. Ne changez le niveau officiel que sur une preuve externe
        réelle (tournoi, reclassement fédéral).
      </p>
      <div className="flex flex-col gap-2">
        {flagged.map(({ player, divergence }) => {
          const suggestion = suggestLevelForScore(divergence.score);
          const goingUp = divergence.divergence > 0;
          return (
            <div key={player.id} className="p-3 rounded-xl bg-white/70 border border-amber-200/60">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-semibold text-sm">{player.name}</span>
                <span className="pm-mono text-xs font-bold shrink-0">
                  {divergence.score.toFixed(1).replace(".", ",")} vs {divergence.scoreBase.toFixed(1).replace(".", ",")}{" "}
                  ({player.level})
                </span>
              </div>
              <p className="text-[11px] text-[var(--color-text-dim)]">
                {goingUp
                  ? `Ce joueur performe nettement au-dessus de son niveau déclaré. Si son niveau réel a changé, envisager de le monter (suggestion : ${suggestion ? suggestion.label : "—"}). Sinon, cet écart peut simplement refléter sa force au sein du club.`
                  : `Ce joueur performe nettement en dessous de son niveau déclaré. Si son niveau réel a changé, envisager de le descendre (suggestion : ${suggestion ? suggestion.label : "—"}). Sinon, cet écart peut simplement refléter sa position au sein du club.`}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Carte "Mode Maintenance" — interrupteur pour couper l'accès au site à
// tous les joueurs (l'administrateur, lui, garde toujours l'accès complet,
// justement pour pouvoir désactiver la maintenance depuis ce même écran).
// Même mécanique que le Game Center ci-dessus : écrit dans
// settings/appConfig, répercuté en temps réel partout via useAppSettings.
function MaintenanceSettingCard({ enabled }) {
  const [saving, setSaving] = useState(false);

  const toggle = async (next) => {
    if (next) {
      const sure = window.confirm(
        "Activer le mode maintenance ? Tous les joueurs (sauf vous, l'administrateur) seront bloqués sur un écran d'attente jusqu'à ce que vous le désactiviez."
      );
      if (!sure) return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "appConfig"), { maintenanceEnabled: next }, { merge: true });
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      className={`p-4 flex items-center gap-3 mb-6 ${
        enabled ? "border-rose-300 bg-rose-50/70" : ""
      }`}
    >
      <span
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          enabled
            ? "bg-rose-500/15 text-rose-600"
            : "bg-[var(--color-text-dim)]/10 text-[var(--color-text-dim)]"
        }`}
      >
        <Icon.AlertCircle className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Mode maintenance</p>
        <p className="text-[11px] text-[var(--color-text-dim)] mt-0.5">
          {enabled
            ? "Site bloqué pour tous les joueurs, sauf vous (admin)."
            : "Site accessible normalement à tous."}
        </p>
      </div>
      <Switch checked={enabled} onChange={toggle} disabled={saving} />
    </Card>
  );
}

// Carte "Fenêtre de convocation" — réglage global du nombre de jours avant
// un match à partir duquel les joueurs peuvent répondre présent / absent /
// je ne sais pas encore (voir lib/convocation.js). Écrit directement dans
// settings/appConfig, comme Game Center / Maintenance ci-dessus, répercuté
// en temps réel partout via useAppSettings. Une dérogation ponctuelle par
// session (forcer l'ouverture ou la fermeture d'UN match précis) reste
// possible depuis l'onglet Matchs, indépendamment de ce réglage global.
function PresenceWindowSettingCard({ value }) {
  const [days, setDays] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Garde le champ synchronisé si la valeur change ailleurs (autre session
  // admin, ou simplement après l'enregistrement ci-dessous).
  useEffect(() => {
    setDays(String(value));
  }, [value]);

  const isUnrestricted = value >= DEFAULT_PRESENCE_WINDOW_DAYS;

  const handleSave = async (e) => {
    e.preventDefault();
    const n = parseInt(days, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "appConfig"), { presenceWindowDays: n }, { merge: true });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5 mb-6">
      <h3 className="font-semibold text-sm mb-1">Fenêtre de convocation</h3>
      <p className="text-[11px] text-[var(--color-text-dim)] mb-4">
        Nombre de jours avant un match à partir duquel les joueurs peuvent
        indiquer leur présence.{" "}
        {isUnrestricted
          ? "Actuellement : toujours ouverte (réglage jamais modifié)."
          : `Actuellement : ${value} jour${value > 1 ? "s" : ""} avant chaque match.`}{" "}
        Vous gardez la main pour forcer l'ouverture ou la fermeture d'une
        session précise depuis l'onglet Matchs.
      </p>

      <form onSubmit={handleSave} className="flex items-center gap-3 max-w-sm">
        <div className="relative flex-1">
          <input
            type="number"
            min="1"
            step="1"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className={inputClass}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--color-text-faint)]">
            jour{Number(days) > 1 ? "s" : ""}
          </span>
        </div>
        <Button type="submit" disabled={saving} className="!py-2.5 !px-4 shrink-0">
          {saving ? "..." : "Enregistrer"}
        </Button>
      </form>

      {saveSuccess && (
        <p className="text-xs font-semibold text-emerald-600 mt-2 flex items-center gap-1">
          <Icon.CheckCircle className="w-4 h-4" /> Réglage mis à jour !
        </p>
      )}
    </Card>
  );
}

// Carte "Gel de présence avant match" (ajoutée le 19/09/2026, demande de
// Max) — réglage global du nombre d'heures avant un match à partir duquel un
// joueur ayant répondu "présent" (titulaire OU réserve, voir RESERVE_STATUS
// dans lib/availability.js) ne peut plus changer sa réponse ni se
// désinscrire lui-même d'une place (voir isPresenceFrozen dans
// lib/availability.js, utilisé par AvailabilityButtons dans Availability.jsx
// et par CourtPanel.selfLeave) — il est alors invité à prévenir l'équipe sur
// WhatsApp ou à contacter l'administrateur, qui lui garde un accès total et
// immédiat via "Gérer les présences", à tout moment. Objectif : empêcher les
// désistements "faciles" de dernière minute qui dissuadaient les joueurs de
// se déclarer présents dès qu'ils risquaient de finir en réserve (ils
// redoutaient qu'un titulaire se désiste sur un coup de tête juste avant le
// match, en comptant sur eux pour combler la place). Ne s'applique jamais à
// un match "à une date inconnue" (statut "tbd"), ni — bien sûr — une fois le
// match commencé (déjà couvert séparément par le verrouillage post-match,
// voir claude/fix-presence-verrouillee-apres-match-2026-09-18.md). 0 =
// fonctionnalité désactivée (aucun gel). Même mécanique d'écriture que
// PresenceWindowSettingCard ci-dessus : settings/appConfig →
// presenceLockHours, répercuté en temps réel via useAppSettings.
function PresenceLockSettingCard({ value }) {
  const [hours, setHours] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setHours(String(value));
  }, [value]);

  const isDisabled = value <= 0;

  const handleSave = async (e) => {
    e.preventDefault();
    const n = parseInt(hours, 10);
    if (!Number.isFinite(n) || n < 0) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "appConfig"), { presenceLockHours: n }, { merge: true });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5 mb-6">
      <h3 className="font-semibold text-sm mb-1">Gel de présence avant match</h3>
      <p className="text-[11px] text-[var(--color-text-dim)] mb-4">
        Nombre d'heures avant un match à partir duquel un joueur présent (titulaire ou réserve) ne
        peut plus changer sa réponse ou se désinscrire lui-même — il doit alors prévenir l'équipe
        sur WhatsApp ou vous contacter directement. Vous gardez, vous, un accès total à tout moment
        via "Gérer les présences".{" "}
        {isDisabled
          ? "Actuellement : désactivé (aucun gel)."
          : `Actuellement : ${value}h avant chaque match.`}
      </p>

      <form onSubmit={handleSave} className="flex items-center gap-3 max-w-sm">
        <div className="relative flex-1">
          <input
            type="number"
            min="0"
            step="1"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className={inputClass}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--color-text-faint)]">
            heure{Number(hours) > 1 ? "s" : ""}
          </span>
        </div>
        <Button type="submit" disabled={saving} className="!py-2.5 !px-4 shrink-0">
          {saving ? "..." : "Enregistrer"}
        </Button>
      </form>

      {saveSuccess && (
        <p className="text-xs font-semibold text-emerald-600 mt-2 flex items-center gap-1">
          <Icon.CheckCircle className="w-4 h-4" /> Réglage mis à jour !
        </p>
      )}
    </Card>
  );
}

// Ajout du 02/09/2026 (soir) — gestion des abonnements créés par erreur (ex.
// tests de limites) ou arrivés à leur terme. Deux actions distinctes, bien
// séparées pour ne jamais les confondre :
// - "Clôturer" / "Réactiver" : archive l'abonnement (champ `archived` sur le
//   document) — masque UNIQUEMENT ses matchs dans l'onglet Matchs (voir
//   excludeArchivedSeasonMatches, lib/matchLogic.js). Rien n'est supprimé :
//   Stats, Comptabilité et cette page continuent de tout calculer
//   normalement dessus, et réactiver fait immédiatement réapparaître les
//   matchs. Bloqué tant qu'il reste un match NON terminé dans l'abonnement
//   (sinon un match à venir déjà payé d'avance disparaîtrait de "Prochains
//   matchs" pour les joueurs) — pas de garde-fou sur les impayés en
//   revanche : un message d'avertissement s'affiche mais n'empêche pas de
//   clôturer quand même (choix de Max, cas du joueur qui ne réglera jamais).
// - "Supprimer" : suppression DÉFINITIVE et en cascade de l'abonnement ET de
//   TOUS ses matchs (joueurs assignés, scores, présences et paiements
//   compris) — pour corriger un abonnement généré par erreur. Avertit
//   explicitement et exige une confirmation supplémentaire si de l'argent
//   réel (paiements déjà confirmés) est en jeu.
// - "Terrain" (ajouté le 14/09/2026) : renomme le(s) numéro(s) de terrain
//   d'un abonnement EN COURS, sans rien casser d'autre (créanciers, créance,
//   dates, récurrence inchangés). Ne touche jamais les matchs déjà joués —
//   seuls les matchs pas encore terminés changent de terrain, exactement
//   comme un vrai changement de terrain physique décidé à partir d'une
//   certaine date (voir RenameCourtsModal ci-dessous).
function AbonnementManagementSection({ abonnements, matches, players, clubs }) {
  const [tab, setTab] = useState("active"); // "active" | "archived"
  const [deleteTarget, setDeleteTarget] = useState(null); // info d'un abonnement, ou null
  const [renameTarget, setRenameTarget] = useState(null); // info d'un abonnement, ou null
  const [busyId, setBusyId] = useState(null);

  // Simplifié le 04/09/2026 : réutilise getUnpaidPastParticipations (source
  // unique de vérité, voir lib/stats.js) plutôt que de recalculer les
  // impayés ad hoc ici — même résultat (exemption par créancier de la
  // session, inchangée), mais plus aucun risque que ce calcul diverge un
  // jour de celui affiché ailleurs dans l'app (Ma comptabilité, Ce que je
  // dois, KPI admin ci-dessous).
  const unpaidItemsByMatchId = new Map();
  getUnpaidPastParticipations(matches, players).forEach((item) => {
    unpaidItemsByMatchId.set(item.matchId, (unpaidItemsByMatchId.get(item.matchId) || 0) + item.fee);
  });

  const withInfo = (abonnements || []).map((a) => {
    const related = matches.filter((m) => m.abonnementId === a.id);
    const finishedMatches = related.filter((m) => getMatchTiming(m) === "finished");
    const unfinishedCount = related.length - finishedMatches.length;
    const unpaidAmount = finishedMatches.reduce(
      (sum, m) => sum + (unpaidItemsByMatchId.get(m.id) || 0),
      0
    );
    const paidAmount = related.reduce((sum, m) => {
      const paidCount = participantsOf(m).filter((p) => p.paidStatus === "paid").length;
      return sum + paidCount * (m.matchFeePerPlayer || 0);
    }, 0);
    const club = clubs.find((c) => c.id === a.clubId);
    const creditorNames = (a.creditors || [])
      .map((c) => players.find((p) => p.id === c.playerId)?.name)
      .filter(Boolean);
    return {
      abonnement: a,
      relatedMatchIds: related.map((m) => m.id),
      matchCount: related.length,
      unfinishedCount,
      unpaidAmount,
      paidAmount,
      club,
      creditorNames,
    };
  });

  const activeList = withInfo.filter((x) => !x.abonnement.archived);
  const archivedList = withInfo.filter((x) => x.abonnement.archived);
  const visibleList = tab === "active" ? activeList : archivedList;

  const toggleArchive = async (info) => {
    const willArchive = !info.abonnement.archived;
    if (willArchive && info.unfinishedCount > 0) return; // bouton normalement désactivé, garde-fou
    const sure = window.confirm(
      willArchive
        ? `Clôturer cet abonnement ? Ses ${info.matchCount} match${info.matchCount > 1 ? "s" : ""} seront masqués de l'onglet Matchs pour tout le monde. Rien n'est supprimé — vous pourrez réactiver l'abonnement à tout moment.`
        : `Réactiver cet abonnement ? Ses ${info.matchCount} match${info.matchCount > 1 ? "s" : ""} redeviendront visibles dans l'onglet Matchs.`
    );
    if (!sure) return;
    setBusyId(info.abonnement.id);
    try {
      await updateDoc(doc(db, "abonnements", info.abonnement.id), { archived: willArchive });
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-1 mt-8">
        <h3 className="font-semibold text-sm text-white">Gestion des abonnements</h3>
      </div>
      <p className="text-[11px] text-[var(--color-text-faint)] mb-3">
        Clôturez un abonnement terminé et déjà réglé pour ranger ses matchs (rien n'est perdu), ou
        supprimez définitivement un abonnement créé par erreur (et tous ses matchs avec).
      </p>

      <div className="flex bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full p-1 w-fit mb-3">
        {[
          ["active", `Actifs (${activeList.length})`],
          ["archived", `Archivés (${archivedList.length})`],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
              tab === id ? "bg-sky-200 text-sky-900" : "text-[var(--color-text-dim)]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {visibleList.length === 0 ? (
        <EmptyState
          icon={<Icon.Calendar className="w-6 h-6" />}
          title={tab === "active" ? "Aucun abonnement actif" : "Aucun abonnement archivé"}
          subtitle={
            tab === "active"
              ? "Générez-en un avec le bouton « Créer un abonnement » en haut de page."
              : "Les abonnements clôturés apparaîtront ici."
          }
        />
      ) : (
        <div className="flex flex-col gap-2 mb-6">
          {visibleList.map((info) => {
            const { abonnement: a } = info;
            const busy = busyId === a.id;
            return (
              <Card key={a.id} className="p-4 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {a.label || info.club?.name || "Abonnement"}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-faint)] mt-0.5">
                      {[
                        info.club?.name,
                        (a.courts || []).length > 0 &&
                          `Terrain${a.courts.length > 1 ? "s" : ""} ${a.courts.join(", ")}`,
                        formatClaimPeriodLabel(a.startDate, a.endDate),
                        `${info.matchCount} match${info.matchCount > 1 ? "s" : ""}`,
                      ]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-faint)] mt-0.5">
                      {info.creditorNames.length > 0
                        ? `Créancier${info.creditorNames.length > 1 ? "s" : ""} : ${info.creditorNames.join(", ")}`
                        : "Aucun créancier"}
                    </p>
                  </div>
                </div>

                {tab === "active" && info.unpaidAmount > 0 && (
                  <p className="text-[11px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5">
                    ⚠️ {info.unpaidAmount.toLocaleString("fr-FR")} € encore en attente de paiement
                    sur des matchs terminés.
                  </p>
                )}
                {tab === "active" && info.unfinishedCount > 0 && (
                  <p className="text-[11px] text-[var(--color-text-faint)]">
                    Clôture indisponible : {info.unfinishedCount} match
                    {info.unfinishedCount > 1 ? "s" : ""} pas encore terminé
                    {info.unfinishedCount > 1 ? "s" : ""}.
                  </p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="secondary"
                    className="!py-1.5 !px-3 !text-xs"
                    disabled={busy || (tab === "active" && info.unfinishedCount > 0)}
                    onClick={() => toggleArchive(info)}
                  >
                    {tab === "active" ? "Clôturer" : "Réactiver"}
                  </Button>
                  <Button
                    variant="danger"
                    className="!py-1.5 !px-3 !text-xs"
                    disabled={busy}
                    onClick={() => setDeleteTarget(info)}
                  >
                    Supprimer
                  </Button>
                  {tab === "active" && (
                    <Button
                      variant="secondary"
                      className="!py-1.5 !px-3 !text-xs ml-auto"
                      disabled={busy}
                      onClick={() => setRenameTarget(info)}
                    >
                      <span className="flex items-center gap-1.5">
                        <Icon.Edit className="w-3.5 h-3.5" /> Terrain
                      </span>
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {deleteTarget && (
        <DeleteAbonnementConfirmModal info={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
      {renameTarget && (
        <RenameCourtsModal
          abonnement={renameTarget.abonnement}
          matches={matches}
          club={renameTarget.club}
          onClose={() => setRenameTarget(null)}
        />
      )}
    </>
  );
}

// Suppression en cascade — l'abonnement ET tous ses matchs. Les suppressions
// de matchs partent par lots de 450 (marge sous la limite Firestore de 500
// opérations par batch), suivies de la suppression du document abonnement
// lui-même. Si de l'argent réel est en jeu (paiements déjà confirmés sur au
// moins un des matchs), une case à cocher supplémentaire est exigée avant de
// pouvoir confirmer — pour qu'une perte d'historique de paiement soit
// toujours un choix délibéré, jamais un clic accidentel.
function DeleteAbonnementConfirmModal({ info, onClose }) {
  const { abonnement, matchCount, paidAmount, relatedMatchIds } = info;
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const claimsTotal = (abonnement.creditors || []).reduce(
    (s, c) => s + (c.advancedAmount || 0),
    0
  );
  const canDelete = paidAmount === 0 || confirmed;

  const doDelete = async () => {
    setDeleting(true);
    try {
      for (let i = 0; i < relatedMatchIds.length; i += 450) {
        const chunk = relatedMatchIds.slice(i, i + 450);
        const batch = writeBatch(db);
        chunk.forEach((id) => batch.delete(doc(db, "matches", id)));
        await batch.commit();
      }
      await deleteDoc(doc(db, "abonnements", abonnement.id));
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
      setDeleting(false);
    }
  };

  return (
    <Modal
      title="Supprimer cet abonnement ?"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Annuler
          </Button>
          <Button variant="danger" onClick={doDelete} disabled={!canDelete || deleting}>
            {deleting ? "Suppression..." : "Supprimer définitivement"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-text-dim)]">
        Cette action est irréversible. {matchCount} match{matchCount > 1 ? "s" : ""}
        {abonnement.label ? ` de « ${abonnement.label} »` : ""} seront définitivement supprimés
        (joueurs assignés, scores, présences et historique de paiement compris), ainsi que
        l'abonnement lui-même
        {claimsTotal > 0
          ? ` et sa créance de départ (${claimsTotal.toLocaleString("fr-FR")} €)`
          : ""}
        .
      </p>
      {paidAmount > 0 && (
        <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
          <p className="font-semibold mb-1.5">
            ⚠️ {paidAmount.toLocaleString("fr-FR")} € de paiements déjà confirmés seront perdus.
          </p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-3.5 h-3.5 accent-rose-600 shrink-0"
            />
            <span>Je comprends que ces paiements confirmés seront définitivement effacés.</span>
          </label>
        </div>
      )}
    </Modal>
  );
}

// Renommage du/des terrain(s) d'un abonnement EN COURS (ajouté le
// 14/09/2026, ex. "on passe du terrain 1 au terrain 2 à partir de
// janvier"). Contrairement à Clôturer/Supprimer, cette action ne touche
// JAMAIS l'historique : seuls les matchs PAS ENCORE terminés
// (`getMatchTiming(m) !== "finished"`, même critère que le reste de cette
// section) sont mis à jour. Les matchs déjà joués gardent leur ancien
// numéro de terrain pour toujours, puisque c'était réellement le cas ce
// jour-là — on ne réécrit jamais le passé. Créanciers, créance de départ,
// dates, récurrence et tarif de l'abonnement restent identiques : seuls
// `abonnement.courts` et, sur les matchs futurs concernés, `match.court`
// ET `match.location` (qui contient le texte "Terrain X" réellement
// affiché à l'écran, voir clubNameOnly/lib/utils.js) sont modifiés.
//
// La correspondance ancien → nouveau numéro se fait par position dans le
// tableau `courts` (même ordre que celui utilisé à la génération des
// matchs dans CreateSeasonModal.jsx) — on ne permet pas ici de changer le
// NOMBRE de terrains (ça resterait ambigu : quels matchs rattacher à un
// terrain ajouté/retiré ?), uniquement leurs numéros/noms.
function RenameCourtsModal({ abonnement, matches, club, onClose }) {
  const initialCourts =
    abonnement.courts && abonnement.courts.length > 0 ? abonnement.courts : ["1"];
  const [courtNumbers, setCourtNumbers] = useState(initialCourts);
  const [saving, setSaving] = useState(false);

  const setCourtNumberAt = (index, value) => {
    setCourtNumbers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const trimmedCourts = courtNumbers.map((c) => c.trim());
  const hasChange = trimmedCourts.some((c, i) => c !== initialCourts[i]);
  const canSubmit = trimmedCourts.every((c) => c.length > 0) && hasChange;

  const relatedMatches = matches.filter((m) => m.abonnementId === abonnement.id);
  const futureMatches = relatedMatches.filter((m) => getMatchTiming(m) !== "finished");
  const pastCount = relatedMatches.length - futureMatches.length;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const courtMap = new Map();
      initialCourts.forEach((oldCourt, i) => {
        const newCourt = trimmedCourts[i];
        if (newCourt && newCourt !== oldCourt) courtMap.set(String(oldCourt), newCourt);
      });

      const clubName = club?.name || "";
      const toUpdate = futureMatches.filter(
        (m) => m.court != null && courtMap.has(String(m.court))
      );

      for (let i = 0; i < toUpdate.length; i += 450) {
        const chunk = toUpdate.slice(i, i + 450);
        const batch = writeBatch(db);
        chunk.forEach((m) => {
          const newCourt = courtMap.get(String(m.court));
          batch.update(doc(db, "matches", m.id), {
            court: newCourt,
            location: `${clubName} — Terrain ${newCourt}`,
          });
        });
        await batch.commit();
      }

      await updateDoc(doc(db, "abonnements", abonnement.id), { courts: trimmedCourts });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Modifier le(s) terrain(s)"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Application..." : "Enregistrer"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-text-dim)] mb-3">
        Seuls les matchs pas encore joués changeront de terrain
        {futureMatches.length > 0
          ? ` (${futureMatches.length} match${futureMatches.length > 1 ? "s" : ""})`
          : ""}
        .{" "}
        {pastCount > 0 && (
          <>
            Les {pastCount} match{pastCount > 1 ? "s" : ""} déjà joué
            {pastCount > 1 ? "s" : ""} garde{pastCount > 1 ? "nt" : ""} son ancien terrain, comme
            c'était réellement le cas.{" "}
          </>
        )}
        Créanciers, créance de départ et règles de cet abonnement restent inchangés.
      </p>

      <Field
        label={`Numéro${courtNumbers.length > 1 ? "s" : ""} de terrain (${courtNumbers.length} case${courtNumbers.length > 1 ? "s" : ""})`}
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
          Pour changer le nombre de terrains de cet abonnement, passez plutôt par « Clôturer » puis
          « Créer un abonnement ».
        </p>
      </Field>

      {futureMatches.length === 0 && (
        <p className="text-[11px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5">
          Aucun match à venir sur cet abonnement : seul son intitulé (« Gestion des abonnements »
          ci-dessus) sera mis à jour, aucun match ne sera modifié.
        </p>
      )}
    </Modal>
  );
}

export function AdminView() {
  const {
    players,
    matches,
    abonnements,
    clubs,
    gameCenterEnabled,
    maintenanceEnabled,
    presenceWindowDays,
    rankingEnabled,
    presenceLockHours,
  } = useAppData();
  const [showCreateSeason, setShowCreateSeason] = useState(false);
  const [showManageClubs, setShowManageClubs] = useState(false);
  // Créance en cours d'édition — { creditorId, creditorName, abonnement }.
  // Même modale que celle utilisée par le créancier lui-même depuis "Ma
  // comptabilité", pour que les deux parcours restent parfaitement cohérents.
  const [editingClaim, setEditingClaim] = useState(null);
  // Créancier dont on consulte la comptabilité complète en lecture seule
  // (04/09/2026) — clic sur un nom dans "Soldes des créanciers" ci-dessous,
  // ouvre CreditorAccountingModal (copie visuelle exacte de "Ma comptabilité"
  // pour ce créancier, sans aucune action possible depuis ici).
  const [viewingCreditor, setViewingCreditor] = useState(null);
  // Corrigé le 02/09/2026 (audit paiements) : inclut aussi un joueur dont la
  // case "Créancier" a depuis été décochée mais qui a réellement financé un
  // abonnement (présent dans `abonnement.creditors[]`) — sinon il disparaît
  // à tort de cette liste alors qu'il a encore un solde/une créance réels.
  const creditorIds = getAllCreditorPlayerIds(players, abonnements);
  const creditors = players.filter((p) => creditorIds.has(p.id));
  // Solde = uniquement le total réellement perçu via les matchs, calculé
  // automatiquement. Le concept d'"ajustement manuel" a été retiré de toute
  // l'app le 30/08/2026 (jugé pas instinctif, source de confusion) — toute
  // correction passe désormais uniquement par "Marquer payé" sur le match
  // concerné, depuis "Ma comptabilité" ou l'onglet Matchs.
  const creditorRawTotals = new Map(
    creditors.map((c) => [c.id, getCreditorAccounting(c.id, matches, players).totalPaidAllTime])
  );
  const totalBalance = [...creditorRawTotals.values()].reduce((s, v) => s + v, 0);
  const upcomingCount = matches.filter((m) => getMatchTiming(m) !== "finished").length;
  // Corrigé le 02/09/2026 (audit paiements) : ce chiffre comptait TOUS les
  // participants non "paid" de TOUS les matchs "Saison", y compris les
  // matchs pas encore joués (rien à payer avant qu'ils aient lieu) et les
  // places couvertes par un créancier de la session (celles-ci ne passent
  // jamais par "Marquer payé", le bouton y est désactivé, donc `paidStatus`
  // y reste "unpaid" pour toujours et gonflait ce compteur en continu, sans
  // rapport avec de vrais impayés). Simplifié le 04/09/2026 : réutilise
  // directement `getUnpaidPastParticipations` (lib/stats.js) au lieu de
  // dupliquer le même calcul ici — une seule source de vérité, cohérente
  // avec le détail nominatif de "Ma comptabilité" (AccountingView.jsx →
  // unpaidPast) et avec "Ce que je dois" (StatsView.jsx).
  const unpaidCount = getUnpaidPastParticipations(matches, players).length;

  const stats = [
    { label: "Joueurs", value: players.length, icon: Icon.Users },
    { label: "Créanciers", value: creditors.length, icon: Icon.Shield },
    { label: "Matchs à venir", value: upcomingCount, icon: Icon.Calendar },
    { label: "Paiements en attente", value: unpaidCount, icon: Icon.Coin },
  ];

  return (
    <div className="px-4 pt-4 pb-28">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="pm-display font-bold text-xl text-white">Administration</h2>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            className="!py-2 !px-3"
            onClick={() => setShowManageClubs(true)}
          >
            <span className="flex items-center gap-1.5">
              <Icon.Shield className="w-4 h-4" /> Clubs
            </span>
          </Button>
          <Button
            variant="secondary"
            className="!py-2 !px-3"
            onClick={() => setShowCreateSeason(true)}
          >
            <span className="flex items-center gap-1.5">
              <Icon.Calendar className="w-4 h-4" /> Créer un abonnement
            </span>
          </Button>
        </div>
      </div>

      <RankingDivergenceCard players={players} />

      {/* Outil consultatif "Liens entre joueurs" (replié par défaut) : qui a
          joué avec / contre qui, préférences confidentielles, simulateur de
          répartition. Ne modifie jamais une composition. */}
      <PlayerLinksCard players={players} matches={matches} />

      <MaintenanceSettingCard enabled={maintenanceEnabled} />
      <GameCenterSettingCard enabled={gameCenterEnabled} />
      <RankingSettingCard enabled={rankingEnabled} />
      <PresenceWindowSettingCard value={presenceWindowDays} />
      <PresenceLockSettingCard value={presenceLockHours} />
      <RankingRecalcCard players={players} matches={matches} />

      <div className="grid grid-cols-2 gap-3 mb-6">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <s.icon className="w-4 h-4 text-[var(--color-lime)] mb-2" />
            <p className="pm-display text-2xl font-extrabold">{s.value}</p>
            <p className="text-xs text-[var(--color-text-dim)]">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm text-white">
          Soldes des créanciers
        </h3>
        <span className="pm-mono text-sm font-bold text-white">
          Total : {totalBalance.toLocaleString("fr-FR")} €
        </span>
      </div>
      <p className="text-[11px] text-[var(--color-text-faint)] mb-3">
        « Créance de départ » = investissement initial, défini par abonnement lors de sa
        génération (un créancier peut cumuler plusieurs abonnements). « Solde » = total perçu via
        les matchs, calculé automatiquement.
      </p>

      {creditors.length === 0 ? (
        <EmptyState
          icon={<Icon.Coin className="w-6 h-6" />}
          title="Aucun créancier configuré"
          subtitle="Un joueur devient créancier automatiquement en étant sélectionné à la génération d'un abonnement, ou manuellement depuis l'onglet Joueurs."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {[...creditors]
            .sort((a, b) => (creditorRawTotals.get(b.id) || 0) - (creditorRawTotals.get(a.id) || 0))
            .map((c) => {
              const { claims, total } = getCreditorClaims(c.id, abonnements, matches);

              return (
                <Card key={c.id} className="p-4 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setViewingCreditor(c)}
                    className="flex items-center gap-3 text-left -m-1 p-1 rounded-xl hover:bg-[var(--color-surface-2)] transition-colors"
                    title="Voir sa comptabilité complète (lecture seule)"
                  >
                    <PlayerAvatar player={c} size={40} />
                    <span className="flex-1 font-semibold text-sm">{c.name}</span>
                    <Icon.Chevron className="w-4 h-4 text-[var(--color-text-faint)] shrink-0" />
                  </button>

                  <div className="pl-[52px] flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--color-text-dim)]">
                        Créance de départ
                        {claims.length > 1 ? ` (${claims.length} abonnements)` : ""}
                      </span>
                      <span className="pm-mono text-sm font-bold text-sky-600">
                        {total.toLocaleString("fr-FR")} €
                      </span>
                    </div>
                    {claims.length === 0 ? (
                      <p className="text-[10px] text-[var(--color-text-faint)]">
                        Pas encore associé à un abonnement.
                      </p>
                    ) : (
                      claims.map((claim) => {
                        const club = clubs.find((cl) => cl.id === claim.clubId);
                        const periodLabel = formatClaimPeriodLabel(claim.startDate, claim.endDate);
                        return (
                          <div
                            key={claim.abonnementId}
                            className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[var(--color-surface-2)]"
                          >
                            <span className="text-[10px] text-[var(--color-text-faint)] min-w-0 truncate">
                              {[
                                claim.label || club?.name,
                                periodLabel,
                                `${claim.coveredMatches} match${claim.coveredMatches > 1 ? "s" : ""}`,
                              ]
                                .filter(Boolean)
                                .join("  ·  ")}
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              <span className="pm-mono text-xs font-bold">
                                {claim.amount.toLocaleString("fr-FR")} €
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingClaim({
                                    creditorId: c.id,
                                    creditorName: c.name,
                                    abonnement: abonnements.find((a) => a.id === claim.abonnementId),
                                  })
                                }
                                className="p-1 -m-1 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-lime)] transition-colors"
                                title="Modifier cette créance"
                              >
                                <Icon.Settings className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="flex items-center justify-between pl-[52px]">
                    <span className="text-xs text-[var(--color-text-dim)]">
                      Solde (perçu via les matchs)
                    </span>
                    <span className="pm-mono text-sm font-bold text-[var(--color-lime)]">
                      {(creditorRawTotals.get(c.id) || 0).toLocaleString("fr-FR")} €
                    </span>
                  </div>
                </Card>
              );
            })}
        </div>
      )}

      <AbonnementManagementSection
        abonnements={abonnements}
        matches={matches}
        players={players}
        clubs={clubs}
      />

      {showCreateSeason && (
        <CreateSeasonModal onClose={() => setShowCreateSeason(false)} />
      )}
      {showManageClubs && <ManageClubsModal onClose={() => setShowManageClubs(false)} />}
      {editingClaim && (
        <ClaimSettingsModal
          creditorId={editingClaim.creditorId}
          creditorName={editingClaim.creditorName}
          abonnement={editingClaim.abonnement}
          onClose={() => setEditingClaim(null)}
        />
      )}
      {viewingCreditor && (
        <CreditorAccountingModal
          creditor={viewingCreditor}
          onClose={() => setViewingCreditor(null)}
        />
      )}
    </div>
  );
}
