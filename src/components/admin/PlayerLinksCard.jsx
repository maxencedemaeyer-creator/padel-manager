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
// qui revérifie que l'utilisateur est bien administrateur.
//
// Coach (25/10/2026, étape 3 des rôles) : le même volet est proposé en bas
// de « Mon profil » avec `countersOnly` — compteurs, simulateur et test de
// compo seulement. Les confidences (souhaits, joueurs à éviter, modes) ne
// sont alors JAMAIS demandées au serveur, et l'onglet « Fiche joueur »
// (où elles se modifient) n'est pas proposé.
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
import { PlayerLinksCompoTest } from "./PlayerLinksCompoTest";

const TABS = [
  ["grid", "Grille"],
  ["fiche", "Fiche joueur"],
  ["sim", "Simulateur"],
  ["test", "Test de compo"],
];
const NO_RELATIONS = {};

export function PlayerLinksCard({ players, matches, countersOnly = false }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("grid");
  const adminRelations = useAdminRelations(open && !countersOnly);
  const { loading, error, loaded, reload, savePrefs } = adminRelations;
  const relations = countersOnly ? NO_RELATIONS : adminRelations.relations;
  const tabs = countersOnly ? TABS.filter(([id]) => id !== "fiche") : TABS;

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
            {countersOnly
              ? "Outil de consultation : il ne modifie aucune composition. C'est toi qui places ensuite les joueurs à la main dans l'onglet Matchs."
              : "Outil de consultation, visible de vous seul : il ne modifie aucune composition. C'est vous qui placez ensuite les joueurs à la main dans l'onglet Matchs."}
          </p>

          {!countersOnly && error && (
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
          {!countersOnly && loading && !loaded && (
            <p className="text-[11px] text-[var(--color-text-dim)] mb-3">
              Chargement des préférences...
            </p>
          )}

          {/* 4 onglets : 2 × 2 sur téléphone, sur une ligne sur ordinateur */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl sm:rounded-full p-1 w-full sm:w-fit mb-4">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap",
                  tab === id ? "bg-sky-200 text-sky-900" : "text-[var(--color-text-dim)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "grid" && <PlayerLinksGrid ctx={ctx} relations={relations} />}
          {tab === "fiche" && !countersOnly && (
            <PlayerLinksFiche
              ctx={ctx}
              relations={relations}
              savePrefs={savePrefs}
              loaded={loaded}
            />
          )}
          {tab === "sim" && <PlayerLinksSimulator ctx={ctx} relations={relations} />}
          {tab === "test" && <PlayerLinksCompoTest ctx={ctx} relations={relations} />}
        </div>
      )}
    </Card>
  );
}
