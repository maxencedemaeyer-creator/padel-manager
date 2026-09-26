// ─────────────────────────────────────────────────────────────────────────
// Jeu "Homme du match" — deux fenêtres liées aux petits messages laissés au
// moment du vote (voir lib/mvp.js) :
// - MvpWinsModal : côté joueur ÉLU, ouverte en touchant la carte dorée de
//   "Mon profil" — liste des matchs où il a été élu + messages reçus.
// - MvpVoteHistoryModal : côté VOTANT, ouverte depuis la fenêtre du jeu —
//   "historique de mes votes" (joueur choisi + message laissé, même si ce
//   joueur n'a pas été élu).
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { useAppData } from "../../context/AppContext";
import { fetchMyMvpWins, fetchMyVoteHistory } from "../../lib/mvp";
import { formatDateFR, formatTimeFR, getFirstName } from "../../lib/utils";
import { Modal, Spinner } from "../ui";

function matchLabel(date, time) {
  if (!date) return "Match passé";
  return `${formatDateFR(date)}${time ? ` à ${formatTimeFR(time)}` : ""}`;
}

export function MvpWinsModal({ onClose }) {
  const { connectedPlayer, matches, players } = useAppData();
  // undefined = chargement en cours.
  const [wins, setWins] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchMyMvpWins(connectedPlayer.id, matches)
      .then((list) => {
        if (!cancelled) setWins(list);
      })
      .catch(() => {
        if (!cancelled) setWins([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedPlayer.id]);

  const authorName = (id) => {
    const p = players.find((x) => x.id === id);
    return p ? getFirstName(p.name) : "Un joueur";
  };

  return (
    <Modal title="Mes titres 🥇" onClose={onClose}>
      {wins === undefined ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : wins.length === 0 ? (
        <p className="text-sm text-[var(--color-text-dim)] text-center py-6">
          Aucun titre à afficher pour l'instant.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {wins.map((w) => (
            <div
              key={w.matchId}
              className="rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 to-amber-100/80 p-3"
            >
              <p className="text-sm font-bold text-[var(--color-text)]">
                🥇 {matchLabel(w.date, w.time)}
              </p>
              <p className="text-[11px] text-amber-800 mb-2">
                {w.coWinners > 1 ? "Élu homme du match (ex æquo)" : "Élu homme du match"}
              </p>
              {w.notes.length === 0 ? (
                <p className="text-xs text-[var(--color-text-faint)] italic">
                  Pas de message pour ce match.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {w.notes.map((n, i) => (
                    <div
                      key={i}
                      className="rounded-xl bg-white/80 border border-white/70 px-3 py-2"
                    >
                      <p className="text-sm text-[var(--color-text)] break-words">« {n.text} »</p>
                      <p className="text-[11px] text-[var(--color-text-dim)] mt-0.5">
                        — {n.authorId ? authorName(n.authorId) : "Anonyme"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function MvpVoteHistoryModal({ onClose }) {
  const { connectedPlayer, matches, players } = useAppData();
  const [history, setHistory] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchMyVoteHistory(connectedPlayer.id, matches)
      .then((list) => {
        if (!cancelled) setHistory(list);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedPlayer.id]);

  const nameOf = (id) => {
    const p = players.find((x) => x.id === id);
    return p ? getFirstName(p.name) : "Un joueur";
  };

  return (
    <Modal title="Historique de mes votes" onClose={onClose}>
      {history === undefined ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : history.length === 0 ? (
        <p className="text-sm text-[var(--color-text-dim)] text-center py-6">
          Tu n'as encore voté pour aucun match.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {history.map((h) => (
            <div
              key={h.matchId}
              className="rounded-2xl bg-white/85 border border-white/70 p-3"
            >
              <p className="text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">
                {matchLabel(h.date, h.time)}
              </p>
              <p className="text-sm font-semibold text-[var(--color-text)] mt-0.5">
                Vote pour {nameOf(h.candidateId)}
              </p>
              {h.text ? (
                <p className="text-sm text-[var(--color-text-dim)] mt-1.5 break-words">
                  « {h.text} »
                  <span className="block text-[11px] text-[var(--color-text-faint)] mt-0.5">
                    {h.signed ? "Message signé" : "Message anonyme"}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-[var(--color-text-faint)] italic mt-1.5">
                  Pas de message.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
