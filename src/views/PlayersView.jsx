// ─────────────────────────────────────────────────────────────────────────
// Onglet "Équipe" — classement, tri, liste des joueurs.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useMemo } from "react";
import { getCreditorAccounting } from "../lib/stats";
import { PLAYER_SORT_OPTIONS } from "../lib/constants";
import { useAppData } from "../context/AppContext";
import Icon from "../components/icons/Icon";
import { Button, EmptyState, inputClass, Modal } from "../components/ui";
import { ClubRankingBanner } from "../components/players/ClubRankingBanner";
import { PlayerRow } from "../components/players/PlayerRow";
import { AddPlayerModal } from "../components/players/AddPlayerModal";

export function PlayersView() {
  const { players, matches, isAdmin } = useAppData();
  const [showAdd, setShowAdd] = useState(false);
  const [showCodes, setShowCodes] = useState(false);
  const [sortBy, setSortBy] = useState("name-asc");

  // Liste triée par nom pour l'annuaire des codes — inclut aussi les comptes
  // test, réservés à l'admin de toute façon.
  const codesList = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name)),
    [players]
  );

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

      {isAdmin && (
        <button
          type="button"
          onClick={() => setShowCodes(true)}
          className="mb-4 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold active:scale-[0.98] transition-all"
        >
          <Icon.Key className="w-3.5 h-3.5" />
          Afficher les codes de connexion
        </button>
      )}

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

      {showCodes && isAdmin && (
        <Modal
          title="Codes de connexion"
          onClose={() => setShowCodes(false)}
          wide
        >
          <p className="text-xs text-[var(--color-text-dim)] mb-3">
            Liste confidentielle des codes PIN de connexion — visible
            uniquement par les administrateurs. Pensez à retirer ce bouton
            une fois que vous n'en aurez plus besoin.
          </p>
          <div className="flex flex-col gap-2">
            {codesList.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0">{p.emoji || "🎾"}</span>
                  <span className="text-sm font-semibold truncate">{p.name}</span>
                  {p.isTest && (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-rose-500 shrink-0">
                      test
                    </span>
                  )}
                </div>
                <span className="pm-mono font-bold tracking-[0.3em] text-sm text-[var(--color-lime)] shrink-0">
                  {p.accessCode || "—"}
                </span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
