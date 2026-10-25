// ─────────────────────────────────────────────────────────────────────────
// Droits de chaque rôle — LE fichier unique qui décide « qui peut faire
// quoi » dans l'app (25/10/2026, chantier des rôles, étape 2).
//
// Avant cette étape, la question « est-ce un admin ? » était posée à plus
// de 100 endroits du code (`isAdmin`), sans vue d'ensemble. Désormais
// chaque écran demande un droit précis, par son nom (ex.
// `perms.composeCourts`), et tous les droits sont définis ICI.
//
// Étape 2 (25/10/2026) : chaque droit valait exactement l'ancienne règle.
// Étape 3 (25/10/2026) : arrivée du COACH — il gère les sessions, les
// présences (matchs à venir), la composition des terrains, les scores
// (jusqu'à 30 jours après le match) et peut ajouter un joueur. Il n'a ni la
// compta, ni les rôles, ni les codes PIN, ni les réglages du site, ni la
// suppression d'un match. Pour SA propre présence, il suit les règles d'un
// joueur (gel avant match, fenêtre de convocation).
//
// Rappel : ces droits règlent l'AFFICHAGE (boutons, écrans). Les vrais
// verrous de sécurité (rôles, codes PIN, connexion secrète) sont appliqués
// par le serveur (api/manage-roles.js, api/manage-pin.js) et par
// firestore.rules, depuis l'étape 1.
//
// Les étiquettes « occasionnel » et « invité » ne sont PAS des rôles et ne
// passent pas par ici : leurs comportements restent gérés là où ils sont.
// ─────────────────────────────────────────────────────────────────────────

import { getMatchEnd } from "./matchLogic";

// Le coach peut modifier un score jusqu'à ce nombre de jours après le match
// (l'admin, sans limite), et créer un match ponctuel daté au plus ce nombre
// de jours dans le passé.
export const COACH_PAST_DAYS_LIMIT = 30;

export function getPermissions(player) {
  const admin = player?.isAdmin === true;
  const creditor = player?.isCreditor === true;
  const coach = player?.isCoach === true;
  const staff = admin || coach; // admin ou coach

  return {
    // Rôles bruts (pour les rares cas où l'on a besoin de savoir QUI est la
    // personne, pas ce qu'elle peut faire — ex. libellé de Mon profil).
    isAdmin: admin,
    isCreditor: creditor,
    isCoach: coach,

    // ── Accès à l'app ──────────────────────────────────────────────────
    accessAdminTab: admin, // onglet Admin (barre du bas)
    accessAccountingTab: creditor, // onglet Compta (« Ma comptabilité »)
    accessCoachSection: coach && !admin, // section « Coach » en bas de Mon profil (l'admin a déjà tout dans l'onglet Admin)
    bypassMaintenance: admin, // passe pendant le mode maintenance
    seeGameCenterAlways: admin, // Game Center visible même désactivé pour tous
    seeWithdrawalAlerts: staff, // clochette des désinscriptions tardives

    // ── Niveau ─────────────────────────────────────────────────────────
    seeLevelAlways: admin, // Niveau visible même désactivé pour les joueurs (le coach : comme un joueur)
    seeLevelTechNotes: admin, // messages techniques liés au « Recalcul du niveau »

    // ── Équipe / joueurs ───────────────────────────────────────────────
    seeTestAccounts: admin, // comptes test visibles (listes, présences)
    seeCreditorBadge: admin, // badge « Créancier » dans l'Équipe
    seePlayerDetails: staff, // bouton « i » (main, côté, classement, fédération)
    editPlayers: staff, // ouvrir la fiche d'un joueur (le coach : infos de jeu seulement)
    editPlayerIdentity: admin, // fiche : nom, email, avatar, code PIN
    setOccasional: staff, // fiche : étiquette « joueur occasionnel »
    addPlayers: staff, // bouton « Ajouter » un joueur (le coach : sans rôle)
    restorePlayers: admin, // réactiver un joueur supprimé (archivé)
    editPlayerAdminFields: admin, // fiche : rôles, étiquettes test/invité, connexion secrète, suppression
    manageRoles: admin, // cocher / décocher des rôles (le serveur revérifie)

    // ── Matchs, sessions, composition ──────────────────────────────────
    createMatch: staff, // bouton « + » match ponctuel
    createMatchMaxPastDays: admin ? null : COACH_PAST_DAYS_LIMIT, // null = sans limite
    seeUnpublishedComposition: staff, // voir une composition pas encore publiée
    manageSession: staff, // volet de préparation + barre des 5 boutons d'une session
    composeCourts: staff, // placer / retirer / remplacer des joueurs sur un terrain
    editMatchSettings: staff, // roulette ⚙️ d'un terrain (date, heure, report, remplacement…)
    deleteMatch: admin, // « Supprimer le match »
    manageTBDMatches: staff, // voir et reprogrammer tous les matchs « date inconnue »

    // ── Présences ──────────────────────────────────────────────────────
    ignorePresenceRules: admin, // sa propre présence : ni gel avant match, ni fenêtre de convocation
    editPastPresences: admin, // présences d'un match commencé ou terminé (le coach : matchs à venir seulement)
    // Bouton d'inscription / désinscription sur un terrain : réservé aux
    // non-admins (l'admin compose lui-même les terrains). Le coach l'a,
    // comme un joueur, pour sa propre place.
    selfRegisterOnCourt: !admin,

    // ── Scores ─────────────────────────────────────────────────────────
    editAnyScore: admin, // encoder ou modifier n'importe quel score, sans limite de temps
    editRecentScores: coach, // idem, jusqu'à COACH_PAST_DAYS_LIMIT jours après le match
    markNoScore: staff, // bouton « Pas de score »
    addRoundAnySession: staff, // ajouter une manche à une session où l'on n'a pas joué
    deleteRounds: staff, // supprimer une manche
    scoreReminderAll: admin || creditor || coach, // rappel « score manquant » pour tous les matchs

    // ── Paiements ──────────────────────────────────────────────────────
    managePayments: admin || creditor, // pastilles de paiement cliquables (jamais sa propre place)
    payToAnyCreditor: admin, // attribuer un paiement / une dette à n'importe quel créancier
  };
}

// Peut-on modifier le score (déjà encodé ou non) de CE match ? L'admin
// toujours ; le coach jusqu'à 30 jours après la fin du match ; les autres
// jamais (un joueur encode seulement un score encore vide, voir les écrans).
export function canEditExistingScore(perms, match, now = new Date()) {
  if (!perms || !match) return false;
  if (perms.editAnyScore) return true;
  if (!perms.editRecentScores) return false;
  const end = getMatchEnd(match);
  if (!end || Number.isNaN(end.getTime())) return true;
  return now.getTime() - end.getTime() <= COACH_PAST_DAYS_LIMIT * 24 * 3600 * 1000;
}
