// ─────────────────────────────────────────────────────────────────────────
// Petits éléments partagés par les trois vues de l'outil "Liens entre
// joueurs" (grille, fiche joueur, simulateur). Voir lib/playerLinks.js.
// Outil réservé à l'administrateur, purement consultatif.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import { getFirstName, formatDateShortFR } from "../../lib/utils";

// Prénom si personne d'autre ne le porte parmi les joueurs affichés, sinon
// nom complet (pour ne jamais confondre deux "Jean").
export function useNameOf(ctx) {
  return useMemo(() => {
    const counts = new Map();
    ctx.ids.forEach((id) => {
      const first = getFirstName(ctx.playersById.get(id)?.name);
      counts.set(first, (counts.get(first) || 0) + 1);
    });
    return (id) => {
      const player = ctx.playersById.get(id);
      if (!player) return "?";
      const first = getFirstName(player.name);
      return (counts.get(first) || 0) > 1 ? player.name : first;
    };
  }, [ctx]);
}

// Couleur d'un compteur selon son niveau (0 = jamais ... 3 = nettement
// élevé par rapport à la moyenne). "Avec" en bleu, "Contre" en orange.
export const HEAT_CLASSES = {
  with: [
    "bg-slate-50 text-slate-300",
    "bg-sky-50 text-sky-600",
    "bg-sky-200 text-sky-900",
    "bg-sky-600 text-white",
  ],
  against: [
    "bg-slate-50 text-slate-300",
    "bg-amber-50 text-amber-700",
    "bg-amber-200 text-amber-900",
    "bg-amber-600 text-white",
  ],
};

// Couleur des voyants du simulateur.
export const STATUS_STYLES = {
  avoid: { dot: "bg-rose-600", pill: "bg-rose-600 text-white", text: "text-rose-700" },
  red: { dot: "bg-rose-500", pill: "bg-rose-100 text-rose-700", text: "text-rose-700" },
  orange: { dot: "bg-amber-500", pill: "bg-amber-100 text-amber-800", text: "text-amber-700" },
  green: { dot: "bg-emerald-500", pill: "bg-emerald-100 text-emerald-700", text: "text-emerald-700" },
  gray: { dot: "bg-slate-300", pill: "bg-slate-100 text-slate-500", text: "text-slate-500" },
};

// Texte discret révélé seulement au toucher d'un repère "à éviter" : qui a
// fait la demande, et depuis quand.
export function avoidDetailText(avoid, nameOf) {
  if (!avoid) return "";
  const who = avoid.requestedBy.map((id) => nameOf(id)).join(" et ");
  const since = avoid.since ? ` (noté le ${formatDateShortFR(avoid.since)})` : "";
  return `À la demande de ${who}${since}`;
}

export function plural(n, singular, pluralForm) {
  return `${n} ${n > 1 ? pluralForm || `${singular}s` : singular}`;
}
