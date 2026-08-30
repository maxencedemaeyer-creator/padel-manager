// ─────────────────────────────────────────────────────────────────────────
// Onglet "Compta" (créanciers uniquement) — dashboard 5 blocs : alerte,
// créance de départ, consommation perso, remboursements, synthèse.
// Volontairement sur fond clair (au lieu du bleu du reste de l'app) pour
// un meilleur contraste sur ces montants financiers.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { cn, formatDateFR, formatClaimPeriodLabel } from "../lib/utils";
import { getMatchTiming } from "../lib/matchLogic";
import { getCreditorAccounting, getCoveredMatchesEstimate } from "../lib/stats";
import { useAppData } from "../context/AppContext";
import Icon from "../components/icons/Icon";
import { Card, EmptyState } from "../components/ui";
import { ClaimSettingsModal } from "../components/accounting/ClaimSettingsModal";

export function AccountingView() {
  const { connectedPlayer, players, matches } = useAppData();
  const [showClaimSettings, setShowClaimSettings] = useState(false);
  // Détail des impayés : clé de la ligne en attente de confirmation (clic 1)
  // puis clé de la ligne en cours d'écriture Firestore (clic 2 confirmé).
  const [confirmingKey, setConfirmingKey] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  const { totalPaidPastMatches, selfReimbursed, paymentsReceived } = getCreditorAccounting(
    connectedPlayer.id,
    matches
  );
  const advanced = connectedPlayer.advancedAmount || 0;

  // Informations indicatives de la créance de départ : période couverte,
  // nombre de terrains, et nombre de matchs couverts calculé automatiquement
  // à partir des séances réellement enregistrées sur cette période.
  const claimPeriodLabel = formatClaimPeriodLabel(
    connectedPlayer.advancedAmountPeriodStart,
    connectedPlayer.advancedAmountPeriodEnd
  );
  const claimCourts = connectedPlayer.advancedAmountCourts;
  const coveredMatches = getCoveredMatchesEstimate(connectedPlayer, matches);
  const hasClaimDetails = Boolean(claimPeriodLabel) || claimCourts != null;

  const creditorIds = new Set(players.filter((p) => p.isCreditor).map((p) => p.id));
  const seasonMatches = matches.filter((m) => m.type === "Saison");

  // Bloc 3 — auto-remboursement : mes propres matchs, joués + à venir. On
  // garde aussi le nombre de matchs (pas seulement le montant) pour
  // l'afficher en petit sous chaque montant, sans que le créancier ait à
  // les recompter lui-même.
  const selfPastMatchesCount = seasonMatches.filter(
    (m) =>
      getMatchTiming(m) === "finished" &&
      (m.participants || []).some((p) => p.playerId === connectedPlayer.id)
  ).length;
  const selfUpcomingMatches = seasonMatches.filter(
    (m) =>
      getMatchTiming(m) !== "finished" &&
      (m.participants || []).some((p) => p.playerId === connectedPlayer.id)
  );
  const selfUpcomingValue = selfUpcomingMatches.reduce(
    (sum, m) => sum + (m.matchFeePerPlayer || 0),
    0
  );
  const selfUpcomingCount = selfUpcomingMatches.length;
  const selfSeasonTotal = selfReimbursed + selfUpcomingValue;
  const selfSeasonCount = selfPastMatchesCount + selfUpcomingCount;

  // Bloc 1 — alerte : impayés sur les matchs déjà joués (hors créanciers,
  // exemptés). On garde ici le détail complet (match + joueur) et pas
  // seulement le total, pour pouvoir afficher la liste nominative ci-dessous
  // et marquer un paiement directement depuis "Ma comptabilité", sans devoir
  // rouvrir chaque match dans l'onglet Matchs.
  const unpaidPast = seasonMatches
    .filter((m) => getMatchTiming(m) === "finished")
    .flatMap((m) =>
      (m.participants || [])
        .filter((p) => !creditorIds.has(p.playerId) && p.paidStatus !== "paid")
        .map((p) => ({
          key: `${m.id}-${p.playerId}`,
          matchId: m.id,
          playerId: p.playerId,
          name: p.name,
          fee: m.matchFeePerPlayer || 0,
          date: m.date,
          location: m.location || "Terrain",
        }))
    )
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const unpaidAmount = unpaidPast.reduce((s, p) => s + p.fee, 0);
  const unpaidCount = unpaidPast.length;
  const allSettled = unpaidCount === 0;

  // Bloc 5 — synthèse : créance − (ma saison) − (déjà perçu des autres).
  const remainingNet = advanced - selfSeasonTotal - totalPaidPastMatches;

  // Marque le joueur concerné comme ayant payé sa part de ce match, avec
  // "moi" (le créancier connecté) comme créancier destinataire — pas besoin
  // de demander "à quel créancier ?" ici puisque cette vue est déjà celle
  // d'un seul créancier sur sa propre créance.
  const markAsPaid = async (item) => {
    setSavingKey(item.key);
    try {
      const match = matches.find((m) => m.id === item.matchId);
      if (!match) return;
      const updatedParticipants = (match.participants || []).map((p) =>
        p.playerId === item.playerId
          ? { ...p, paidStatus: "paid", creditorId: connectedPlayer.id }
          : p
      );
      await updateDoc(doc(db, "matches", item.matchId), {
        participants: updatedParticipants,
      });
      setConfirmingKey(null);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="min-h-screen px-4 pt-4 pb-28" style={{ backgroundColor: "#F8FAFC" }}>
      <h2 className="pm-display font-bold text-xl mb-1" style={{ color: "#1F2937" }}>
        Ma comptabilité
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        Calculé automatiquement à partir des matchs et paiements enregistrés — aucun
        moyen de paiement externe n'est utilisé.
      </p>

      {/* 1. Bannière d'alerte / suivi des paiements */}
      <div
        className={cn(
          "flex items-start gap-3 p-4 rounded-2xl border",
          allSettled ? "bg-emerald-50 border-emerald-200 mb-5" : "bg-orange-50 border-orange-200 mb-3"
        )}
      >
        {allSettled ? (
          <Icon.CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <Icon.AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
        )}
        <p className={cn("text-sm font-medium", allSettled ? "text-emerald-800" : "text-orange-800")}>
          {allSettled
            ? "Tout est à jour ! Tous les matchs passés ont été réglés."
            : `Attention : ${unpaidAmount.toLocaleString("fr-FR")} € sont actuellement en attente de paiement pour des matchs déjà joués (${unpaidCount} joueur${unpaidCount > 1 ? "s" : ""} n'${unpaidCount > 1 ? "ont" : "a"} pas encore réglé).`}
        </p>
      </div>

      {/* 1bis. Détail nominatif des impayés — qui doit quoi, pour quel match,
          avec confirmation de paiement en 2 clics directement depuis cette
          liste (pas besoin de rouvrir le match dans l'onglet Matchs). */}
      {!allSettled && (
        <div className="flex flex-col gap-2 mb-5">
          {unpaidPast.map((item) => {
            const isConfirming = confirmingKey === item.key;
            const isSaving = savingKey === item.key;
            return (
              <div
                key={item.key}
                className="bg-white border border-orange-200/70 rounded-2xl p-3.5 flex items-center gap-3"
              >
                <span className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                  <Icon.AlertCircle className="w-4 h-4 text-orange-500" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate">{item.name}</span>
                  <span className="block text-xs text-slate-400 truncate">
                    {formatDateFR(item.date)} · {item.location}
                  </span>
                </span>
                <span className="pm-mono font-bold text-orange-600 text-sm shrink-0">
                  {item.fee.toLocaleString("fr-FR")} €
                </span>
                {isConfirming ? (
                  <span className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => markAsPaid(item)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {isSaving ? "…" : "Confirmer"}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => setConfirmingKey(null)}
                      className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 text-xs font-medium disabled:opacity-50"
                    >
                      Annuler
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingKey(item.key)}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                  >
                    Marquer payé
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 2. Créance de départ — modifiable par le créancier lui-même ou par
          un administrateur, via la roulette de réglages. */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon.Wallet className="w-5 h-5 text-sky-600" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Créance de départ
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowClaimSettings(true)}
            className="p-1.5 -m-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
            title="Modifier la créance de départ"
          >
            <Icon.Settings className="w-4 h-4" />
          </button>
        </div>
        <p className="pm-display text-3xl font-extrabold" style={{ color: "#1F2937" }}>
          {advanced.toLocaleString("fr-FR")} €
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Votre investissement initial pour la réservation du terrain annuel.
        </p>

        {hasClaimDetails && (
          <p className="text-[10px] text-slate-400 mt-2.5 pt-2.5 border-t border-slate-100">
            {[
              claimPeriodLabel,
              claimCourts != null &&
                `${claimCourts} terrain${claimCourts > 1 ? "s" : ""} couvert${claimCourts > 1 ? "s" : ""}`,
              coveredMatches != null &&
                `≈ ${coveredMatches} match${coveredMatches > 1 ? "s" : ""} couvert${coveredMatches > 1 ? "s" : ""}`,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        )}
      </div>

      {showClaimSettings && (
        <ClaimSettingsModal
          creditor={connectedPlayer}
          onClose={() => setShowClaimSettings(false)}
        />
      )}

      {/* 3. Consommation personnelle (auto-remboursement) — un seul bloc,
          divisé en trois colonnes : le coût total de la saison mis en
          évidence à gauche, puis le détail matchs déjà joués / à venir.
          Toujours 3 colonnes côte à côte, y compris sur mobile (grid-cols-3
          sans variante sm:) — polices et paddings réduits en dessous du
          point de rupture sm: pour que ça tienne sans passer à la ligne. */}
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Ma consommation personnelle
      </p>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-5 overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <div className="p-2 sm:p-4" style={{ backgroundColor: "#1F2937" }}>
            <Icon.Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/70 mb-1 sm:mb-2" />
            <p className="pm-display text-sm sm:text-2xl font-extrabold text-white leading-tight">
              {selfSeasonTotal.toLocaleString("fr-FR")} €
            </p>
            <p className="text-[9px] sm:text-xs text-white/70 mt-0.5 leading-tight">
              Coût total estimé de ma saison
            </p>
            <p className="text-[8px] sm:text-[10px] text-white/40 mt-1">
              {selfSeasonCount} match{selfSeasonCount > 1 ? "s" : ""}
            </p>
          </div>
          <div className="p-2 sm:p-4">
            <Icon.CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 mb-1 sm:mb-2" />
            <p
              className="pm-display text-sm sm:text-xl font-extrabold leading-tight"
              style={{ color: "#1F2937" }}
            >
              {selfReimbursed.toLocaleString("fr-FR")} €
            </p>
            <p className="text-[9px] sm:text-xs text-slate-500 mt-0.5 leading-tight">
              Mes matchs déjà joués
            </p>
            <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1">
              {selfPastMatchesCount} match{selfPastMatchesCount > 1 ? "s" : ""}
            </p>
          </div>
          <div className="p-2 sm:p-4">
            <Icon.Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-600 mb-1 sm:mb-2" />
            <p
              className="pm-display text-sm sm:text-xl font-extrabold leading-tight"
              style={{ color: "#1F2937" }}
            >
              {selfUpcomingValue.toLocaleString("fr-FR")} €
            </p>
            <p className="text-[9px] sm:text-xs text-slate-500 mt-0.5 leading-tight">
              Mes matchs à venir
            </p>
            <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1">
              {selfUpcomingCount} match{selfUpcomingCount > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Remboursements par les tiers — un seul chiffre, factuel : ce qui
          a déjà été réellement encaissé. L'ancienne case "À percevoir
          (engagé, matchs à venir)" a été retirée (30/08/2026) : elle
          comptait tous les non-créanciers de tous les matchs à venir, sans
          savoir lequel d'entre eux paiera réellement CE créancier-ci (le
          creditorId n'existe qu'une fois le paiement confirmé) — un chiffre
          structurellement faux dès qu'il y a plusieurs créanciers, et
          trompeur même à un seul. La vraie réponse à "combien vais-je
          encore toucher au total" est le bloc "Reste net à récupérer"
          plus bas, qui se déduit de la créance et non d'un comptage
          de joueurs. */}
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Remboursements par les autres joueurs
      </p>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 mb-5">
        <Icon.CheckCircle className="w-4 h-4 text-emerald-600 mb-2" />
        <p className="pm-display text-xl font-extrabold" style={{ color: "#1F2937" }}>
          {totalPaidPastMatches.toLocaleString("fr-FR")} €
        </p>
        <p className="text-xs text-slate-500 mt-0.5">Déjà perçu (matchs passés)</p>
      </div>

      {/* 5. Synthèse — reste net à récupérer. Le détail du calcul est affiché
          sous le montant (créance − ma saison − déjà perçu) pour que ce soit
          vérifiable d'un coup d'œil : si ce montant paraît faux, c'est
          presque toujours que la "Créance de départ" ci-dessus n'a pas
          encore été renseignée (elle vaut 0 par défaut tant qu'elle n'est
          pas éditée via la roulette de réglages).
          Note (30/08/2026) : le concept d'"ajustement manuel" a été retiré
          de toute l'app à la demande de l'utilisateur (bloc jugé pas
          instinctif, source de confusion — voir notes du projet). Toute
          correction passe désormais uniquement par "Marquer payé" sur le
          match concerné, dans la liste des impayés plus haut. */}
      <div
        className="rounded-2xl shadow-md p-5 mb-6 text-white"
        style={{ background: "linear-gradient(135deg, #0284C7, #4338CA)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Icon.Wallet className="w-5 h-5" />
          <span className="text-xs font-semibold uppercase tracking-wide text-white/70">
            Reste net à récupérer
          </span>
        </div>
        <p className="pm-display text-3xl font-extrabold">
          {remainingNet.toLocaleString("fr-FR")} €
        </p>
        <p className="text-xs text-white/80 mt-2">
          Ce montant représente la somme brute que vous devez encore recevoir en
          liquide/virement pour clôturer votre créance tout en couvrant votre propre
          saison.
        </p>
        <p className="text-[11px] text-white/70 mt-3 pt-3 border-t border-white/20 leading-relaxed">
          Créance {advanced.toLocaleString("fr-FR")} € − Ma saison{" "}
          {selfSeasonTotal.toLocaleString("fr-FR")} € − Déjà perçu{" "}
          {totalPaidPastMatches.toLocaleString("fr-FR")} €
        </p>
      </div>

      <h3 className="font-semibold text-sm text-slate-500 mb-3">
        Paiements reçus (matchs passés)
      </h3>
      {paymentsReceived.length === 0 ? (
        <EmptyState
          icon={<Icon.Coin className="w-6 h-6" />}
          title="Aucun paiement enregistré pour l'instant"
          subtitle="Les paiements que vous confirmez depuis l'onglet Matchs apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {paymentsReceived.map((p, i) => (
            <Card key={i} className="p-3.5 flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate">{p.name}</span>
                <span className="block text-xs text-[var(--color-text-faint)]">
                  {formatDateFR(p.date)}
                </span>
              </span>
              <span className="pm-mono font-bold text-emerald-600 text-sm shrink-0">
                +{p.fee.toLocaleString("fr-FR")} €
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}// ─────────────────────────────────────────────────────────────────────────
// Onglet "Compta" (créanciers uniquement) — dashboard 5 blocs : alerte,
// créance de départ, consommation perso, remboursements, synthèse.
// Volontairement sur fond clair (au lieu du bleu du reste de l'app) pour
// un meilleur contraste sur ces montants financiers.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { cn, formatDateFR, formatClaimPeriodLabel, parseFeeInput } from "../lib/utils";
import { getMatchTiming } from "../lib/matchLogic";
import { getCreditorAccounting, getCoveredMatchesEstimate } from "../lib/stats";
import { useAppData } from "../context/AppContext";
import Icon from "../components/icons/Icon";
import { Card, EmptyState } from "../components/ui";
import { ClaimSettingsModal } from "../components/accounting/ClaimSettingsModal";

// ─────────────────────────────────────────────────────────────────────────
// Champ d'édition directe de l'ajustement manuel, depuis "Ma comptabilité"
// (plus besoin de passer par l'onglet Administration pour cette correction).
// Écrit la valeur BRUTE de `manualAdjustment` telle quelle — contrairement à
// l'ancien champ "Solde (perçu + ajustement)" de l'Administration, qui
// affichait un total combiné (perçu + ajustement) et recalculait la
// différence : c'est cette indirection qui avait causé la confusion du
// 30/08/2026 (1300 € saisis ici par erreur pour représenter la créance).
// ─────────────────────────────────────────────────────────────────────────
function ManualAdjustmentEditor({ playerId, value }) {
  const [text, setText] = useState(String(value || 0));
  const [saving, setSaving] = useState(false);

  const save = async (newValue) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "players", playerId), { manualAdjustment: newValue });
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBlur = () => {
    const parsed = parseFeeInput(text);
    if (parsed == null) {
      setText(String(value || 0));
      return;
    }
    setText(String(parsed));
    if (parsed !== (value || 0)) save(parsed);
  };

  return (
    <div className="flex items-center gap-2 shrink-0">
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        disabled={saving}
        className="pm-mono w-20 text-right text-sm font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-sky-400 disabled:opacity-50"
      />
      <span className="text-sm font-bold text-slate-400">€</span>
      {value !== 0 && (
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setText("0");
            save(0);
          }}
          className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 underline disabled:opacity-50"
        >
          Réinitialiser
        </button>
      )}
    </div>
  );
}

export function AccountingView() {
  const { connectedPlayer, players, matches } = useAppData();
  const [showClaimSettings, setShowClaimSettings] = useState(false);
  // Détail des impayés : clé de la ligne en attente de confirmation (clic 1)
  // puis clé de la ligne en cours d'écriture Firestore (clic 2 confirmé).
  const [confirmingKey, setConfirmingKey] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  const { totalPaidPastMatches, selfReimbursed, paymentsReceived } = getCreditorAccounting(
    connectedPlayer.id,
    matches
  );
  const advanced = connectedPlayer.advancedAmount || 0;
  // Correction manuelle éventuellement appliquée par l'administrateur (onglet
  // Administration, champ "Solde"). Avant ce correctif, ce montant n'était
  // visible que côté admin : le créancier voyait un "reste à récupérer" qui
  // ne correspondait pas à ce que l'admin avait corrigé de son côté.
  const manualAdjustment = connectedPlayer.manualAdjustment || 0;

  // Informations indicatives de la créance de départ : période couverte,
  // nombre de terrains, et nombre de matchs couverts calculé automatiquement
  // à partir des séances réellement enregistrées sur cette période.
  const claimPeriodLabel = formatClaimPeriodLabel(
    connectedPlayer.advancedAmountPeriodStart,
    connectedPlayer.advancedAmountPeriodEnd
  );
  const claimCourts = connectedPlayer.advancedAmountCourts;
  const coveredMatches = getCoveredMatchesEstimate(connectedPlayer, matches);
  const hasClaimDetails = Boolean(claimPeriodLabel) || claimCourts != null;

  const creditorIds = new Set(players.filter((p) => p.isCreditor).map((p) => p.id));
  const seasonMatches = matches.filter((m) => m.type === "Saison");

  // Bloc 3 — auto-remboursement : mes propres matchs, joués + à venir. On
  // garde aussi le nombre de matchs (pas seulement le montant) pour
  // l'afficher en petit sous chaque montant, sans que le créancier ait à
  // les recompter lui-même.
  const selfPastMatchesCount = seasonMatches.filter(
    (m) =>
      getMatchTiming(m) === "finished" &&
      (m.participants || []).some((p) => p.playerId === connectedPlayer.id)
  ).length;
  const selfUpcomingMatches = seasonMatches.filter(
    (m) =>
      getMatchTiming(m) !== "finished" &&
      (m.participants || []).some((p) => p.playerId === connectedPlayer.id)
  );
  const selfUpcomingValue = selfUpcomingMatches.reduce(
    (sum, m) => sum + (m.matchFeePerPlayer || 0),
    0
  );
  const selfUpcomingCount = selfUpcomingMatches.length;
  const selfSeasonTotal = selfReimbursed + selfUpcomingValue;
  const selfSeasonCount = selfPastMatchesCount + selfUpcomingCount;

  // Bloc 1 — alerte : impayés sur les matchs déjà joués (hors créanciers,
  // exemptés). On garde ici le détail complet (match + joueur) et pas
  // seulement le total, pour pouvoir afficher la liste nominative ci-dessous
  // et marquer un paiement directement depuis "Ma comptabilité", sans devoir
  // rouvrir chaque match dans l'onglet Matchs.
  const unpaidPast = seasonMatches
    .filter((m) => getMatchTiming(m) === "finished")
    .flatMap((m) =>
      (m.participants || [])
        .filter((p) => !creditorIds.has(p.playerId) && p.paidStatus !== "paid")
        .map((p) => ({
          key: `${m.id}-${p.playerId}`,
          matchId: m.id,
          playerId: p.playerId,
          name: p.name,
          fee: m.matchFeePerPlayer || 0,
          date: m.date,
          location: m.location || "Terrain",
        }))
    )
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const unpaidAmount = unpaidPast.reduce((s, p) => s + p.fee, 0);
  const unpaidCount = unpaidPast.length;
  const allSettled = unpaidCount === 0;

  // Bloc 5 — synthèse : créance − (ma saison) − (déjà perçu des autres) −
  // (correction manuelle de l'admin, positive ou négative).
  const remainingNet = advanced - selfSeasonTotal - totalPaidPastMatches - manualAdjustment;

  // Marque le joueur concerné comme ayant payé sa part de ce match, avec
  // "moi" (le créancier connecté) comme créancier destinataire — pas besoin
  // de demander "à quel créancier ?" ici puisque cette vue est déjà celle
  // d'un seul créancier sur sa propre créance.
  const markAsPaid = async (item) => {
    setSavingKey(item.key);
    try {
      const match = matches.find((m) => m.id === item.matchId);
      if (!match) return;
      const updatedParticipants = (match.participants || []).map((p) =>
        p.playerId === item.playerId
          ? { ...p, paidStatus: "paid", creditorId: connectedPlayer.id }
          : p
      );
      await updateDoc(doc(db, "matches", item.matchId), {
        participants: updatedParticipants,
      });
      setConfirmingKey(null);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="min-h-screen px-4 pt-4 pb-28" style={{ backgroundColor: "#F8FAFC" }}>
      <h2 className="pm-display font-bold text-xl mb-1" style={{ color: "#1F2937" }}>
        Ma comptabilité
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        Calculé automatiquement à partir des matchs et paiements enregistrés — aucun
        moyen de paiement externe n'est utilisé.
      </p>

      {/* 1. Bannière d'alerte / suivi des paiements */}
      <div
        className={cn(
          "flex items-start gap-3 p-4 rounded-2xl border",
          allSettled ? "bg-emerald-50 border-emerald-200 mb-5" : "bg-orange-50 border-orange-200 mb-3"
        )}
      >
        {allSettled ? (
          <Icon.CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <Icon.AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
        )}
        <p className={cn("text-sm font-medium", allSettled ? "text-emerald-800" : "text-orange-800")}>
          {allSettled
            ? "Tout est à jour ! Tous les matchs passés ont été réglés."
            : `Attention : ${unpaidAmount.toLocaleString("fr-FR")} € sont actuellement en attente de paiement pour des matchs déjà joués (${unpaidCount} joueur${unpaidCount > 1 ? "s" : ""} n'${unpaidCount > 1 ? "ont" : "a"} pas encore réglé).`}
        </p>
      </div>

      {/* 1bis. Détail nominatif des impayés — qui doit quoi, pour quel match,
          avec confirmation de paiement en 2 clics directement depuis cette
          liste (pas besoin de rouvrir le match dans l'onglet Matchs). */}
      {!allSettled && (
        <div className="flex flex-col gap-2 mb-5">
          {unpaidPast.map((item) => {
            const isConfirming = confirmingKey === item.key;
            const isSaving = savingKey === item.key;
            return (
              <div
                key={item.key}
                className="bg-white border border-orange-200/70 rounded-2xl p-3.5 flex items-center gap-3"
              >
                <span className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                  <Icon.AlertCircle className="w-4 h-4 text-orange-500" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate">{item.name}</span>
                  <span className="block text-xs text-slate-400 truncate">
                    {formatDateFR(item.date)} · {item.location}
                  </span>
                </span>
                <span className="pm-mono font-bold text-orange-600 text-sm shrink-0">
                  {item.fee.toLocaleString("fr-FR")} €
                </span>
                {isConfirming ? (
                  <span className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => markAsPaid(item)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {isSaving ? "…" : "Confirmer"}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => setConfirmingKey(null)}
                      className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 text-xs font-medium disabled:opacity-50"
                    >
                      Annuler
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingKey(item.key)}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                  >
                    Marquer payé
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 2. Créance de départ — modifiable par le créancier lui-même ou par
          un administrateur, via la roulette de réglages. */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon.Wallet className="w-5 h-5 text-sky-600" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Créance de départ
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowClaimSettings(true)}
            className="p-1.5 -m-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
            title="Modifier la créance de départ"
          >
            <Icon.Settings className="w-4 h-4" />
          </button>
        </div>
        <p className="pm-display text-3xl font-extrabold" style={{ color: "#1F2937" }}>
          {advanced.toLocaleString("fr-FR")} €
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Votre investissement initial pour la réservation du terrain annuel.
        </p>

        {hasClaimDetails && (
          <p className="text-[10px] text-slate-400 mt-2.5 pt-2.5 border-t border-slate-100">
            {[
              claimPeriodLabel,
              claimCourts != null &&
                `${claimCourts} terrain${claimCourts > 1 ? "s" : ""} couvert${claimCourts > 1 ? "s" : ""}`,
              coveredMatches != null &&
                `≈ ${coveredMatches} match${coveredMatches > 1 ? "s" : ""} couvert${coveredMatches > 1 ? "s" : ""}`,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        )}
      </div>

      {showClaimSettings && (
        <ClaimSettingsModal
          creditor={connectedPlayer}
          onClose={() => setShowClaimSettings(false)}
        />
      )}

      {/* 3. Consommation personnelle (auto-remboursement) — un seul bloc,
          divisé en trois colonnes : le coût total de la saison mis en
          évidence à gauche, puis le détail matchs déjà joués / à venir.
          Toujours 3 colonnes côte à côte, y compris sur mobile (grid-cols-3
          sans variante sm:) — polices et paddings réduits en dessous du
          point de rupture sm: pour que ça tienne sans passer à la ligne. */}
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Ma consommation personnelle
      </p>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-5 overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <div className="p-2 sm:p-4" style={{ backgroundColor: "#1F2937" }}>
            <Icon.Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/70 mb-1 sm:mb-2" />
            <p className="pm-display text-sm sm:text-2xl font-extrabold text-white leading-tight">
              {selfSeasonTotal.toLocaleString("fr-FR")} €
            </p>
            <p className="text-[9px] sm:text-xs text-white/70 mt-0.5 leading-tight">
              Coût total estimé de ma saison
            </p>
            <p className="text-[8px] sm:text-[10px] text-white/40 mt-1">
              {selfSeasonCount} match{selfSeasonCount > 1 ? "s" : ""}
            </p>
          </div>
          <div className="p-2 sm:p-4">
            <Icon.CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 mb-1 sm:mb-2" />
            <p
              className="pm-display text-sm sm:text-xl font-extrabold leading-tight"
              style={{ color: "#1F2937" }}
            >
              {selfReimbursed.toLocaleString("fr-FR")} €
            </p>
            <p className="text-[9px] sm:text-xs text-slate-500 mt-0.5 leading-tight">
              Mes matchs déjà joués
            </p>
            <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1">
              {selfPastMatchesCount} match{selfPastMatchesCount > 1 ? "s" : ""}
            </p>
          </div>
          <div className="p-2 sm:p-4">
            <Icon.Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-600 mb-1 sm:mb-2" />
            <p
              className="pm-display text-sm sm:text-xl font-extrabold leading-tight"
              style={{ color: "#1F2937" }}
            >
              {selfUpcomingValue.toLocaleString("fr-FR")} €
            </p>
            <p className="text-[9px] sm:text-xs text-slate-500 mt-0.5 leading-tight">
              Mes matchs à venir
            </p>
            <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1">
              {selfUpcomingCount} match{selfUpcomingCount > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Remboursements par les tiers — un seul chiffre, factuel : ce qui
          a déjà été réellement encaissé. L'ancienne case "À percevoir
          (engagé, matchs à venir)" a été retirée (30/08/2026) : elle
          comptait tous les non-créanciers de tous les matchs à venir, sans
          savoir lequel d'entre eux paiera réellement CE créancier-ci (le
          creditorId n'existe qu'une fois le paiement confirmé) — un chiffre
          structurellement faux dès qu'il y a plusieurs créanciers, et
          trompeur même à un seul. La vraie réponse à "combien vais-je
          encore toucher au total" est le bloc "Reste net à récupérer en
          cash" plus bas, qui se déduit de la créance et non d'un comptage
          de joueurs. */}
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Remboursements par les autres joueurs
      </p>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 mb-5">
        <Icon.CheckCircle className="w-4 h-4 text-emerald-600 mb-2" />
        <p className="pm-display text-xl font-extrabold" style={{ color: "#1F2937" }}>
          {totalPaidPastMatches.toLocaleString("fr-FR")} €
        </p>
        <p className="text-xs text-slate-500 mt-0.5">Déjà perçu (matchs passés)</p>
      </div>

      {/* 4bis. Ajustement manuel — toujours visible et éditable directement
          ici (c'est votre propre fiche), plus besoin d'aller dans
          l'Administration pour cette correction. ATTENTION : ce n'est PAS
          la créance de départ (le montant avancé pour la saison) — pour ça,
          utiliser le bloc "Créance de départ" plus haut. */}
      <div
        className={cn(
          "rounded-2xl border p-4 mb-5",
          manualAdjustment === 0
            ? "bg-white border-slate-200"
            : manualAdjustment > 0
            ? "bg-emerald-50 border-emerald-200"
            : "bg-orange-50 border-orange-200"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Ajustement manuel
          </span>
          <ManualAdjustmentEditor playerId={connectedPlayer.id} value={manualAdjustment} />
        </div>
        <p className="text-xs text-slate-500 mt-1">
          À utiliser uniquement pour corriger un écart avec un paiement reçu
          hors application (liquide, virement direct…) — ce n'est pas la
          créance de départ, qui se règle dans le bloc "Créance de départ"
          ci-dessus. Déjà pris en compte dans le "Reste net à récupérer"
          plus bas.
        </p>
      </div>

      {/* 5. Synthèse — reste net à récupérer. Le détail du calcul est affiché
          sous le montant (créance − ma saison − déjà perçu ± ajustement) pour
          que ce soit vérifiable d'un coup d'œil : si ce montant paraît faux,
          c'est presque toujours que la "Créance de départ" ci-dessus n'a pas
          encore été renseignée (elle vaut 0 par défaut tant qu'elle n'est
          pas éditée via la roulette de réglages). */}
      <div
        className="rounded-2xl shadow-md p-5 mb-6 text-white"
        style={{ background: "linear-gradient(135deg, #0284C7, #4338CA)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Icon.Wallet className="w-5 h-5" />
          <span className="text-xs font-semibold uppercase tracking-wide text-white/70">
            Reste net à récupérer
          </span>
        </div>
        <p className="pm-display text-3xl font-extrabold">
          {remainingNet.toLocaleString("fr-FR")} €
        </p>
        <p className="text-xs text-white/80 mt-2">
          Ce montant représente la somme brute que vous devez encore recevoir en
          liquide/virement pour clôturer votre créance tout en couvrant votre propre
          saison.
        </p>
        <p className="text-[11px] text-white/70 mt-3 pt-3 border-t border-white/20 leading-relaxed">
          Créance {advanced.toLocaleString("fr-FR")} € − Ma saison{" "}
          {selfSeasonTotal.toLocaleString("fr-FR")} € − Déjà perçu{" "}
          {totalPaidPastMatches.toLocaleString("fr-FR")} €
          {manualAdjustment !== 0 &&
            ` ${manualAdjustment > 0 ? "−" : "+"} Ajustement ${Math.abs(
              manualAdjustment
            ).toLocaleString("fr-FR")} €`}
        </p>
      </div>

      <h3 className="font-semibold text-sm text-slate-500 mb-3">
        Paiements reçus (matchs passés)
      </h3>
      {paymentsReceived.length === 0 ? (
        <EmptyState
          icon={<Icon.Coin className="w-6 h-6" />}
          title="Aucun paiement enregistré pour l'instant"
          subtitle="Les paiements que vous confirmez depuis l'onglet Matchs apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {paymentsReceived.map((p, i) => (
            <Card key={i} className="p-3.5 flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate">{p.name}</span>
                <span className="block text-xs text-[var(--color-text-faint)]">
                  {formatDateFR(p.date)}
                </span>
              </span>
              <span className="pm-mono font-bold text-emerald-600 text-sm shrink-0">
                +{p.fee.toLocaleString("fr-FR")} €
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
