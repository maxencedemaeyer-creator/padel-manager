// ─────────────────────────────────────────────────────────────────────────
// Fenêtre « Bilan de l'abonnement » (chantier du 30/10/2026).
//
// - Pour l'admin : bilan EN DIRECT de l'abonnement (écart de chaque
//   créancier, ligne de contrôle, versements proposés pour remettre à
//   l'équilibre, versements déjà enregistrés), puis clôture — normale si
//   tout est joué, ou « forcée » s'il reste des matchs à venir. La clôture
//   enregistre une photo figée du bilan (v1). Si les chiffres bougent
//   ensuite (ex. un match déplacé est joué après la clôture), une nouvelle
//   version (v2, v3…) s'enregistre seulement quand l'admin la valide :
//   rien ne change jamais en silence, et toutes les versions restent
//   consultables.
// - Pour un créancier : consultation des bilans enregistrés des abonnements
//   dont il est créancier, sans aucune action possible.
// - Pour tous les deux : « Enregistrer en PDF » (via l'impression du
//   téléphone/ordinateur), avec le détail session par session, terrain par
//   terrain : qui a payé à qui, qui était couvert par sa créance.
//
// Coût Firebase : aucune lecture (l'abonnement et les matchs sont déjà
// chargés) ; une écriture par clôture, validation de version ou versement
// annulé.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { cn, formatDateFR, formatTimeFR, formatClaimPeriodLabel } from "../../lib/utils";
import { round2 } from "../../lib/stats";
import {
  computeAbonnementBilan,
  getSavedBilans,
  isBilanOutdated,
  makeBilanSnapshot,
} from "../../lib/settlement";
import { useAppData } from "../../context/AppContext";
import { logActivity } from "../../lib/activityLog";
import Icon from "../icons/Icon";
import { Modal, Button, EmptyState } from "../ui";
import { TransferModal } from "./TransferModal";

const fmt = (v) => `${round2(v).toLocaleString("fr-FR")} €`;

function formatStamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function abonnementDisplayName(abonnement, clubs) {
  const club = (clubs || []).find((c) => c.id === abonnement?.clubId);
  return abonnement?.label || club?.name || "Abonnement";
}

export function SubscriptionBilanModal({ abonnementId, canManage = false, onClose }) {
  const { abonnements, matches, players, clubs, connectedPlayer } = useAppData();
  const abonnement = (abonnements || []).find((a) => a.id === abonnementId) || null;

  const live = useMemo(
    () => (abonnement ? computeAbonnementBilan(abonnement, matches, players) : null),
    [abonnement, matches, players]
  );
  const saved = useMemo(() => getSavedBilans(abonnement), [abonnement]);
  const outdated = abonnement && live ? isBilanOutdated(abonnement, live) : false;

  // Vue affichée : "live" (admin seulement) ou le numéro d'une version
  // enregistrée. Par défaut : en direct pour un abonnement actif, la
  // dernière version enregistrée pour un abonnement clôturé.
  const [view, setView] = useState(() => {
    if (canManage && (!abonnement?.archived || saved.length === 0)) return "live";
    return saved.length > 0 ? saved[saved.length - 1].version : "live";
  });
  const [transferPrefill, setTransferPrefill] = useState(null); // {} = versement libre
  const [confirmingRemoveId, setConfirmingRemoveId] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!abonnement || !live) return null;

  const isLive = view === "live" && canManage;
  const data = isLive ? live : saved.find((s) => s.version === view) || null;
  const name = abonnementDisplayName(abonnement, clubs);
  const club = (clubs || []).find((c) => c.id === abonnement.clubId);
  const subtitle = [
    club?.name,
    (abonnement.courts || []).length > 0 &&
      `Terrain${abonnement.courts.length > 1 ? "s" : ""} ${abonnement.courts.join(", ")}`,
    formatClaimPeriodLabel(abonnement.startDate, abonnement.endDate),
  ]
    .filter(Boolean)
    .join(" · ");

  // ── Actions admin ──────────────────────────────────────────────────────
  const saveSnapshot = async ({ close }) => {
    const forced = close && live.unfinishedCount > 0;
    const version = (saved[saved.length - 1]?.version || 0) + 1;
    const message = close
      ? forced
        ? `Clôture forcée : il reste ${live.unfinishedCount} match${live.unfinishedCount > 1 ? "s" : ""} à venir. Ils restent visibles et payables dans l'onglet Matchs ; le bilan v${version} est enregistré tel quel aujourd'hui et une nouvelle version vous sera proposée quand les chiffres bougeront. Continuer ?`
        : `Clôturer l'abonnement et enregistrer le bilan v${version} ? Ses matchs seront rangés (masqués de l'onglet Matchs). Rien n'est supprimé.`
      : `Enregistrer les chiffres actuels comme bilan v${version} ? Les versions précédentes restent consultables.`;
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      // JSON aller-retour : retire toute valeur `undefined`, refusée par Firestore.
      const snapshot = JSON.parse(
        JSON.stringify(
          makeBilanSnapshot(live, { version, createdBy: connectedPlayer?.id, forced })
        )
      );
      const update = { bilans: [...(Array.isArray(abonnement.bilans) ? abonnement.bilans : []), snapshot] };
      if (close) {
        update.archived = true;
        update.closedAt = snapshot.createdAt;
      }
      await updateDoc(doc(db, "abonnements", abonnement.id), update);
      logActivity(
        "money",
        close
          ? `Abonnement clôturé${forced ? " (clôture forcée)" : ""} — ${name} — bilan v${version} enregistré`
          : `Bilan v${version} enregistré — ${name}`
      );
      setView(version);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setBusy(false);
    }
  };

  const removeTransfer = async (transferId) => {
    setBusy(true);
    try {
      const current = Array.isArray(abonnement.transfers) ? abonnement.transfers : [];
      const removed = current.find((t) => t.id === transferId);
      await updateDoc(doc(db, "abonnements", abonnement.id), {
        transfers: current.filter((t) => t.id !== transferId),
      });
      if (removed) {
        logActivity(
          "money",
          `Versement annulé : ${players.find((p) => p.id === removed.fromId)?.name || "?"} → ${players.find((p) => p.id === removed.toId)?.name || "?"} ${fmt(removed.amount)} — ${name}`
        );
      }
      setConfirmingRemoveId(null);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setBusy(false);
    }
  };

  const printPdf = () => {
    try {
      window.print();
    } catch (e) {
      alert("L'impression n'est pas disponible sur cet appareil.");
    }
  };

  // ── Pied de fenêtre ────────────────────────────────────────────────────
  let primaryAction = null;
  if (isLive && !abonnement.archived) {
    primaryAction = (
      <Button onClick={() => saveSnapshot({ close: true })} disabled={busy || live.matchCount === 0}>
        {live.unfinishedCount > 0 ? "Clôture forcée" : "Clôturer"}
      </Button>
    );
  } else if (isLive && abonnement.archived && (saved.length === 0 || outdated)) {
    primaryAction = (
      <Button onClick={() => saveSnapshot({ close: false })} disabled={busy}>
        {saved.length === 0 ? "Enregistrer le bilan" : `Valider la mise à jour (v${(saved[saved.length - 1]?.version || 0) + 1})`}
      </Button>
    );
  }

  const footer = (
    <div className="flex items-center gap-2 w-full flex-wrap">
      <Button variant="secondary" className="!py-2 !px-3 !text-xs" onClick={printPdf} disabled={!data}>
        Enregistrer en PDF
      </Button>
      {isLive && (
        <Button
          variant="secondary"
          className="!py-2 !px-3 !text-xs"
          onClick={() => setTransferPrefill({})}
          disabled={busy}
        >
          Versement libre
        </Button>
      )}
      <span className="flex-1" />
      {primaryAction}
    </div>
  );

  const versionChips = (
    <div className="flex gap-1.5 flex-wrap">
      {canManage && (
        <VersionChip active={view === "live"} onClick={() => setView("live")}>
          En direct
        </VersionChip>
      )}
      {saved.map((s) => (
        <VersionChip key={s.version} active={view === s.version} onClick={() => setView(s.version)}>
          v{s.version} · {formatStamp(s.createdAt).split(" à ")[0]}
        </VersionChip>
      ))}
    </div>
  );

  return (
    <>
      <Modal title={`Bilan — ${name}`} onClose={onClose} wide footer={footer}>
        <div className="rounded-2xl p-3 space-y-4" style={{ backgroundColor: "#F8FAFC" }}>
          {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
          {(canManage || saved.length > 1) && versionChips}

          {canManage && abonnement.archived && outdated && view !== "live" && (
            <button
              type="button"
              onClick={() => setView("live")}
              className="w-full text-left text-[11px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2"
            >
              ⚠️ Les chiffres ont changé depuis cette version. Voir « En direct » pour valider la
              mise à jour.
            </button>
          )}

          {data ? (
            <BilanBody
              data={data}
              live={isLive}
              savedMeta={isLive ? null : data}
              onRecordSuggestion={(s) =>
                setTransferPrefill({
                  fromId: s.fromId,
                  toId: s.toId,
                  amount: s.amount,
                  note: "Remise à l'équilibre",
                })
              }
              confirmingRemoveId={confirmingRemoveId}
              onAskRemove={setConfirmingRemoveId}
              onRemove={removeTransfer}
              busy={busy}
            />
          ) : (
            <EmptyState
              icon={<Icon.Wallet className="w-6 h-6" />}
              title="Aucun bilan enregistré"
              subtitle="Le bilan est enregistré au moment où l'admin clôture l'abonnement."
            />
          )}
        </div>
      </Modal>

      {transferPrefill && (
        <TransferModal
          defaultAbonnementId={abonnement.id}
          prefill={transferPrefill}
          onClose={() => setTransferPrefill(null)}
        />
      )}

      {data && (
        <PrintRoot>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Bilan — {name}</h1>
          <p style={{ fontSize: 11, color: "#475569", margin: "4px 0 12px" }}>
            {subtitle}
            {subtitle ? " · " : ""}
            {isLive
              ? `Chiffres en direct au ${formatStamp(new Date().toISOString())}`
              : `Bilan v${data.version} enregistré le ${formatStamp(data.createdAt)}${data.forced ? " (clôture forcée)" : ""}`}
          </p>
          <BilanBody data={data} live={false} savedMeta={null} print />
        </PrintRoot>
      )}
    </>
  );
}

function VersionChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors",
        active
          ? "bg-sky-600 text-white border-sky-600"
          : "bg-white text-slate-600 border-slate-200 hover:border-sky-300"
      )}
    >
      {children}
    </button>
  );
}

// Contenu du bilan — identique à l'écran et dans le PDF (`print` : tout est
// déplié, aucun bouton).
function BilanBody({
  data,
  live,
  savedMeta,
  print = false,
  onRecordSuggestion,
  confirmingRemoveId,
  onAskRemove,
  onRemove,
  busy,
}) {
  const [showSessions, setShowSessions] = useState(false);
  const t = data.totals || {};
  const rows = data.rows || [];
  const transfers = data.transfers || [];
  const suggestions = data.suggestions || [];
  const sessions = data.sessions || [];
  const controlOk = Math.abs(t.controlDiff || 0) < 0.01;
  const pendingTotal = round2((t.unpaidAmount || 0) + (t.upcomingAmount || 0));

  return (
    <div className="space-y-4 text-slate-800">
      {/* État général */}
      {savedMeta && (
        <p className="text-[11px] text-slate-500">
          Bilan v{savedMeta.version} enregistré le {formatStamp(savedMeta.createdAt)}
          {savedMeta.forced ? " — clôture forcée" : ""}. Ces chiffres ne bougent plus.
        </p>
      )}
      <div
        className={cn(
          "flex items-start gap-2.5 p-3 rounded-xl border text-xs font-medium",
          data.balanced && pendingTotal === 0
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-white border-slate-200 text-slate-700"
        )}
      >
        {data.balanced && pendingTotal === 0 ? (
          <Icon.CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <Icon.AlertCircle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
        )}
        <div className="space-y-0.5">
          <p>
            {data.matchCount} terrain{data.matchCount > 1 ? "s" : ""} · {data.sessionCount}{" "}
            session{data.sessionCount > 1 ? "s" : ""}
            {data.unfinishedCount > 0
              ? ` · ${data.unfinishedCount} match${data.unfinishedCount > 1 ? "s" : ""} à venir`
              : " · tout est joué"}
          </p>
          {t.unpaidCount > 0 && (
            <p className="text-orange-700">
              Impayés : {t.unpaidCount} place{t.unpaidCount > 1 ? "s" : ""} · {fmt(t.unpaidAmount)}
            </p>
          )}
          {t.upcomingSeats > 0 && (
            <p>
              Encore attendu sur les matchs à venir : {t.upcomingSeats} place
              {t.upcomingSeats > 1 ? "s" : ""} · {fmt(t.upcomingAmount)}
            </p>
          )}
          {data.balanced && pendingTotal === 0 && <p>Tout le monde est à l'équilibre.</p>}
        </div>
      </div>

      {/* Une carte par personne */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
          Créanciers
        </p>
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <PersonRow key={r.playerId} r={r} />
          ))}
        </div>
      </div>

      {/* Ligne de contrôle */}
      <div
        className={cn(
          "p-3 rounded-xl border text-[11px] leading-relaxed",
          controlOk ? "bg-white border-slate-200 text-slate-600" : "bg-orange-50 border-orange-200 text-orange-800"
        )}
      >
        <p className="font-semibold mb-0.5">
          {controlOk ? "✓ Contrôle OK" : "⚠️ Contrôle : écart sur les créances"}
        </p>
        <p>
          Créances encodées {fmt(t.advanced)} · Prix des terrains {fmt(t.courtValue)}
          {controlOk
            ? " — les deux correspondent, la somme des écarts vaut 0."
            : ` — différence de ${fmt(t.controlDiff)}. Une créance a sans doute été encodée à un autre montant que le prix des terrains (à corriger via la roulette ⚙️ de la créance).`}
        </p>
        {t.emptyCount > 0 && (
          <p className="mt-1">
            Places restées vides sur des matchs joués : {t.emptyCount} · {fmt(t.emptyAmount)} — à
            charge du créancier du terrain concerné (à régler entre vous par un versement libre si
            vous en décidez autrement).
          </p>
        )}
      </div>

      {/* Versements proposés */}
      {suggestions.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
            Pour remettre à l'équilibre
          </p>
          <div className="flex flex-col gap-2">
            {suggestions.map((s, i) => (
              <div
                key={`${s.fromId}-${s.toId}-${i}`}
                className="flex items-center gap-2 bg-white border border-sky-200 rounded-xl px-3 py-2.5"
              >
                <span className="flex-1 min-w-0 text-sm">
                  <span className="font-semibold">{s.fromName}</span>
                  <span className="text-slate-400"> verse à </span>
                  <span className="font-semibold">{s.toName}</span>
                </span>
                <span className="pm-mono font-bold text-sm text-sky-700 shrink-0">
                  {fmt(s.amount)}
                </span>
                {live && !print && (
                  <button
                    type="button"
                    onClick={() => onRecordSuggestion && onRecordSuggestion(s)}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg bg-sky-600 text-white text-[11px] font-semibold hover:bg-sky-700"
                  >
                    Enregistrer
                  </button>
                )}
              </div>
            ))}
          </div>
          {data.unfinishedCount > 0 && (
            <p className="text-[11px] text-slate-500 mt-1.5">
              Autre solution, sans échange d'argent : les prochains paiements des terrains de celui
              qui verse sont encaissés directement par celui qui reçoit (à marquer « payé » au
              nom de celui qui encaisse vraiment).
            </p>
          )}
        </div>
      )}

      {/* Versements enregistrés */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
          Versements entre créanciers
        </p>
        {transfers.length === 0 ? (
          <p className="text-[11px] text-slate-500">Aucun versement enregistré.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {transfers.map((tr) => (
              <div
                key={tr.id || `${tr.fromId}-${tr.toId}-${tr.at}`}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-sm">
                    <span className="font-semibold">{tr.fromName}</span>
                    <span className="text-slate-400"> → </span>
                    <span className="font-semibold">{tr.toName}</span>
                  </span>
                  <span className="pm-mono font-bold text-sm shrink-0">{fmt(tr.amount)}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {formatStamp(tr.at)}
                  {tr.note ? ` · ${tr.note}` : ""}
                </p>
                {live && !print && tr.id && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {confirmingRemoveId === tr.id ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onRemove(tr.id)}
                          className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold disabled:opacity-50"
                        >
                          Confirmer l'annulation
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onAskRemove(null)}
                          className="px-2 py-1 rounded-lg text-slate-400 text-[11px] font-medium"
                        >
                          Garder
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAskRemove(tr.id)}
                        className="px-2 py-1 rounded-lg border border-slate-200 text-slate-500 text-[11px] font-semibold hover:text-rose-600 hover:border-rose-200"
                      >
                        Annuler ce versement
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Détail session par session */}
      <div>
        {!print ? (
          <button
            type="button"
            onClick={() => setShowSessions((v) => !v)}
            className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2"
          >
            <span>Détail session par session ({sessions.length})</span>
            <Icon.Chevron className={cn("w-4 h-4 transition-transform", showSessions && "rotate-90")} />
          </button>
        ) : (
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Détail session par session
          </p>
        )}
        {(showSessions || print) && (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => (
              <SessionBlock key={s.key} s={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonRow({ r }) {
  const balanceLabel =
    Math.abs(r.balance) < 0.01
      ? "À l'équilibre"
      : r.balance > 0
      ? `Doit recevoir ${fmt(r.balance)}`
      : `Doit verser ${fmt(-r.balance)}`;
  const tone =
    Math.abs(r.balance) < 0.01
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : r.balance > 0
      ? "bg-sky-50 text-sky-700 border-sky-200"
      : "bg-orange-50 text-orange-700 border-orange-200";
  const parts = [
    r.advanced ? `Créance ${fmt(r.advanced)}` : null,
    r.covered ? `Couvert ${fmt(r.covered)} (${r.coveredCount} pl.)` : null,
    r.received ? `Perçu ${fmt(r.received)} (${r.receivedCount} pl.)` : null,
    r.transfersOut ? `Versé ${fmt(r.transfersOut)}` : null,
    r.transfersIn ? `Reçu ${fmt(r.transfersIn)}` : null,
  ].filter(Boolean);
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5" style={{ breakInside: "avoid" }}>
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 text-sm font-semibold">
          {r.name}
          {!r.isAbonnementCreditor && (
            <span className="ml-1.5 text-[10px] font-medium text-slate-400">(hors abonnement)</span>
          )}
        </span>
        <span className={cn("shrink-0 px-2 py-0.5 rounded-full border text-[11px] font-bold", tone)}>
          {balanceLabel}
        </span>
      </div>
      <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{parts.join(" · ") || "—"}</p>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        Reste à récupérer {fmt(r.remaining)}
        {r.pending ? ` · dont encore attendu ${fmt(r.pending)}` : ""}
        {r.emptyLoss ? ` · places vides ${fmt(r.emptyLoss)}` : ""}
      </p>
    </div>
  );
}

const SEAT_STYLES = {
  paid: "text-emerald-700",
  covered: "text-slate-500",
  unpaid: "text-orange-700",
  upcoming: "text-sky-700",
};

function seatText(seat) {
  if (seat.status === "paid") return seat.self ? "payé à lui-même" : `payé → ${seat.toName}`;
  if (seat.status === "covered") return "couvert (créancier)";
  if (seat.status === "unpaid") return seat.toName ? `impayé (doit à ${seat.toName})` : "impayé";
  return "à venir";
}

function SessionBlock({ s }) {
  const dateLabel = s.tbd ? "Date à définir" : s.date ? formatDateFR(s.date) : "Date inconnue";
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5" style={{ breakInside: "avoid" }}>
      <p className="text-xs font-bold text-slate-700">
        {dateLabel}
        {s.time ? ` · ${formatTimeFR(s.time)}` : ""}
      </p>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {s.courts.map((c) => (
          <div key={c.matchId} className="border-t border-slate-100 pt-1.5 first:border-t-0 first:pt-0">
            <p className="text-[11px] font-semibold text-slate-600">
              {c.label} · créancier{c.creditorNames.length > 1 ? "s" : ""} :{" "}
              {c.creditorNames.join(", ") || "—"} · {fmt(c.fee)}/place
              {c.timing !== "finished" ? " · à venir" : ""}
            </p>
            <ul className="mt-0.5 grid grid-cols-1 sm:grid-cols-2 gap-x-3">
              {c.seats.map((seat, i) => (
                <li key={`${seat.playerId}-${i}`} className="text-[11px]">
                  <span className="font-medium">{seat.name}</span>{" "}
                  <span className={SEAT_STYLES[seat.status] || ""}>— {seatText(seat)}</span>
                </li>
              ))}
              {Array.from({ length: c.emptySeats || 0 }).map((_, i) => (
                <li key={`empty-${i}`} className="text-[11px] text-slate-400">
                  Place {c.timing === "finished" ? "vide" : "pas encore attribuée"}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// Zone d'impression : invisible à l'écran, seule chose imprimée quand on
// appuie sur « PDF » (le téléphone propose alors « Enregistrer en PDF » ou
// « Partager »). Attachée directement à <body>.
function PrintRoot({ children }) {
  return createPortal(
    <div className="pm-print-root">
      <style>{`
        @media screen { .pm-print-root { display: none !important; } }
        @media print {
          @page { margin: 12mm; }
          body > *:not(.pm-print-root) { display: none !important; }
          body { background: #fff !important; }
          .pm-print-root { display: block !important; color: #0f172a; font-family: system-ui, sans-serif; }
          .pm-print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      {children}
    </div>,
    document.body
  );
}
