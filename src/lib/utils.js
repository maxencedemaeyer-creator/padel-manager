// ─────────────────────────────────────────────────────────────────────────
// Petites fonctions utilitaires partagées par plusieurs vues/composants.
// ─────────────────────────────────────────────────────────────────────────

export function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
export const DAYS_SHORT_FR = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];

export function formatDateFR(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return `${DAYS_SHORT_FR[d.getDay()]} ${d.getDate()} ${d.toLocaleDateString("fr-FR", {
    month: "long",
  })}`;
}

// Formate une heure "HH:MM" en écriture française courante ("20:00" → "20h",
// "19:45" → "19h45", "04:05" → "04h05") : on masque les minutes quand elles
// sont nulles, sinon on les garde sur 2 chiffres.
export function formatTimeFR(timeStr) {
  if (!timeStr) return "";
  const [h, m] = String(timeStr).split(":");
  if (!m) return `${h}h`;
  const minutes = parseInt(m, 10);
  if (!minutes) return `${h}h`;
  return `${h}h${m.padStart(2, "0")}`;
}

// Format court d'une date ("2026-09-03" → "03 sept. 2026"), sans le jour de
// la semaine — utilisé pour les petites informations indicatives (ex. la
// période couverte par une créance de départ) où l'espace est limité.
export function formatDateShortFR(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// Libellé compact "Du ... au ..." pour une période couverte, en gérant les
// cas où une seule des deux bornes est renseignée. Retourne null si aucune
// des deux dates n'est définie, pour permettre de masquer la ligne entière.
export function formatClaimPeriodLabel(startDateStr, endDateStr) {
  if (!startDateStr && !endDateStr) return null;
  if (startDateStr && endDateStr) {
    return `Du ${formatDateShortFR(startDateStr)} au ${formatDateShortFR(endDateStr)}`;
  }
  if (startDateStr) return `À partir du ${formatDateShortFR(startDateStr)}`;
  return `Jusqu'au ${formatDateShortFR(endDateStr)}`;
}

// Isole le nom du club depuis un lieu de match ("Club VG — Terrain 6" →
// "Club VG") en retirant le suffixe "Terrain N". Si le lieu ne contient pas
// de nom de club (ex. "Terrain 3" sur un match ponctuel), on retombe sur le
// lieu tel quel plutôt que d'afficher un texte vide.
export function clubNameOnly(location) {
  if (!location) return "";
  const stripped = location.replace(/\s*[-—]\s*Terrain\s*\d+\s*$/i, "").trim();
  return stripped || location;
}

// IMPORTANT : ne jamais utiliser .toISOString() pour obtenir une date
// "YYYY-MM-DD" — ça convertit en UTC et peut faire basculer sur la veille
// selon le fuseau horaire (ex. minuit en Belgique = 22h UTC la veille).
// Cette fonction lit les composants de la date en HEURE LOCALE.
export function toLocalISODate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayISO() {
  return toLocalISODate(new Date());
}

// Note : la génération/vérification de doublon des codes PIN se fait
// désormais via le serveur (api/manage-pin.js — voir AddPlayerModal.jsx,
// EditPlayerModal.jsx, StatsView.jsx), car les codes réels ne sont plus
// jamais présents dans "players" côté navigateur (voir firestore.rules).

export function isPlayerAdmin(player) {
  return player?.isAdmin === true;
}

export function getRecurringDates(startDateStr, intervalDays, count) {
  const dates = [];
  let d = new Date(startDateStr + "T00:00:00");
  for (let i = 0; i < count; i++) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + Number(intervalDays));
  }
  return dates.map((d) => toLocalISODate(d));
}

export function parseFeeInput(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = parseFloat(String(value).replace(",", "."));
  return isNaN(n) ? null : n;
}

// Rétrocompatibilité : d'anciennes fiches joueur en base peuvent encore
// contenir l'ancienne valeur "Les deux" (avant le renommage en "Polyvalent").
export function normalizeSide(value) {
  return value === "Les deux" ? "Polyvalent" : value;
}

export function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
// Isole le prénom (premier mot du nom complet) — utilisé sur mobile où la
// place est trop réduite pour afficher le nom complet.
export function getFirstName(name) {
  const first = String(name || "").trim().split(/\s+/)[0];
  return first || name || "?";
}

// Abréviations compactes pour l'affichage en colonnes de la liste des joueurs.
export function handAbbrev(hand) {
  if (hand === "Gaucher") return "G";
  if (hand === "Ambidextre") return "A";
  return "D";
}
export function sideAbbrev(side) {
  const s = normalizeSide(side);
  if (s === "Gauche") return "G";
  if (s === "Polyvalent") return "P";
  return "D";
}
