// ─────────────────────────────────────────────────────────────────────────
// Game Center — Jeu "Killer" : fenêtre du jeu. Un joueur engagé dans un
// match reçoit une mission personnelle tirée au sort (bouton "Mission du
// jour"), peut la changer une seule fois si elle est trop dure ("Deuxième
// chance"), puis valide son résultat 30 minutes après le début du match
// pour marquer des points. Un petit lien indépendant permet de "revoir sa
// mission du jour" jusqu'à minuit. Logique et Firestore dans
// src/lib/killer.js.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { useAppData } from "../../context/AppContext";
import { useNow } from "../../lib/matchLogic";
import { cn, toLocalISODate } from "../../lib/utils";
import { KILLER_ACTIVATION_HOURS_BEFORE } from "../../lib/constants";
import {
  getKillerStatus,
  fetchTodaysMission,
  fetchMissionForToday,
  getOrCreateTodaysMission,
  rerollKillerMission,
  resolveKillerMission,
} from "../../lib/killer";
import { Modal, Button, Spinner } from "../ui";
import { KillerLeaderboardModal } from "./KillerLeaderboardModal";

const RESULT_OPTIONS = [
  {
    value: "success",
    label: "Réussi",
    points: 3,
    classes: "bg-emerald-500 hover:bg-emerald-600 text-white",
  },
  {
    value: "fail",
    label: "Raté",
    points: 1,
    classes: "bg-orange-500 hover:bg-orange-600 text-white",
  },
  {
    value: "skipped",
    label: "J'ai même pas essayé",
    points: 0,
    classes: "bg-rose-500 hover:bg-rose-600 text-white",
  },
];

const RESULT_TEXT_CLASSES = {
  success: "text-emerald-600",
  fail: "text-orange-600",
  skipped: "text-rose-600",
};

function resultLabel(value) {
  const opt = RESULT_OPTIONS.find((o) => o.value === value);
  return opt ? opt.label : value;
}

// Petit lien texte discret (deuxième chance, revoir sa mission...).
function LinkButton({ children, ...rest }) {
  return (
    <button
      type="button"
      className="text-xs font-semibold text-[var(--color-text-faint)] underline underline-offset-2 disabled:opacity-40 disabled:pointer-events-none"
      {...rest}
    >
      {children}
    </button>
  );
}

export function KillerModal({ onClose }) {
  const { matches, connectedPlayer, players } = useAppData();
  const now = useNow(30000);
  const status = getKillerStatus(matches, connectedPlayer.id, now);
  const windowStartKey = status.window ? status.window.start.getTime() : null;

  // undefined = pas encore chargée, null = aucune mission pour cette fenêtre
  const [mission, setMission] = useState(undefined);
  const [loadingMission, setLoadingMission] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [rerolling, setRerolling] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Petit raccourci "Revoir ma mission du jour", indépendant de la fenêtre
  // de jeu ci-dessus (voir fetchMissionForToday) — dispo jusqu'à minuit.
  const [todaysRecap, setTodaysRecap] = useState(undefined);
  const [showTodaysRecap, setShowTodaysRecap] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (status.status === "choosing" || status.status === "playing") {
      setLoadingMission(true);
      fetchTodaysMission(status.window, connectedPlayer.id).then((m) => {
        if (!cancelled) {
          setMission(m);
          setLoadingMission(false);
        }
      });
    } else {
      setMission(undefined);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.status, windowStartKey, connectedPlayer.id]);

  useEffect(() => {
    let cancelled = false;
    fetchMissionForToday(connectedPlayer.id).then((m) => {
      if (!cancelled) setTodaysRecap(m);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedPlayer.id]);

  const pickMission = async () => {
    setLoadingMission(true);
    try {
      const m = await getOrCreateTodaysMission(
        status.window,
        connectedPlayer.id,
        status.match.id
      );
      setMission(m);
    } finally {
      setLoadingMission(false);
    }
  };

  const reroll = async () => {
    if (!mission || mission.rerollUsed || mission.result || rerolling) return;
    setRerolling(true);
    try {
      const updated = await rerollKillerMission(mission.id);
      setMission(updated);
    } catch (error) {
      alert(error.message || "Impossible de changer de mission.");
    } finally {
      setRerolling(false);
    }
  };

  const chooseResult = async (value) => {
    if (!mission || resolving) return;
    setResolving(true);
    try {
      const points = await resolveKillerMission(mission.id, value);
      const updated = { ...mission, result: value, points };
      setMission(updated);
      if (updated.dayKey === toLocalISODate(new Date())) setTodaysRecap(updated);
    } finally {
      setResolving(false);
    }
  };

  // On évite d'afficher le petit rappel "Revoir ma mission du jour" quand
  // l'écran principal montre déjà exactement la même chose (phase "playing"
  // avec résultat déjà validé pour cette même mission du jour).
  const mainFlowAlreadyShowsRecap =
    status.status === "playing" && mission && mission.result && todaysRecap
      ? mission.id === todaysRecap.id
      : false;
  const canShowRecapShortcut =
    todaysRecap && todaysRecap.result && !mainFlowAlreadyShowsRecap;

  return (
    <Modal title="Killer 🔪" onClose={onClose}>
      <div className="flex flex-col items-center text-center py-4">
        {status.status === "not-present" && (
          <p className="text-sm text-[var(--color-text-dim)] max-w-xs py-6">
            Reviens ici lors de ton prochain jour de match !
          </p>
        )}

        {status.status === "too-early" && (
          <p className="text-sm text-[var(--color-text-dim)] max-w-xs py-6">
            Le jeu Killer s'ouvre {KILLER_ACTIVATION_HOURS_BEFORE}h avant ton
            match. Reviens un peu plus tard !
          </p>
        )}

        {(status.status === "choosing" || status.status === "playing") &&
          loadingMission && <Spinner />}

        {status.status === "choosing" && !loadingMission && mission === null && (
          <>
            <p className="text-sm text-[var(--color-text-dim)] mb-6 max-w-xs">
              Une mission personnelle t'attend avant ton match. Prêt·e ?
            </p>
            <Button onClick={pickMission} className="w-full">
              Mission du jour 🎯
            </Button>
          </>
        )}

        {status.status === "choosing" && !loadingMission && mission && (
          <>
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-faint)] mb-3">
              Ta mission
            </p>
            <p className="pm-display font-bold text-lg text-[var(--color-text)] mb-4">
              {mission.mission}
            </p>
            <p className="text-xs text-[var(--color-text-faint)] max-w-xs mb-4">
              Reviens ici 30 minutes après le début du match pour valider ton
              résultat.
            </p>
            {!mission.rerollUsed && (
              <LinkButton onClick={reroll} disabled={rerolling}>
                {rerolling ? "Nouvelle mission..." : "Trop dure ? Deuxième chance (1x)"}
              </LinkButton>
            )}
          </>
        )}

        {status.status === "playing" && !loadingMission && mission === null && (
          <p className="text-sm text-[var(--color-text-dim)] max-w-xs py-4">
            Tu n'as pas récupéré de mission à temps aujourd'hui. Rendez-vous à
            ton prochain match !
          </p>
        )}

        {status.status === "playing" && !loadingMission && mission && !mission.result && (
          <>
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-faint)] mb-3">
              Ta mission
            </p>
            <p className="pm-display font-bold text-lg text-[var(--color-text)] mb-6">
              {mission.mission}
            </p>
            <div className="flex flex-col gap-2 w-full mb-4">
              {RESULT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={resolving}
                  onClick={() => chooseResult(opt.value)}
                  className={cn(
                    "w-full px-4 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none",
                    opt.classes
                  )}
                >
                  {opt.label} · +{opt.points} pt{opt.points > 1 ? "s" : ""}
                </button>
              ))}
            </div>
            {!mission.rerollUsed && (
              <LinkButton onClick={reroll} disabled={rerolling}>
                {rerolling ? "Nouvelle mission..." : "Trop dure ? Deuxième chance (1x)"}
              </LinkButton>
            )}
          </>
        )}

        {status.status === "playing" && !loadingMission && mission && mission.result && (
          <>
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-faint)] mb-2">
              Ta mission
            </p>
            <p className="text-sm text-[var(--color-text-dim)] mb-5 max-w-xs">
              {mission.mission}
            </p>
            <p
              className={cn(
                "pm-display font-extrabold text-2xl mb-1",
                RESULT_TEXT_CLASSES[mission.result]
              )}
            >
              {resultLabel(mission.result)}
            </p>
            <p className="text-sm text-[var(--color-text-dim)]">
              +{mission.points} point{mission.points > 1 ? "s" : ""}
            </p>
          </>
        )}

        {status.status === "playing" && (
          <Button
            variant="secondary"
            className="w-full mt-6"
            onClick={() => setShowLeaderboard(true)}
          >
            🏆 Classement
          </Button>
        )}

        {canShowRecapShortcut && (
          <div className={status.status === "playing" ? "w-full mt-3" : "w-full mt-8"}>
            {!showTodaysRecap ? (
              <LinkButton onClick={() => setShowTodaysRecap(true)}>
                🔁 Revoir ma mission du jour
              </LinkButton>
            ) : (
              <div className="p-3 rounded-2xl bg-white/70 border border-white/60 text-left">
                <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-faint)] mb-1">
                  Ta mission du jour
                </p>
                <p className="text-sm text-[var(--color-text)] mb-2">{todaysRecap.mission}</p>
                <p className={cn("text-sm font-bold", RESULT_TEXT_CLASSES[todaysRecap.result])}>
                  {resultLabel(todaysRecap.result)} · +{todaysRecap.points} pt
                  {todaysRecap.points > 1 ? "s" : ""}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {showLeaderboard && (
        <KillerLeaderboardModal onClose={() => setShowLeaderboard(false)} players={players} />
      )}
    </Modal>
  );
}
