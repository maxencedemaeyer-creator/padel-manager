// ─────────────────────────────────────────────────────────────────────────
// Mise à jour automatique de l'app (19/10/2026).
//
// Problème : sur téléphone, un joueur qui ne ferme jamais l'app la retrouve
// "gelée" telle quelle quand il la rouvre — il continue donc d'utiliser
// l'ANCIENNE version, parfois pendant des jours, sans voir les nouveautés.
//
// Solution : chaque fois que le joueur revient sur l'app (réouverture du
// téléphone, retour sur l'onglet ou sur l'app de l'écran d'accueil), on
// regarde discrètement sur Vercel si une version plus récente a été mise
// en ligne. Si oui, la page se recharge toute seule : l'écran d'ouverture
// s'affiche une seconde, puis le joueur arrive sur la nouvelle version,
// toujours connecté (sa session n'est pas touchée).
//
// Coût : 0 lecture / 0 écriture Firebase. La vérification télécharge
// uniquement la petite page d'accueil du site (~3 Ko) sur Vercel, et au
// maximum une fois par minute.
//
// Comment on sait qu'il y a une nouvelle version : à chaque mise en ligne,
// Vercel donne un nouveau nom au fichier principal de l'app
// (ex. /assets/index-AbC123.js → /assets/index-XyZ789.js). On compare
// simplement le nom chargé par le joueur avec celui de la version en ligne.
// ─────────────────────────────────────────────────────────────────────────

const MIN_GAP_MS = 60 * 1000; // pas plus d'une vérification par minute
const RELOAD_FLAG = "pm-auto-update-target"; // anti-boucle de rechargement

let lastCheck = 0;
let checking = false;

// Nom du fichier principal de l'app actuellement chargé par le joueur.
function currentEntry() {
  const script = document.querySelector('script[type="module"][src*="/assets/"]');
  if (!script) return null;
  try {
    return new URL(script.src, location.href).pathname;
  } catch {
    return null;
  }
}

// Nom du fichier principal de la version actuellement en ligne.
async function onlineEntry() {
  const res = await fetch("/?pm-v=" + Date.now(), { cache: "no-store" });
  if (!res.ok) return null;
  const html = await res.text();
  const match = html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+\.js)"/);
  return match ? new URL(match[1], location.href).pathname : null;
}

// Recharge une seule fois par nouvelle version (évite toute boucle si,
// par exemple, Vercel met quelques secondes à diffuser la nouvelle version).
function reloadOnceFor(target) {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG) === target) return;
    sessionStorage.setItem(RELOAD_FLAG, target);
  } catch {
    // stockage indisponible (navigation privée...) : on recharge quand même
  }
  location.reload();
}

async function checkForUpdate() {
  if (checking || !navigator.onLine) return;
  if (Date.now() - lastCheck < MIN_GAP_MS) return;
  const mine = currentEntry();
  if (!mine) return;
  checking = true;
  lastCheck = Date.now();
  try {
    const online = await onlineEntry();
    if (online && online !== mine) reloadOnceFor(online);
  } catch {
    // pas de réseau, Vercel injoignable... : on réessaiera au prochain retour
  } finally {
    checking = false;
  }
}

export function startAutoUpdate() {
  // En développement local, il n'y a pas de "version en ligne" à comparer.
  if (import.meta.env.DEV) return;

  // Le joueur revient sur l'app (téléphone déverrouillé, onglet réaffiché).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
  // Page restaurée depuis la mémoire du navigateur (bouton retour, Safari).
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) checkForUpdate();
  });
  // Retour du réseau après une coupure.
  window.addEventListener("online", checkForUpdate);

  // Sécurité : si l'ancienne version cherche un morceau d'app qui n'existe
  // plus sur Vercel (ex. le Game Center, chargé à la demande), on recharge
  // au lieu d'afficher une page d'erreur.
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    reloadOnceFor("preload:" + (currentEntry() || ""));
  });

  // Ouverture normale : la page est déjà la dernière version. On efface
  // l'anti-boucle seulement après quelques secondes, pour qu'une nouvelle
  // mise en ligne plus tard puisse à nouveau déclencher un rechargement.
  setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      // ignoré
    }
  }, 10 * 1000);
}
