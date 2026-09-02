// ─────────────────────────────────────────────────────────────────────────
// Onglet "Équipe" — classement, liste des joueurs (ordre alphabétique).
// ─────────────────────────────────────────────────────────────────────────
import { useState, useMemo } from "react";
import { useAppData } from "../context/AppContext";
import Icon from "../components/icons/Icon";
import { Button, EmptyState } from "../components/ui";
import { ClubRankingBanner } from "../components/players/ClubRankingBanner";
import { PlayerRow } from "../components/players/PlayerRow";
import { AddPlayerModal } from "../components/players/AddPlayerModal";

export function PlayersView() {
  const { players, matches, isAdmin } = useAppData();
  const [showAdd, setShowAdd] = useState(false);

  // Toujours affiché par ordre alphabétique — tri manuel supprimé.
  const sorted = useMemo(() => {
    const arr = [...players].filter((p) => isAdmin || !p.isTest);
    arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [players, isAdmin]);

  return (
    <div className="px-4 pt-4 pb-28">
      <ClubRankingBanner players={players} matches={matches} />

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
