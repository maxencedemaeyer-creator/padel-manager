// ─────────────────────────────────────────────────────────────────────────
// Publication de la composition d'une session. Le fait qu'un joueur ait
// répondu "présent" (ou que le match approche) n'affiche plus automatiquement
// le terrain : c'est l'administrateur qui compose les équipes tranquillement,
// puis clique sur "Publier la composition" quand il est prêt. Avant cela,
// les joueurs ne voient que leurs boutons de présence (voir
// AvailabilitySessionCard dans SessionCard.jsx) — jamais qui joue où.
//
// Comme pour les présences (voir lib/availability.js), le champ est écrit
// sur CHAQUE terrain de la session en une fois, pour rester cohérent qu'il
// y ait un ou deux terrains ce jour-là : l'admin publie/dépublie toute la
// session d'un coup.
// ─────────────────────────────────────────────────────────────────────────
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

// Publiée uniquement si TOUS les terrains de la session sont marqués comme
// tels (une session avec 0 match n'est jamais considérée comme publiée).
export function isCompositionPublished(sessionMatches) {
  const list = sessionMatches || [];
  return list.length > 0 && list.every((m) => m.compositionPublished === true);
}

export async function setCompositionPublished(sessionMatches, published) {
  await Promise.all(
    (sessionMatches || []).map((m) =>
      updateDoc(doc(db, "matches", m.id), { compositionPublished: published })
    )
  );
}
