export const RECURRENCE_OPTIONS = [
  { label: "Toutes les semaines", days: 7 },
  { label: "Toutes les 2 semaines", days: 14 },
  { label: "Toutes les 3 semaines", days: 21 },
  { label: "Tous les mois", days: 28 },
];

// Corrigé le 18/09/2026 (voir claude/feature-ranking-padel-manager.md §7.4) :
// ces valeurs étaient inversées depuis toujours par rapport à la réalité
// (P50 = niveau le plus FAIBLE, P1000 = le plus FORT — confirmé via les
// grilles réelles FFT/AFPadel). L'ancienne version traitait P50 comme le
// meilleur niveau (value: 100) et P1000 comme le pire (value: 20), ce qui
// faussait silencieusement le placement automatique sur les terrains
// (src/lib/availability.js) et le tri des joueurs (orderBy("levelSortValue",
// "desc") dans src/hooks/useFirestoreData.js). Corriger cette seule
// constante ne suffit pas : voir la migration ponctuelle de
// `levelSortValue` sur les joueurs déjà existants, à lancer une fois depuis
// l'onglet Administration (carte "Mise en place du Ranking").
export const LEVELS = [
  { label: "P50", value: 20 },
  { label: "P100", value: 30 },
  { label: "P200", value: 40 },
  { label: "P300", value: 50 },
  { label: "P400", value: 60 },
  { label: "P500", value: 70 },
  { label: "P600", value: 80 },
  { label: "P700", value: 90 },
  { label: "P1000", value: 100 },
  { label: "Pas de niveau", value: 0 },
];

// Terminologie (21/09/2026) : P50, P100, P200… s'appellent désormais le
// "Classement" (officiel) ; le mot "Niveau" est réservé au nombre calculé de 1
// à 10 (l'ancien "Ranking"). L'option "Pas de niveau" s'affiche donc
// "Non classé" — MAIS sa valeur enregistrée dans Firebase (champ `level` des
// joueurs) reste "Pas de niveau", car le code la compare partout à ce texte.
// À utiliser uniquement pour l'AFFICHAGE d'un classement officiel.
export function levelDisplayLabel(label) {
  return !label || label === "Pas de niveau" ? "Non classé" : label;
}

export const HAND_OPTIONS = ["Droitier", "Gaucher", "Ambidextre"];
export const SIDE_OPTIONS = ["Droite", "Gauche", "Polyvalent"];
export const FEDERATION_OPTIONS = ["Aucune", "AFP", "AFT", "AFP + AFT"];

export const EMOJI_CHOICES = [
  "🍕", "🏆", "🔥", "⚡️", "😎", "🐐", "🚀", "✈️", "💪", "🦁", "🎯",
  "🥇", "🐯", "🦅", "🐺", "🌪️", "⭐", "🐸", "🦈", "🥷", "☀️",
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
// Sécurité "présent mais jamais composé" (voir lib/presenceWatcher.js) : ce
// nombre de minutes après le DÉBUT du match, un joueur toujours déclaré
// "présent" sur une session mais absent de toutes les compositions de cette
// session (ex. plus de présents que de places) bascule automatiquement sur
// "absent" — pour ne pas le laisser indéfiniment "présent" sur un match
// auquel il n'a en réalité pas joué.
export const PRESENCE_AUTO_ABSENT_DELAY_MINUTES = 60;
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

// Game Center — jeu "Brick Breaker" (voir src/lib/brickBreaker.js) :
// - nombre de meilleurs scores conservés (tableau des high scores) ;
export const BRICK_BREAKER_HIGH_SCORES_COUNT = 5;
// - nombre de joueurs affichés dans le classement "a tenté sa chance le
//   plus de fois" (parties jouées, toute la saison).
export const BRICK_BREAKER_TOP_ATTEMPTS_COUNT = 3;

// Convocation (présence) — voir lib/convocation.js : nombre de jours avant
// le match à partir duquel les joueurs peuvent répondre présent / absent /
// je ne sais pas encore, quand aucun réglage n'a encore été défini par
// l'admin depuis Administration (settings/appConfig → presenceWindowDays)
// et qu'aucune dérogation n'est active sur la session (voir
// convocationOverride). Valeur volontairement énorme : tant que Max ne
// resserre pas ce réglage lui-même, la convocation reste ouverte pour tous
// les matchs, exactement comme avant l'introduction de cette fonctionnalité
// — aucune régression sur une saison déjà en cours.
export const DEFAULT_PRESENCE_WINDOW_DAYS = 999;

// Gel de présence avant match (ajouté le 19/09/2026, demande de Max) — voir
// lib/availability.js → isPresenceFrozen et la carte "Gel de présence avant
// match" dans Administration (AdminView.jsx → PresenceLockSettingCard).
// Nombre d'heures avant le début d'un match à partir duquel un joueur ayant
// répondu "présent" (titulaire ou réserve) ne peut plus changer sa réponse
// ni se désinscrire lui-même d'une place — objectif : empêcher les
// désistements "faciles" de dernière minute qui dissuadaient les joueurs de
// se déclarer présents dès qu'ils risquaient de finir en réserve. 0 =
// fonctionnalité désactivée. Contrairement à DEFAULT_PRESENCE_WINDOW_DAYS
// ci-dessus, cette valeur par défaut active bien le gel dès le déploiement
// (demande explicite de Max, pas un réglage à activer après coup).
export const DEFAULT_PRESENCE_LOCK_HOURS = 30;

// Game Center — jeu "Homme du match" (voir src/lib/mvp.js) :
// - le vote s'ouvre ce nombre d'heures après le DÉBUT du match (le vote
//   reste ensuite ouvert jusqu'à 23h59 le lendemain de la date du match,
//   calculé directement dans getMvpWindow) ;
export const MVP_VOTE_OPENS_HOURS_AFTER_START = 1;
// - une fois le vote clôturé, le joueur élu voit un message de félicitations
//   dans le bandeau "Bonjour" de l'onglet Matchs pendant ce nombre de jours.
export const MVP_BADGE_WINDOW_DAYS = 6;

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
