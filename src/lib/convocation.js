// ─────────────────────────────────────────────────────────────────────────
// Contrôle de la "convocation" : qui a le droit de répondre présent / absent
// / je ne sais pas encore pour une session, et à partir de quand.
//
// Deux mécanismes, comme pour la fenêtre d'auto-inscription
// (SELF_REGISTRATION_WINDOW_DAYS, voir constants.js et CourtPanel.jsx) :
// - Automatique : la convocation s'ouvre toute seule un certain nombre de
//   jours avant le match (réglage global, voir settings/appConfig →
//   presenceWindowDays, modifiable depuis Administration).
// - Dérogation admin : sur UNE session précise, l'admin peut forcer
//   l'ouverture (même hors fenêtre) ou la fermeture (même dans la fenêtre)
//   via `convocationOverride`, écrit sur chaque terrain de la session — même
//   mécanique que `compositionPublished` (voir lib/composition.js).
//
// IMPORTANT : ce module ne touche JAMAIS au champ `availability` ni à
// `participants`. Il ne fait que décider si les 3 boutons de réponse sont
// affichés à un joueur qui n'a PAS ENCORE répondu (voir AvailabilityButtons
// dans components/matches/Availability.jsx) — un joueur ayant déjà répondu
// garde toujours sa réponse, quel que soit l'état (ouvert/fermé) de la
// convocation à un instant donné, et peut toujours la modifier.
// ─────────────────────────────────────────────────────────────────────────
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { db } from "../firebase";
import { daysUntilMatch, getMatchStart } from "./matchLogic";
import { toLocalISODate } from "./utils";

// "open" : convocation forcée ouverte par l'admin, quelle que soit la date.
// "closed" : convocation forcée fermée par l'admin, quelle que soit la date.
// Absent (null) : comportement automatique, voir isConvocationOpen ci-dessous.
export const CONVOCATION_OVERRIDES = ["open", "closed"];

// Lit la dérogation admin d'une session — un seul champ écrit sur tous les
// terrains de la session à la fois (voir setConvocationOverride ci-dessous),
// donc lire le premier terrain suffit pour connaître l'état de toute la
// session.
export function getConvocationOverride(sessionMatches) {
  const value = (sessionMatches || [])[0]?.convocationOverride;
  return CONVOCATION_OVERRIDES.includes(value) ? value : null;
}

// Vrai si les joueurs peuvent répondre présent / absent / je ne sais pas
// encore pour cette session, à l'instant `now` :
// - une dérogation admin ("open" ou "closed") prime toujours sur tout le
//   reste ;
// - sinon (automatique), ouvert dès que le match est à `presenceWindowDays`
//   jours ou moins (même comparaison que SELF_REGISTRATION_WINDOW_DAYS —
//   voir daysUntilMatch, lib/matchLogic.js).
export function isConvocationOpen(sessionMatches, now, presenceWindowDays) {
  const override = getConvocationOverride(sessionMatches);
  if (override) return override === "open";
  const first = (sessionMatches || [])[0];
  if (!first) return true;
  return daysUntilMatch(first, now) <= presenceWindowDays;
}

// Date ("YYYY-MM-DD") à partir de laquelle la convocation s'ouvrira toute
// seule pour cette session si aucune dérogation admin n'est active — sert
// uniquement à l'afficher aux joueurs qui doivent encore patienter.
export function getAutoOpenDate(sessionMatches, presenceWindowDays) {
  const first = (sessionMatches || [])[0];
  if (!first) return null;
  const openDate = new Date(
    getMatchStart(first).getTime() - presenceWindowDays * 24 * 60 * 60 * 1000
  );
  return toLocalISODate(openDate);
}

// ─────────────────────────────────────────────────────────────────────────
// Convocation ponctuelle d'un joueur OCCASIONNEL (ajout du 10/10/2026).
//
// Un joueur occasionnel n'a normalement aucun bouton Présent / Absent / Je ne
// sais pas (c'est l'admin qui répond pour lui, voir ManagePresenceModal).
// Pour lui permettre de répondre lui-même à UN match précis, l'admin le
// "convoque" depuis la carte du match : son identifiant est alors ajouté à la
// liste `convocationInvites` (tableau d'identifiants de joueurs), écrite sur
// CHAQUE terrain de la session à la fois — même mécanique que
// `convocationOverride` et `compositionPublished`.
//
// Effets d'une convocation (voir Availability.jsx, availability.js et
// MyMatchSummary.jsx) :
// - le joueur voit les 3 boutons de réponse pour cette session, même si la
//   fenêtre de convocation n'est pas encore ouverte ;
// - il apparaît dans "En attente de réponse" tant qu'il n'a pas répondu ;
// - il reçoit le rappel "N'oubliez pas d'indiquer votre présence".
// Retirer la convocation ne supprime JAMAIS une réponse déjà donnée : le joueur
// garde sa réponse, il redevient simplement invisible s'il n'avait pas encore
// répondu. Coût Firebase : 1 écriture par terrain, uniquement quand l'admin
// convoque ou retire une convocation — aucune lecture en plus.
// ─────────────────────────────────────────────────────────────────────────

// Ensemble des identifiants des joueurs convoqués pour cette session
// (réunion des listes de tous les terrains, tolérante à une éventuelle
// désynchronisation entre terrains).
export function getInvitedPlayerIds(sessionMatches) {
  const ids = new Set();
  (sessionMatches || []).forEach((m) => {
    if (Array.isArray(m.convocationInvites)) {
      m.convocationInvites.forEach((id) => ids.add(id));
    }
  });
  return ids;
}

// Remplace la liste des joueurs convoqués sur TOUS les terrains de la session.
// Liste vide → le champ est supprimé (retour à l'état d'origine). Ne touche
// jamais `availability` ni `participants`.
export async function setInvitedPlayers(sessionMatches, playerIds) {
  const list = [...new Set(playerIds || [])];
  await Promise.all(
    (sessionMatches || []).map((m) =>
      updateDoc(doc(db, "matches", m.id), {
        convocationInvites: list.length > 0 ? list : deleteField(),
      })
    )
  );
}

// Écrit (ou efface, si `override` est `null` — retour au mode automatique)
// la dérogation admin sur TOUS les terrains de la session en une fois, pour
// rester cohérent qu'il y ait un ou plusieurs terrains ce jour-là — même
// mécanique que setCompositionPublished (lib/composition.js) et
// setSessionAvailability (lib/availability.js). Ne touche jamais
// `availability` ni `participants` : aucune réponse déjà encodée n'est
// modifiée ou effacée par cet appel, quel que soit l'override choisi.
export async function setConvocationOverride(sessionMatches, override) {
  await Promise.all(
    (sessionMatches || []).map((m) =>
      updateDoc(doc(db, "matches", m.id), {
        convocationOverride: override ? override : deleteField(),
      })
    )
  );
}
