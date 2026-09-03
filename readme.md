# Padel Manager

Application de gestion pour un groupe de padel entre amis : planning des séances, composition des équipes par terrain, présences, statistiques et suivi des avances/dettes entre joueurs. Développée avec l'aide de Claude (Anthropic), en réponse à des demandes de fonctionnalités successives.

- **Site en ligne :** https://padel-manager-omega.vercel.app/
- **Dépôt GitHub :** https://github.com/maxencedemaeyer-creator/padel-manager

## Stack technique

| Couche | Techno |
|---|---|
| Frontend | React 19 + Vite 6 + Tailwind CSS 4 |
| Backend applicatif | Fonctions serverless Vercel (`/api`, Node) |
| Base de données | Firebase Firestore (aucune donnée n'est stockée en local) |
| Authentification technique | Firebase Auth, mode anonyme uniquement |
| Hébergement / déploiement | Vercel, déploiement automatique à chaque push sur `main` |

Aucun framework backend classique : les seuls endpoints serveur sont les 2 fonctions du dossier `api/` (voir plus bas), exécutées à la demande par Vercel.

## Fonctionnalités

- **Matchs / saisons** — création de séances récurrentes ("Saison") ou ponctuelles, plusieurs terrains par créneau, présence des joueurs (Présent / Absent / Je ne sais pas), composition des équipes par l'admin avec publication manuelle (les joueurs ne voient la composition qu'une fois publiée), auto-inscription sur une place libre une fois la compo publiée, encodage du score et détection des désinscriptions tardives.
- **Équipe** — fiche par joueur (niveau, main dominante, côté préféré, fédération, avatar), historique conservé même après suppression (archivage, jamais de suppression réelle).
- **Statistiques** ("Mon profil") — victoires/défaites, forme récente, coéquipier fétiche, duo gagnant, "bête noire", face-à-face entre deux joueurs.
- **Comptabilité** — suivi des avances faites au club par les "créanciers" et des remboursements dus par les autres joueurs, entièrement basé sur les paiements confirmés match par match (aucun ajustement manuel possible, par choix — voir `claude/accounting-module-notes.md` dans le projet Claude pour l'historique de cette décision). Vue personnelle ("Ma comptabilité") pour chaque créancier, vue globale en lecture seule pour l'admin ("Administration").
- **Connexion** — pas de compte email/mot de passe : chaque joueur a un code PIN à 4 chiffres, saisi sur un clavier tactile à l'écran d'accueil.

## Authentification et sécurité — points importants pour la relecture

Ce projet n'utilise **pas** de vrai système de comptes (pas d'email/mot de passe, pas de rôles Firebase Auth). C'est un choix assumé pour un groupe d'amis restreint, avec les limites suivantes, documentées et acceptées par le propriétaire du projet :

- **Connexion par code PIN, pas par compte.** Le clavier PIN (`src/components/auth/AuthGate.jsx`) envoie le code saisi à `api/verify-pin.js`, qui le compare (côté serveur, via le SDK Admin Firebase) au code réel stocké dans la collection Firestore `player_credentials` — verrouillée par les règles Firestore (`allow read, write: if false`), donc illisible depuis n'importe quel navigateur, admin y compris.
- **Authentification anonyme Firebase obligatoire.** Toute lecture/écriture Firestore exige un utilisateur authentifié, même anonyme (voir `src/firebase.js` → `authReady`, et `firestore.rules` → `isSignedIn()`). Ça bloque les scripts qui tapent directement l'API Firestore sans jamais charger le site, mais **ça ne distingue pas un joueur d'un administrateur** au niveau de la base — cette distinction est gérée uniquement côté application (champ `isAdmin` sur le document du joueur, lu par `src/lib/utils.js` → `isPlayerAdmin`).
- **Jeton de session signé pour les actions sensibles.** Depuis le 31/08/2026, changer un code PIN (le sien, ou celui d'un autre joueur en tant qu'admin) exige un jeton signé côté serveur (HMAC-SHA256, `api/_firebaseAdmin.js` → `signSessionToken`/`verifySessionToken`), émis à la connexion et vérifié à chaque appel à `api/manage-pin.js`. Avant ce correctif, n'importe quel appel réseau direct à cette route pouvait écraser le code PIN de n'importe quel joueur, admin y compris — voir `claude/audit-avant-partage-2026-08-31.md` dans le projet Claude pour le détail de la faille et du correctif.
- **Limite connue, non traitée** : un joueur du groupe déjà connecté (donc avec un jeton valide) pourrait en théorie tester les 10 000 combinaisons possibles d'un code PIN via l'action `"check"` de `manage-pin.js` pour deviner le code exact d'un autre joueur (l'app ne fait pas de rate-limiting). De même, `api/verify-pin.js` (le login lui-même) n'a pas de limite anti-brute-force. Une isolation plus stricte nécessiterait une vraie authentification par compte (email/téléphone) avec rôles ("custom claims") — chantier plus lourd, non fait à ce jour.

## Variables d'environnement

Une seule variable, à configurer sur Vercel (Project Settings → Environment Variables) :

| Variable | Où l'obtenir | Utilisée par |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console → Paramètres du projet → Comptes de service → Générer une nouvelle clé privée (JSON complet, collé tel quel) | `api/_firebaseAdmin.js` (SDK Admin Firebase, et signature des jetons de session) |

La configuration Firebase côté client (`src/firebase.js`) est en dur dans le code — ce n'est pas un risque de sécurité, une clé Firebase client est publique par design.

**Réglage Firebase Console requis** (une seule fois) : Authentication → Sign-in method → activer le fournisseur "Anonyme". Sans ça, le site reste bloqué sur l'écran de chargement.

## Développement local

```bash
npm install
npm run dev       # démarre Vite sur http://localhost:3000
npm run build     # build de production (dist/)
npm run lint      # tsc --noEmit (vérification de types)
```

⚠️ `npm run dev` (Vite seul) ne sert **pas** les fonctions du dossier `api/` — elles ne tournent que sur Vercel. Pour les tester en local, utiliser `vercel dev` (CLI Vercel) avec `FIREBASE_SERVICE_ACCOUNT` défini dans un fichier `.env.local`.
