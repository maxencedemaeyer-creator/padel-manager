// ─────────────────────────────────────────────────────────────────────────
// Journal d'activité (25/10/2026, chantier des rôles, étape 4).
//
// Chaque action sensible (score, paiement, présence modifiée par quelqu'un
// d'autre, composition, match, joueur, classement…) envoie une ligne au
// journal via la fonction serveur api/activity-log.js. C'est le SERVEUR qui
// note qui a fait l'action (d'après le jeton de connexion) et quand :
// personne ne peut écrire une ligne au nom d'un autre. La collection
// `activityLog` n'est ni lisible ni modifiable depuis un navigateur
// (firestore.rules : refus par défaut) ; seul l'admin la consulte, via le
// serveur (carte « Journal d'activité » de l'onglet Admin).
//
// Règle d'or : le journal ne bloque JAMAIS l'action. `logActivity` n'est
// jamais attendu (pas de `await`), et une erreur est simplement ignorée.
// Les changements de rôle sont journalisés directement par le serveur
// (api/manage-roles.js).
//
// Coût : une écriture (et une lecture, le nom de l'auteur) par action
// journalisée — quelques dizaines par semaine. Aucune lecture tant que
// l'admin n'ouvre pas le journal.
// ─────────────────────────────────────────────────────────────────────────
import { getSetDisplay } from "./matchLogic";

// Jeton de connexion du joueur connecté, fourni par AuthGate.jsx (gardé en
// mémoire seulement, jamais enregistré sur l'appareil par ce module).
let currentToken = null;
export function setActivityLogToken(token) {
  currentToken = token || null;
}

// Types d'action (doivent correspondre à la liste du serveur).
export const ACTIVITY_TYPES = {
  score: "Score",
  payment: "Paiement",
  presence: "Présence",
  composition: "Composition",
  match: "Match",
  player: "Joueur",
  role: "Rôle",
  level: "Classement",
  money: "Abonnement / créance",
};

// « jeu. 23/10 · 20:00 · Club VG — Terrain 2 »
export function matchLabel(match) {
  if (!match) return "match inconnu";
  const parts = [];
  if (match.date) {
    const [y, m, d] = String(match.date).split("-");
    parts.push(d && m ? `${d}/${m}/${y}` : match.date);
  } else {
    parts.push("date inconnue");
  }
  if (match.time) parts.push(match.time);
  if (match.location) parts.push(match.location);
  return parts.join(" · ");
}

// « 6-4 3-6 7-5 » ; « sans score » s'il n'y a rien d'exploitable.
export function scoreLabel(scores) {
  if (!scores) return "sans score";
  const sets = ["set1", "set2", "set3"].map((k) => getSetDisplay(scores[k])).filter(Boolean);
  return sets.length > 0 ? sets.join(" ") : "sans score";
}

export function playerName(players, id) {
  const p = (players || []).find((x) => x.id === id);
  return (p && p.name) || "un joueur";
}

export function logActivity(type, summary) {
  try {
    if (!currentToken || !type || !summary) return;
    fetch("/api/activity-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add",
        actingToken: currentToken,
        type,
        summary: String(summary).slice(0, 300),
      }),
    }).catch(() => {});
  } catch (e) {
    // Jamais bloquant.
  }
}
