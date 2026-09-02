// ─────────────────────────────────────────────────────────────────────────
// Game Center — Jeu "Homme du match" : après chaque match, les joueurs
// élisent l'homme du match PARMI LEUR PROPRE COMPOSITION (le terrain sur
// lequel ils ont joué, pas toute la session). Vote ouvert
// MVP_VOTE_OPENS_HOURS_AFTER_START heure(s) après le début du match,
// jusqu'à 23h59 le lendemain. Logique et Firestore dans src/lib/mvp.js.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { useAppData } from "../../context/AppContext";
import { useNow, getCourtSlots } from "../../lib/matchLogic";
import { formatDateFR, formatTimeFR, getFirstName } from "../../lib/utils";
import { MVP_VOTE_OPENS_HOURS_AFTER_START } from "../../lib/constants";
import { getMvpStatus, fetchMvpVotes, castMvpVote, computeMvpWinner } from "../../lib/mvp";
import { Modal, Spinner } from "../ui";
import { PlayerAvatar } from "../players/PlayerAvatar";

export function MvpVoteModal({ onClose }) {
  const { matches, players, connectedPlayer } = useAppData();
  const now = useNow(30000);
  const status = getMvpStatus(matches, connectedPlayer.id, now);
  const matchId = status.match ? status.match.id : null;

  // undefined = pas encore chargés depuis Firestore.
  const [votes, setVotes] = useState(undefined);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (matchId) {
      setVotes(undefined);
      fetchMvpVotes(matchId).then((data) => {
        if (!cancelled) setVotes(data.votes || {});
      });
    }
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const playerOf = (id) => players.find((p) => p.id === id);

  const vote = async (candidateId) => {
    if (!matchId || voting || (votes && votes[connectedPlayer.id])) return;
    setVoting(true);
    try {
      const nextVotes = await castMvpVote(matchId, connectedPlayer.id, candidateId);
      setVotes(nextVotes);
    } finally {
      setVoting(false);
    }
  };

  const candidates = status.match
    ? Object.values(getCourtSlots(status.match)).filter(Boolean)
    : [];
  const myVoteId = votes ? votes[connectedPlayer.id] : null;

  return (
    <Modal title="Homme du match 🥇" onClose={onClose}>
      <div className="flex flex-col items-center text-center py-4">
        {status.status === "not-present" && (
          <p className="text-sm text-[var(--color-text-dim)] max-w-xs py-6">
            Reviens ici après ton prochain match pour élire l'homme du match !
          </p>
        )}

        {status.status === "too-early" && (
          <p className="text-sm text-[var(--color-text-dim)] max-w-xs py-6">
            Le vote s'ouvre {MVP_VOTE_OPENS_HOURS_AFTER_START}h après le début
            du match. Reviens un peu plus tard !
          </p>
        )}

        {(status.status === "voting" || status.status === "closed") && votes === undefined && (
          <Spinner />
        )}

        {status.status === "voting" && votes !== undefined && (
          <>
            <p className="text-xs uppercase tracking-wide text-[var(--color-text-faint)] mb-4">
              Match du {formatDateFR(status.match.date)} à {formatTimeFR(status.match.time)}
            </p>

            {myVoteId ? (
              <>
                <p className="text-3xl mb-3">✅</p>
                <p className="pm-display font-bold text-base text-[var(--color-text)] mb-1">
                  Ton vote est comptabilisé !
                </p>
                <p className="text-sm text-[var(--color-text-dim)]">
                  Tu as voté pour{" "}
                  <span className="font-semibold">
                    {getFirstName(playerOf(myVoteId)?.name || "ce joueur")}
                  </span>
                  .
                </p>
              </>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)] max-w-xs py-6">
                Composition introuvable pour ce match.
              </p>
            ) : (
              <>
                <p className="text-sm text-[var(--color-text-dim)] mb-4 max-w-xs">
                  Qui a été le meilleur sur ton terrain ?
                </p>
                <div className="grid grid-cols-2 gap-2.5 w-full">
                  {candidates.map((c) => {
                    const record = playerOf(c.playerId);
                    return (
                      <button
                        key={c.playerId}
                        type="button"
                        disabled={voting}
                        onClick={() => vote(c.playerId)}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white/85 border border-white/70 hover:border-[var(--color-lime)]/60 active:scale-[0.97] transition-all disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <PlayerAvatar player={record} size={44} />
                        <span className="text-xs font-semibold truncate max-w-full">
                          {getFirstName(c.name)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {status.status === "closed" && votes !== undefined && (
          <MvpResult match={status.match} votes={votes} playerOf={playerOf} />
        )}
      </div>
    </Modal>
  );
}

// Écran de résultat une fois le vote clôturé : vainqueur (un seul, ou
// plusieurs ex æquo — tous sont élus, voir lib/mvp.js), ou aucun vote. Puis
// rappel que le prochain vote aura lieu au prochain match.
function MvpResult({ match, votes, playerOf }) {
  const { winnerIds } = computeMvpWinner(votes);
  const winners = winnerIds.map(playerOf).filter(Boolean);

  return (
    <>
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-faint)] mb-3">
        Match du {formatDateFR(match.date)} à {formatTimeFR(match.time)}
      </p>

      {winners.length === 1 ? (
        <>
          <PlayerAvatar player={winners[0]} size={72} className="mb-3" />
          <p className="pm-display font-extrabold text-xl text-[var(--color-text)] mb-1">
            🥇 {winners[0].name}
          </p>
          <p className="text-sm text-[var(--color-text-dim)] mb-6">Homme du match</p>
        </>
      ) : winners.length > 1 ? (
        <>
          <div className="flex items-center justify-center gap-3 flex-wrap mb-3">
            {winners.map((w) => (
              <div key={w.id} className="flex flex-col items-center gap-1.5">
                <PlayerAvatar player={w} size={64} />
                <span className="text-sm font-bold text-[var(--color-text)]">{w.name}</span>
              </div>
            ))}
          </div>
          <p className="pm-display font-extrabold text-lg text-[var(--color-text)] mb-1">
            🥇 Hommes du match
          </p>
          <p className="text-sm text-[var(--color-text-dim)] mb-6">Ex æquo — bravo à tous !</p>
        </>
      ) : (
        <p className="text-sm text-[var(--color-text-dim)] mb-6 max-w-xs">
          Personne n'a voté pour ce match 🙃
        </p>
      )}

      <p className="text-xs text-[var(--color-text-faint)]">
        Prochain vote après le prochain match !
      </p>
    </>
  );
}
