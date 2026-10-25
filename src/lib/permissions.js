// ─────────────────────────────────────────────────────────────────────────
// Droits de chaque rôle — LE fichier unique qui décide « qui peut faire
// quoi » dans l'app (25/10/2026, chantier des rôles, étape 2).
//
// Avant cette étape, la question « est-ce un admin ? » était posée à plus
// de 100 endroits du code (`isAdmin`), sans vue d'ensemble. Désormais
// chaque écran demande un droit précis, par son nom (ex.
// `perms.composeCourts`), et tous les droits sont définis ICI.
//
// Étape 2 = AUCUN changement visible : chaque droit vaut exactement
// l'ancienne règle (le plus souvent « admin »). L'étape 3 (arrivée du
// coach) consistera surtout à ouvrir certains de ces droits au coach, dans
// ce seul fichier.
//
// Rappel : ces droits règlent l'AFFICHAGE (boutons, écrans). Les vrais
// verrous de sécurité (rôles, codes PIN, connexion secrète) sont appliqués
// par le serveur (api/manage-roles.js, api/manage-pin.js) et par
// firestore.rules, depuis l'étape 1.
//
// Les étiquettes « occasionnel » et « invité » ne sont PAS des rôles et ne
// passent pas par ici : leurs comportements restent gérés là où ils sont.
// ─────────────────────────────────────────────────────────────────────────

export function getPermissions(player) {
  const admin = player?.isAdmin === true;
  const creditor = player?.isCreditor === true;
  const coach = player?.isCoach === true; // rôle créé à l'étape 3, sans effet pour l'instant

  return {
    // Rôles bruts (pour les rares cas où l'on a besoin de savoir QUI est la
    // personne, pas ce qu'elle peut faire — ex. libellé de Mon profil).
    isAdmin: admin,
    isCreditor: creditor,
    isCoach: coach,

    // ── Accès à l'app ──────────────────────────────────────────────────
    accessAdminTab: admin, // onglet Admin (barre du bas)
    accessAccountingTab: creditor, // onglet Compta (« Ma comptabilité »)
    bypassMaintenance: admin, // passe pendant le mode maintenance
    seeGameCenterAlways: admin, // Game Center visible même désactivé pour tous
    seeWithdrawalAlerts: admin, // clochette des désinscriptions tardives

    // ── Niveau ─────────────────────────────────────────────────────────
    seeLevelAlways: admin, // Niveau visible même désactivé pour les joueurs
    seeLevelTechNotes: admin, // messages techniques liés au « Recalcul du niveau »

    // ── Équipe / joueurs ───────────────────────────────────────────────
    seeTestAccounts: admin, // comptes test visibles (listes, présences)
    seeCreditorBadge: admin, // badge « Créancier » dans l'Équipe
    seePlayerDetails: admin, // bouton « i » (main, côté, classement, fédération)
    editPlayers: admin, // ouvrir la fiche complète d'un joueur
    addPlayers: admin, // bouton « Ajouter » un joueur
    editPlayerAdminFields: admin, // fiche : rôles, étiquettes, connexion secrète, suppression
    manageRoles: admin, // cocher / décocher des rôles (le serveur revérifie)

    // ── Matchs, sessions, composition ──────────────────────────────────
    createMatch: admin, // bouton « + » match ponctuel
    seeUnpublishedComposition: admin, // voir une composition pas encore publiée
    manageSession: admin, // volet de préparation + barre des 5 boutons d'une session
    composeCourts: admin, // placer / retirer / remplacer des joueurs sur un terrain
    editMatchSettings: admin, // roulette ⚙️ d'un terrain (date, heure, report, suppression…)
    manageTBDMatches: admin, // voir et reprogrammer tous les matchs « date inconnue »

    // ── Présences ──────────────────────────────────────────────────────
    ignorePresenceRules: admin, // sa propre présence : ni gel avant match, ni fenêtre de convocation
    editPastPresences: admin, // présences d'un match commencé ou terminé
    // Bouton d'inscription / désinscription sur un terrain : aujourd'hui
    // réservé aux non-admins (l'admin compose lui-même les terrains).
    selfRegisterOnCourt: !admin,

    // ── Scores ─────────────────────────────────────────────────────────
    editAnyScore: admin, // encoder ou modifier n'importe quel score, même déjà encodé
    markNoScore: admin, // bouton « Pas de score »
    addRoundAnySession: admin, // ajouter une manche à une session où l'on n'a pas joué
    deleteRounds: admin, // supprimer une manche
    scoreReminderAll: admin || creditor, // rappel « score manquant » pour tous les matchs

    // ── Paiements ──────────────────────────────────────────────────────
    managePayments: admin || creditor, // pastilles de paiement cliquables (jamais sa propre place)
    payToAnyCreditor: admin, // attribuer un paiement / une dette à n'importe quel créancier
  };
}
