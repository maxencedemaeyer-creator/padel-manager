// ─────────────────────────────────────────────────────────────────────────
// Fun Center — Jeu "Tournée générale" : petite fenêtre de tirage au sort
// pour savoir qui paie la prochaine tournée, parmi les joueurs présents sur
// un terrain aujourd'hui. Logique de tirage/historique partagé dans
// src/lib/tourneeGenerale.js.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { useAppData } from "../../context/AppContext";
import { useNow } from "../../lib/matchLogic";
import { getFirstName } from "../../lib/utils";
import {
  drawTourneeGenerale,
  getPresentPlayersToday,
  getTourneeGeneraleStatus,
} from "../../lib/tourneeGenerale";
import { Modal, Button } from "../ui";

// Durée minimum de l'animation de tirage, même si Firebase répond plus vite
// — pour laisser le petit effet "suspense" avoir le temps de se voir.
const SHUFFLE_MIN_DURATION_MS = 2200;
const SHUFFLE_TICK_MS = 90;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function TourneeGeneraleModal({ onClose }) {
  const { matches, players } = useAppData();
  const now = useNow(30000);
  // idle | shuffling | result | blocked | empty | error
  const [phase, setPhase] = useState("idle");
  const [winner, setWinner] = useState(null);
  const [shuffleName, setShuffleName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const intervalRef = useRef(null);

  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    },
    []
  );

  const play = async () => {
    const status = getTourneeGeneraleStatus(matches, now);
    if (status.status !== "ok") {
      setPhase("blocked");
      return;
    }
    const presentPlayers = getPresentPlayersToday(status.todaysMatches, players);
    if (presentPlayers.length === 0) {
      setPhase("empty");
      return;
    }

    setPhase("shuffling");
    setShuffleName(getFirstName(presentPlayers[0].name));
    intervalRef.current = setInterval(() => {
      const random = presentPlayers[Math.floor(Math.random() * presentPlayers.length)];
      setShuffleName(getFirstName(random.name));
    }, SHUFFLE_TICK_MS);

    try {
      const [picked] = await Promise.all([
        drawTourneeGenerale(presentPlayers, now),
        delay(SHUFFLE_MIN_DURATION_MS),
      ]);
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setWinner(picked);
      setPhase("result");
    } catch (error) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setErrorMessage(error.message || "Erreur inconnue.");
      setPhase("error");
    }
  };

  const playAgain = () => {
    setWinner(null);
    setPhase("idle");
  };

  return (
    <Modal title="Tournée générale 🍻" onClose={onClose}>
      <div className="flex flex-col items-center text-center py-4">
        {phase === "idle" && (
          <>
            <p className="text-sm text-[var(--color-text-dim)] mb-6 max-w-xs">
              Un nom, tiré au hasard parmi les joueurs présents aujourd'hui,
              pour savoir qui régale au bar !
            </p>
            <Button onClick={play} className="w-full">
              Qui paie la prochaine ? 🍻🎉
            </Button>
          </>
        )}

        {phase === "shuffling" && (
          <div className="py-8">
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-faint)] mb-3">
              Le sort en décide...
            </p>
            <p className="pm-display font-extrabold text-4xl text-[var(--color-text)] pm-pulse">
              {shuffleName}
            </p>
          </div>
        )}

        {phase === "result" && winner && (
          <div className="pm-rise py-4">
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-faint)] mb-3">
              C'est décidé, la tournée est pour...
            </p>
            <p className="pm-display font-extrabold text-4xl text-[var(--color-lime)] mb-2">
              {getFirstName(winner.name)} 🍻
            </p>
            <p className="text-sm text-[var(--color-text-dim)] mb-6">Santé ! 🎉</p>
            <Button onClick={playAgain} variant="secondary" className="w-full">
              Nouveau tirage
            </Button>
          </div>
        )}

        {phase === "blocked" && (
          <div className="py-6">
            <p className="text-base font-semibold text-[var(--color-text)] mb-3 max-w-xs">
              On ne joue pas aujourd'hui, mais tu peux quand même aller
              t'ouvrir une petite chope !
            </p>
            <p className="text-[10px] text-[var(--color-text-faint)]">
              Attention l'abus d'alcool est dangereux pour la santé
            </p>
          </div>
        )}

        {phase === "empty" && (
          <div className="py-6">
            <p className="text-sm text-[var(--color-text-dim)] max-w-xs">
              Aucun joueur n'est encore placé sur un terrain aujourd'hui.
              Réessaie une fois la composition faite !
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="py-6">
            <p className="text-sm text-[var(--color-danger)] max-w-xs mb-4">
              {errorMessage}
            </p>
            <Button onClick={playAgain} variant="secondary">
              Réessayer
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
