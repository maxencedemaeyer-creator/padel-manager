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
  // Joueurs occasionnels : gardent toutes leurs stats mais restent masqués
  // par défaut de cette liste (moins de bruit visuel) — un bouton en bas
  // permet de les charger à la demande, pour tout le monde (pas admin
  // uniquement), voir feature "joueurs occasionnels".
  const [showOccasional, setShowOccasional] = useState(false);

  // Toujours affiché par ordre alphabétique — tri manuel supprimé.
  const sorted = useMemo(() => {
    const arr = [...players].filter((p) => (isAdmin || !p.isTest) && !p.isOccasional);
    arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [players, isAdmin]);

  const occasionalPlayers = useMemo(() => {
    const arr = [...players].filter((p) => (isAdmin || !p.isTest) && p.isOccasional);
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
                  <PlayerRow key={p.id} player={p} />
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
