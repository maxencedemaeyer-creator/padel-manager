// ─────────────────────────────────────────────────────────────────────────
// Volet "Liens entre joueurs" du centre Administration (replié par défaut).
// Outil CONSULTATIF réservé à l'administrateur : il aide à voir qui a déjà
// joué avec / contre qui avant de composer les équipes, et à tenir compte des
// envies confiées à l'admin. Il ne modifie jamais une composition, une
// présence ni un match. Voir claude/spec-outil-liens-joueurs-simulateur-2026-
// 09-19.md dans le projet Claude.
//
// Ce volet n'est rendu que dans AdminView (onglet réservé à l'admin), et les
// préférences ne transitent que par la fonction serveur api/admin-relations.js
// qui revérifie que l'utilisateur est bien administrateur. Pour ouvrir plus
// tard l'outil à un rôle "coach", il suffira d'élargir ces deux contrôles.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { buildLinkContext } from "../../lib/playerLinks";
import { useAdminRelations } from "../../hooks/useAdminRelations";
import { Card, Button } from "../ui";
import Icon from "../icons/Icon";
import { PlayerLinksGrid } from "./PlayerLinksGrid";
import { PlayerLinksFiche } from "./PlayerLinksFiche";
import { PlayerLinksSimulator } from "./PlayerLinksSimulator";

const TABS = [
  ["grid", "Grille"],
  ["fiche", "Fiche joueur"],
  ["sim", "Simulateur"],
];

export function PlayerLinksCard({ players, matches }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("grid");
  const { relations, loading, error, loaded, reload, savePrefs } = useAdminRelations(open);

  // Le calcul n'est fait que volet ouvert, sur les matchs déjà chargés par
  // l'app (aucune lecture Firestore supplémentaire).
  const ctx = useMemo(() => (open ? buildLinkContext(matches, players) : null), [open, matches, players]);

  return (
    <Card className="p-4 sm:p-5 mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 text-left"
        aria-expanded={open}
      >
        <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-sky-100 text-sky-700">
          <Icon.Users className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-sm">Liens entre joueurs</span>
          <span className="block text-[11px] text-[var(--color-text-dim)] mt-0.5">
            Qui a joué avec / contre qui — consultation seulement
          </span>
        </span>
        <Icon.Chevron
          className={cn(
            "w-4 h-4 text-[var(--color-text-faint)] transition-transform shrink-0",
            open && "rotate-90"
          )}
        />
      </button>

      {open && ctx && (
        <div className="mt-4">
          <p className="text-[11px] text-[var(--color-text-dim)] mb-3">
            Outil de consultation, visible de vous seul : il ne modifie aucune composition. C'est
            vous qui placez ensuite les joueurs à la main dans l'onglet Matchs.
          </p>

          {error && (
            <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200">
              <p className="text-[11px] font-semibold text-rose-700 flex items-start gap-1">
                <Icon.AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
              </p>
              <p className="text-[11px] text-rose-700/80 mt-1">
                Les compteurs ci-dessous fonctionnent quand même ; seules les préférences ne sont
                pas disponibles.
              </p>
              <Button variant="secondary" className="!py-1.5 !px-3 !text-xs mt-2" onClick={reload}>
                Réessayer
              </Button>
            </div>
          )}
          {loading && !loaded && (
            <p className="text-[11px] text-[var(--color-text-dim)] mb-3">
              Chargement des préférences...
            </p>
          )}

          <div className="flex bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full p-1 w-fit max-w-full mb-4">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                  tab === id ? "bg-sky-200 text-sky-900" : "text-[var(--color-text-dim)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "grid" && <PlayerLinksGrid ctx={ctx} relations={relations} />}
          {tab === "fiche" && (
            <PlayerLinksFiche
              ctx={ctx}
              relations={relations}
              savePrefs={savePrefs}
              loaded={loaded}
            />
          )}
          {tab === "sim" && <PlayerLinksSimulator ctx={ctx} relations={relations} />}
        </div>
      )}
    </Card>
  );
}
