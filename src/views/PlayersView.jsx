// ─────────────────────────────────────────────────────────────────────────
// Onglet "Équipe" — Top 5 du club, liste des joueurs. Par défaut par ordre
// alphabétique des prénoms ; une rangée de boutons "Trier par" permet aussi
// de trier par Niveau, Homme du match, Classement ou Régularité (ajouté le
// 21/09/2026). Chaque tri est toujours départagé par l'ordre alphabétique
// des prénoms, puis par le nom en cas de prénoms identiques.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useMemo } from "react";
import { useAppData } from "../context/AppContext";
import { useMvpVotes } from "../hooks/useFirestoreData";
import { computeMvpWinner } from "../lib/mvp";
import { participantsOf } from "../lib/stats";
import { expandRounds, sessionKeyOf } from "../lib/rounds";
import { getMatchTiming } from "../lib/matchLogic";
import { getPlayerRatingState } from "../lib/levelRating";
import { cn, getFirstName } from "../lib/utils";
import Icon from "../components/icons/Icon";
import { Button, EmptyState } from "../components/ui";
import { ClubRankingBanner } from "../components/players/ClubRankingBanner";
import { PlayerRow } from "../components/players/PlayerRow";
import { AddPlayerModal } from "../components/players/AddPlayerModal";

// Les 5 façons de trier la liste (dans l'ordre d'affichage des boutons).
// - name       : ordre alphabétique des prénoms (tri par défaut)
// - level      : Niveau (nombre calculé), du plus haut au plus bas, les
//                "N.C." tout en bas — bouton masqué tant que le Niveau n'est
//                pas visible pour les joueurs (même règle que la pastille)
// - mvp        : nombre de fois élu "homme du match", du plus au moins
// - rank       : Classement officiel, de P1000 à P50, les non classés en bas
// - regularity : nombre de SESSIONS jouées (1 session = 1 entraînement,
//                quel que soit son nombre de manches), du plus au moins
const SORT_OPTIONS = [
  { id: "name", label: "Nom" },
  { id: "level", label: "Niveau" },
  { id: "mvp", label: "Homme du match" },
  { id: "rank", label: "Classement" },
  { id: "regularity", label: "Régularité" },
];

// Comparaison alphabétique insensible aux accents et aux majuscules :
// d'abord le prénom, puis le nom complet (donc le nom de famille quand les
// prénoms sont identiques), puis l'identifiant pour un ordre toujours stable.
const collator = new Intl.Collator("fr", { sensitivity: "base" });
function compareByName(a, b) {
  return (
    collator.compare(getFirstName(a.name), getFirstName(b.name)) ||
    collator.compare(a.name || "", b.name || "") ||
    String(a.id).localeCompare(String(b.id))
  );
}

export function PlayersView() {
  const { players, matches, isAdmin, rankingEnabled } = useAppData();
  const [showAdd, setShowAdd] = useState(false);
  const [sortId, setSortId] = useState("name");
  // Le Niveau n'est visible que par l'admin, ou par tous une fois le switch
  // "Niveau" activé (Administration) — trier par Niveau révélerait l'ordre,
  // donc le bouton suit exactement la même règle que la pastille.
  const showLevel = isAdmin || rankingEnabled;
  const sortOptions = SORT_OPTIONS.filter((o) => o.id !== "level" || showLevel);
  const activeSort = sortOptions.some((o) => o.id === sortId) ? sortId : "name";
  // Nombre de fois où chaque joueur a été élu "homme du match" (voir jeu du
  // Fun Center, lib/mvp.js) — calculé une seule fois ici à partir du flux
  // temps réel de la collection "mvpVotes", puis distribué à chaque ligne
  // via la prop `mvpCount` (évite une lecture Firestore par joueur).
  const { mvpVotes } = useMvpVotes();
  const mvpCounts = useMemo(() => {
    const counts = {};
    mvpVotes.forEach((voteDoc) => {
      const { winnerIds } = computeMvpWinner(voteDoc.votes || {});
      winnerIds.forEach((playerId) => {
        counts[playerId] = (counts[playerId] || 0) + 1;
      });
    });
    return counts;
  }, [mvpVotes]);
  // Joueurs occasionnels : gardent toutes leurs stats mais restent masqués
  // par défaut de cette liste (moins de bruit visuel) — un bouton en bas
  // permet de les charger à la demande, pour tout le monde (pas admin
  // uniquement), voir feature "joueurs occasionnels".
  const [showOccasional, setShowOccasional] = useState(false);

  // Sessions jouées par joueur — 1 session = 1 entraînement, quel que soit le
  // nombre de manches jouées (corrigé le 26/09/2026 : depuis les manches
  // supplémentaires, compter les matchs faussait la régularité). Une session
  // = même date + même heure + même club ; on la compte une seule fois pour
  // un joueur dès qu'il figure dans une de ses manches (base ou ajoutée),
  // uniquement pour les sessions terminées. Sert au tri "Régularité" ET au
  // nombre affiché sur chaque carte joueur (prop `sessionCount`).
  const sessionCounts = useMemo(() => {
    const sessionsByPlayer = {};
    expandRounds(matches).forEach((m) => {
      if (getMatchTiming(m) !== "finished") return;
      const key = sessionKeyOf(m);
      participantsOf(m).forEach((part) => {
        if (!part?.playerId) return;
        (sessionsByPlayer[part.playerId] ||= new Set()).add(key);
      });
    });
    const counts = {};
    players.forEach((p) => {
      counts[p.id] = sessionsByPlayer[p.id]?.size || 0;
    });
    return counts;
  }, [players, matches]);

  // Applique le tri choisi. Chaque critère est décroissant (le "meilleur" en
  // haut) ; toute égalité est départagée par l'ordre alphabétique des
  // prénoms. Pour le Niveau, l'égalité se juge sur la valeur AFFICHÉE (une
  // décimale) : deux joueurs à "4,2" restent donc en ordre alphabétique. Un
  // joueur sans Niveau ("N.C.") ou sans classement vaut -1, donc tout en bas.
  const sortPlayers = useMemo(() => {
    const metric = (p) => {
      switch (activeSort) {
        case "level": {
          const state = getPlayerRatingState(p);
          return state.hasRanking ? Math.round(state.score * 10) : -1;
        }
        case "rank":
          return p.levelSortValue > 0 ? p.levelSortValue : -1;
        case "mvp":
          return mvpCounts[p.id] || 0;
        case "regularity":
          return sessionCounts[p.id] || 0;
        default:
          return 0;
      }
    };
    return (list) => [...list].sort((a, b) => metric(b) - metric(a) || compareByName(a, b));
  }, [activeSort, mvpCounts, sessionCounts]);

  const sorted = useMemo(
    () => sortPlayers(players.filter((p) => (isAdmin || !p.isTest) && !p.isOccasional)),
    [players, isAdmin, sortPlayers]
  );

  const occasionalPlayers = useMemo(
    () => sortPlayers(players.filter((p) => (isAdmin || !p.isTest) && p.isOccasional)),
    [players, isAdmin, sortPlayers]
  );

  return (
    <div className="px-4 pt-4 pb-28">
      <ClubRankingBanner players={players} matches={matches} />

      <div className="flex items-center justify-between mb-3">
        <h2 className="pm-display font-bold text-xl text-white">Équipe</h2>
        {isAdmin && (
          <Button variant="secondary" className="!py-2 !px-3" onClick={() => setShowAdd(true)}>
            <span className="flex items-center gap-1.5">
              <Icon.Plus className="w-4 h-4" /> Ajouter
            </span>
          </Button>
        )}
      </div>

      {/* Boutons de tri — passent à la ligne sur petit écran pour que tous
          restent visibles sans défilement. Le bouton actif est plein vert,
          les autres sont blancs (lisibles quel que soit le fond). */}
      <div
        role="group"
        aria-label="Trier les joueurs"
        className="flex flex-wrap items-center gap-2 mb-4"
      >
        <span className="text-[11px] font-semibold text-[var(--color-text-dim)]">Trier par</span>
        {sortOptions.map((option) => {
          const active = option.id === activeSort;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setSortId(option.id)}
              aria-pressed={active}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95",
                active
                  ? "bg-[var(--color-lime)] text-white border-transparent shadow-sm"
                  : "bg-white/90 text-[var(--color-text-dim)] border-white/70 hover:bg-white"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<Icon.Users className="w-6 h-6" />}
          title="Aucun joueur"
          subtitle="Ajoutez les membres de votre club pour commencer."
        />
      ) : (
        <>
          {/* En-têtes de colonnes supprimés le 19/09/2026 : la carte
              PlayerRow n'utilise plus une grille CSS à colonnes fixes (voir
              PlayerRow.jsx), ces libellés ("Niv. Main Côté") n'avaient donc
              plus rien à quoi s'aligner sur mobile. */}
          <div className="flex flex-col gap-2">
            {sorted.map((p) => (
              <PlayerRow
                key={p.id}
                player={p}
                mvpCount={mvpCounts[p.id] || 0}
                sessionCount={sessionCounts[p.id] || 0}
              />
            ))}
          </div>
        </>
      )}

      {occasionalPlayers.length > 0 && (
        <div className="mt-6">
          {!showOccasional ? (
            <button
              type="button"
              onClick={() => setShowOccasional(true)}
              className="w-full py-3 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text-dim)] hover:border-[var(--color-lime)]/50 active:scale-[0.98] transition-all"
            >
              Charger les joueurs occasionnels ({occasionalPlayers.length})
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <h3 className="pm-display font-bold text-sm text-white">
                  Joueurs occasionnels
                </h3>
                <button
                  type="button"
                  onClick={() => setShowOccasional(false)}
                  className="text-xs font-semibold text-white/70 hover:text-white underline decoration-dotted"
                >
                  Masquer
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {occasionalPlayers.map((p) => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    mvpCount={mvpCounts[p.id] || 0}
                    sessionCount={sessionCounts[p.id] || 0}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {showAdd && <AddPlayerModal onClose={() => setShowAdd(false)} />}

    </div>
  );
}
