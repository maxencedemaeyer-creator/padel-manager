export const RECURRENCE_OPTIONS = [
  { label: "Toutes les semaines", days: 7 },
  { label: "Toutes les 2 semaines", days: 14 },
  { label: "Toutes les 3 semaines", days: 21 },
  { label: "Tous les mois", days: 28 },
];

export const LEVELS = [
  { label: "P50", value: 100 },
  { label: "P100", value: 90 },
  { label: "P200", value: 80 },
  { label: "P300", value: 70 },
  { label: "P400", value: 60 },
  { label: "P500", value: 50 },
  { label: "P600", value: 40 },
  { label: "P700", value: 30 },
  { label: "P1000", value: 20 },
  { label: "Pas de niveau", value: 0 },
];

export const HAND_OPTIONS = ["Droitier", "Gaucher", "Ambidextre"];
export const SIDE_OPTIONS = ["Droite", "Gauche", "Polyvalent"];
export const FEDERATION_OPTIONS = ["Aucune", "AFP", "AFT", "AFP + AFT"];

export const EMOJI_CHOICES = [
  "🎾", "🏆", "🔥", "⚡️", "😎", "🐐", "🚀", "✈️", "💪", "🦁", "🎯",
  "🥇", "🐯", "🦅", "🐺", "🌪️", "⭐", "🐸", "🦈", "🥷",
];
export const AVATAR_COLOR_CHOICES = [
  "#F4EFE7", // beige (défaut)
  "#DCEEE6", // sauge
  "#DCEEF7", // ciel
  "#FCE4E4", // rose
  "#FDF0D5", // ambre
  "#EAE1F7", // violet
  "#D9F2EA", // émeraude
  "#FBE2D3", // orange
];

// Fenêtres/délais réglables — voir README pour ce que chacun contrôle.
export const MATCH_DURATION_MINUTES = 60;
export const SELF_REGISTRATION_WINDOW_DAYS = 14;
export const WITHDRAWAL_RESOLVE_DELAY_MINUTES = 3;
export const WITHDRAWAL_ALERT_WINDOW_HOURS = 72;
// Durée pendant laquelle, après la fin d'un match sans score, les joueurs du
// match + les créanciers (pas seulement l'admin) peuvent corriger la
// composition et encoder le score eux-mêmes — voir PostMatchPrompt.jsx.
export const POST_MATCH_ENCODE_WINDOW_HOURS = 24;
// Fun Center — jeu "Tournée générale" : le tirage au sort n'est ouvert qu'à
// partir de ce nombre d'heures avant le match du jour (voir
// src/lib/tourneeGenerale.js).
export const TOURNEE_GENERALE_ACTIVATION_HOURS_BEFORE = 2;

// Fun Center — jeu "Killer" (voir src/lib/killer.js) :
// - le jeu s'ouvre ce nombre d'heures avant le match du joueur ;
export const KILLER_ACTIVATION_HOURS_BEFORE = 15;
// - la mission du jour peut être récupérée jusqu'à ce nombre de minutes
//   après le début du match (au-delà, place au résultat) ;
export const KILLER_MISSION_CHOICE_DEADLINE_MINUTES = 30;
// - le jeu (et le bouton "Classement") reste accessible ce nombre d'heures
//   après la bascule vers le résultat (donc après le début du match + le
//   délai ci-dessus) ;
export const KILLER_SCOREBOARD_WINDOW_HOURS = 48;
// - barème de points selon le résultat choisi par le joueur.
export const KILLER_POINTS = { success: 3, fail: 1, skipped: 0 };

// Les 4 places d'un terrain sont FIXES et ne bougent jamais, quel que soit le
// joueur assigné — voir getCourtSlots() dans lib/matchLogic.js.
export const COURT_SLOT_DEFS = [
  { key: "topLeft", team: "A", side: "Droite" },
  { key: "topRight", team: "A", side: "Gauche" },
  { key: "bottomLeft", team: "B", side: "Gauche" },
  { key: "bottomRight", team: "B", side: "Droite" },
];

export const PLAYER_SORT_OPTIONS = [
  { id: "name-asc", label: "Nom (A → Z)" },
  { id: "name-desc", label: "Nom (Z → A)" },
  { id: "level-desc", label: "Niveau (fort → faible)" },
  { id: "level-asc", label: "Niveau (faible → fort)" },
  { id: "balance-asc", label: "Solde (débiteur → créditeur)" },
];
