// ─────────────────────────────────────────────────────────────────────────
// Écran d'ouverture (logo + "Padel Manager" sur fond bleu foncé).
//
// L'écran lui-même est écrit en HTML/CSS pur dans index.html (pour qu'il
// s'affiche instantanément, avant le téléchargement de l'app). Ce fichier
// ne fait que le piloter :
//   - <SplashHold />  : "on charge encore" → l'écran reste (ou réapparaît,
//                        par ex. juste après la saisie du code PIN).
//   - <SplashDone />  : "c'est prêt" → le logo s'agrandit (effet de
//                        rapprochement) et on entre dans l'app.
//
// Durée minimale à l'ouverture : le temps que la balle finisse ses rebonds
// (sinon, sur une connexion rapide, l'écran clignoterait à peine).
// Aucune donnée stockée, aucune lecture/écriture Firebase.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect } from "react";

const MIN_FIRST_MS = 1500; // ouverture de l'app : la balle a le temps d'atterrir
const MIN_AGAIN_MS = 500; // réapparition (après le code PIN) : courte pause
const EXIT_MS = 750; // durée de l'effet de zoom (voir index.html)

let shownAt = 0; // 0 = affiché depuis l'ouverture de la page
let hideTimer = null;

function splashEl() {
  return document.getElementById("pm-splash");
}

function isHidden(el) {
  return el.classList.contains("pm-splash-out") || el.classList.contains("pm-splash-gone");
}

export function showSplash() {
  const el = splashEl();
  if (!el) return;
  clearTimeout(hideTimer);
  hideTimer = null;
  if (!isHidden(el)) return; // déjà visible
  el.classList.remove("pm-splash-out", "pm-splash-gone");
  el.classList.add("pm-splash-again"); // balle déjà en place, pas de rebond
  shownAt = performance.now();
}

export function hideSplash() {
  const el = splashEl();
  if (!el || hideTimer || isHidden(el)) return;
  const minUntil = shownAt === 0 ? MIN_FIRST_MS : shownAt + MIN_AGAIN_MS;
  const wait = Math.max(0, minUntil - performance.now());
  hideTimer = setTimeout(() => {
    hideTimer = null;
    el.classList.add("pm-splash-out");
    setTimeout(() => {
      if (el.classList.contains("pm-splash-out")) el.classList.add("pm-splash-gone");
    }, EXIT_MS);
  }, wait);
}

export function SplashHold() {
  useEffect(() => {
    showSplash();
  }, []);
  return null;
}

export function SplashDone() {
  useEffect(() => {
    hideSplash();
  }, []);
  return null;
}
