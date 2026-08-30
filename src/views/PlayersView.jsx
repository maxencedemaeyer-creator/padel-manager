// ─────────────────────────────────────────────────────────────────────────
// Onglet "Équipe" — classement, tri, liste des joueurs.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useMemo } from "react";
import { getCreditorAccounting } from "../lib/stats";
import { PLAYER_SORT_OPTIONS } from "../lib/constants";
import { useAppData } from "../context/AppContext";
import Icon from "../components/icons/Icon";
import { Button, EmptyState, inputClass } from "../components/ui";
import { ClubRankingBanner } from "../components/players/ClubRankingBanner";
import { PlayerRow } from "../components/players/PlayerRow";
import { AddPlayerModal } from "../components/players/AddPlayerModal";

export function PlayersView() {
  const { players, matches, isAdmin } = useAppData();
  const [showAdd, setShowAdd] = useState(false);
  const [sortBy, setSortBy] = useState("name-asc");

  // Tri purement local à l'affichage — ne modifie jamais l'ordre dans Firestore.
  const sorted = useMemo(() => {
    const balanceOf = (p) =>
      p.isCreditor ? getCreditorAccounting(p.id, matches).totalPaidAllTime : 0;
    const arr = [...players].filter((p) => isAdmin || !p.isTest);
    switch (sortBy) {
      case "name-desc":
        arr.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "level-desc":
        arr.sort((a, b) => (b.levelSortValue || 0) - (a.levelSortValue || 0));
        break;
      case "level-asc":
        arr.sort((a, b) => (a.levelSortValue || 0) - (b.levelSortValue || 0));
        break;
      case "balance-asc":
        arr.sort((a, b) => balanceOf(a) - balanceOf(b));
        break;
      case "name-asc":
      default:
        arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return arr;
  }, [players, matches, sortBy]);

  return (
    <div className="px-4 pt-4 pb-28">
      <div className="flex items-center justify-between mb-4">
        <h2 className="pm-display font-bold text-xl text-white">Équipe</h2>
        {isAdmin && (
          <Button variant="secondary" className="!py-2 !px-3" onClick={() => setShowAdd(true)}>
            <span className="flex items-center gap-1.5">
              <Icon.Plus className="w-4 h-4" /> Ajouter
            </span>
          </Button>
        )}
      </div>

      <ClubRankingBanner players={players} matches={matches} />

      <div className="mb-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-white/80 mb-1.5">
          Trier par
        </label>
        <select
          className={inputClass}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          {PLAYER_SORT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<Icon.Users className="w-6 h-6" />}
          title="Aucun joueur"
          subtitle="Ajoutez les membres de votre club pour commencer."
        />
      ) : (
        <>
          <div className="grid grid-cols-[36px_1fr_44px_24px_24px_auto] items-center gap-2.5 px-3 mb-1.5">
            <span />
            <span />
            <span className="text-[9px] font-bold uppercase tracking-wide text-white/70 text-center">
              Niv.
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wide text-white/70 text-center">
              Main
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wide text-white/70 text-center">
              Côté
            </span>
            <span />
          </div>
          <div className="flex flex-col gap-2">
            {sorted.map((p) => (
              <PlayerRow key={p.id} player={p} />
            ))}
          </div>
        </>
      )}

      {showAdd && <AddPlayerModal onClose={() => setShowAdd(false)} />}

    </div>
  );
}
