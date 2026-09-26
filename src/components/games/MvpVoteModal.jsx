// ─────────────────────────────────────────────────────────────────────────
// Game Center — Jeu "Homme du match" : après chaque match, les joueurs
// élisent l'homme du match PARMI LEUR PROPRE COMPOSITION (le terrain sur
// lequel ils ont joué, pas toute la session). Vote ouvert
// MVP_VOTE_OPENS_HOURS_AFTER_START heure(s) après le début du match,
// jusqu'à 23h59 le lendemain. Logique et Firestore dans src/lib/mvp.js.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { useAppData } from "../../context/AppContext";
import { useNow } from "../../lib/matchLogic";
import { formatDateFR, formatTimeFR, getFirstName } from "../../lib/utils";
import { MVP_VOTE_OPENS_HOURS_AFTER_START } from "../../lib/constants";
import {
  getMvpStatus,
  fetchSessionVotes,
  getMvpCandidates,
  castMvpVote,
  computeMvpWinner,
  MVP_NOTE_MAX_LENGTH,
} from "../../lib/mvp";
import { Modal, Spinner } from "../ui";
import { MvpVoteHistoryModal } from "./MvpNotesModals";
import { PlayerAvatar } from "../players/PlayerAvatar";

export function MvpVoteModal({ onClose }) {
  const { matches, players, connectedPlayer } = useAppData();
  const now = useNow(30000);
  const status = getMvpStatus(matches, connectedPlayer.id, now);
  const matchId = status.match ? status.match.id : null;

  // undefined = pas encore chargés depuis Firestore.
  const [votes, setVotes] = useState(undefined);
  // Messages laissés au moment du vote { voterId: { text, signed } }.
  const [notes, setNotes] = useState({});
  const [voting, setVoting] = useState(false);
  // Étape de confirmation : joueur choisi (pas encore validé) + message.
  const [pendingId, setPendingId] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [noteSigned, setNoteSigned] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (matchId) {
      setVotes(undefined);
      // Votes de TOUTE la session (tous terrains) — voir lib/mvp.js.
      fetchSessionVotes(matches, status.match).then((data) => {
        if (cancelled) return;
        setVotes(data.votes || {});
        setNotes(data.notes || {});
      });
    }
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const playerOf = (id) => players.find((p) => p.id === id);

  const vote = async () => {
    if (!matchId || !pendingId || voting || (votes && votes[connectedPlayer.id])) return;
    setVoting(true);
    try {
      await castMvpVote(matchId, connectedPlayer.id, pendingId, {
        text: noteText,
        signed: noteSigned,
      });
      // On relit les votes de toute la session (résultat commun à tous les
      // terrains) plutôt que d'utiliser seulement le document de mon match.
      const fresh = await fetchSessionVotes(matches, status.match);
      setVotes(fresh.votes);
      setNotes(fresh.notes);
      setPendingId(null);
    } finally {
      setVoting(false);
    }
  };

  // Tous les joueurs présents lors de la session (26/09/2026), tous terrains
  // et manches confondus, dans une seule liste sans regroupement — triée par
  // prénom (insensible aux accents et à la casse) pour la simplicité.
  const collator = new Intl.Collator("fr", { sensitivity: "base" });
  const candidates = status.match
    ? (() => {
        const { own, others } = getMvpCandidates(matches, status.match);
        return [...own, ...others].sort((a, b) =>
          collator.compare(
            getFirstName(playerOf(a)?.name || ""),
            getFirstName(playerOf(b)?.name || "")
          )
        );
      })()
    : [];
  const myVoteId = votes ? votes[connectedPlayer.id] : null;
  const myNote = notes[connectedPlayer.id];

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
                {myNote?.text && (
                  <p className="text-xs text-[var(--color-text-dim)] mt-3 max-w-xs break-words">
                    Ton message : « {myNote.text} »
                  </p>
                )}
              </>
            ) : pendingId ? (
              <>
                <PlayerAvatar player={playerOf(pendingId)} size={56} className="mb-2" />
                <p className="pm-display font-bold text-base text-[var(--color-text)] mb-3">
                  Ton vote : {getFirstName(playerOf(pendingId)?.name || "ce joueur")}
                </p>
                <label className="w-full text-left text-xs font-semibold text-[var(--color-text-dim)] mb-1">
                  Un petit mot pour {getFirstName(playerOf(pendingId)?.name || "ce joueur")} ?
                  (facultatif)
                </label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value.slice(0, MVP_NOTE_MAX_LENGTH))}
                  maxLength={MVP_NOTE_MAX_LENGTH}
                  rows={3}
                  placeholder="Ex. : Quelle défense, bravo !"
                  className="w-full rounded-xl bg-white/90 border border-[var(--color-border)] px-3 py-2 text-sm resize-none focus:outline-none focus:border-[var(--color-lime)]"
                />
                <p className="w-full text-right text-[11px] text-[var(--color-text-faint)] mt-1">
                  {noteText.length}/{MVP_NOTE_MAX_LENGTH}
                </p>
                {noteText.trim().length > 0 && (
                  <label className="w-full flex items-center gap-2 text-sm text-[var(--color-text)] mt-1 text-left">
                    <input
                      type="checkbox"
                      checked={noteSigned}
                      onChange={(e) => setNoteSigned(e.target.checked)}
                      className="w-4 h-4 accent-[var(--color-lime)]"
                    />
                    Signer mon message (sinon il sera anonyme)
                  </label>
                )}
                <p className="text-[11px] text-[var(--color-text-faint)] mt-3">
                  Ton vote sera définitif.
                </p>
                <div className="flex gap-2 w-full mt-3">
                  <button
                    type="button"
                    disabled={voting}
                    onClick={() => setPendingId(null)}
                    className="flex-1 py-2.5 rounded-xl bg-white/85 border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text-dim)] active:scale-[0.97] transition-all disabled:opacity-40"
                  >
                    Changer
                  </button>
                  <button
                    type="button"
                    disabled={voting}
                    onClick={vote}
                    className="flex-1 py-2.5 rounded-xl bg-[var(--color-lime)] text-white text-sm font-bold active:scale-[0.97] transition-all disabled:opacity-40"
                  >
                    Valider mon vote
                  </button>
                </div>
              </>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)] max-w-xs py-6">
                Composition introuvable pour ce match.
              </p>
            ) : (
              <>
                <p className="text-sm text-[var(--color-text-dim)] mb-4 max-w-xs">
                  Qui a été le meilleur lors de cette session ?
                </p>
                <div className="grid grid-cols-2 gap-2.5 w-full">
                  {candidates.map((candidateId) => {
                    const record = playerOf(candidateId);
                    return (
                      <button
                        key={candidateId}
                        type="button"
                        disabled={voting}
                        onClick={() => setPendingId(candidateId)}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white/85 border border-white/70 hover:border-[var(--color-lime)]/60 active:scale-[0.97] transition-all disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <PlayerAvatar player={record} size={44} />
                        <span className="text-xs font-semibold truncate max-w-full">
                          {getFirstName(record?.name || "Joueur")}
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

        {!pendingId && (
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="mt-4 text-xs font-semibold text-[var(--color-lime-dim)] underline underline-offset-2 active:opacity-70"
          >
            Historique de mes votes
          </button>
        )}
      </div>
      {showHistory && <MvpVoteHistoryModal onClose={() => setShowHistory(false)} />}
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
