// ─────────────────────────────────────────────────────────────────────────
// Petites fonctions utilitaires partagées par plusieurs vues/composants.
// ─────────────────────────────────────────────────────────────────────────
import { ADMIN_MASTER_CODE } from "../firebase";

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

export function generateUniqueCode(players, excludeId = null) {
  const taken = new Set(
    players.filter((p) => p.id !== excludeId).map((p) => p.accessCode)
  );
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (taken.has(code));
  return code;
}

export function findDuplicateOwner(players, code, excludeId = null) {
  if (!code || code.length !== 4) return null;
  return (
    players.find((p) => p.accessCode === code && p.id !== excludeId) || null
  );
}

export function isPlayerAdmin(player) {
  if (!player) return false;
  return player.isAdmin === true || player.accessCode === ADMIN_MASTER_CODE;
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
