// ─────────────────────────────────────────────────────────────────────────
// Portier global : dès qu'un match "Terminé" n'a pas encore de score et que
// la fenêtre de POST_MATCH_ENCODE_WINDOW_HOURS heures n'est pas dépassée,
// propose au joueur concerné (participant du match, créancier, ou admin)
// d'encoder le score lui-même — sans attendre que l'admin s'en charge.
// Monté une seule fois dans App.tsx, donc actif peu importe l'onglet ouvert.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { POST_MATCH_ENCODE_WINDOW_HOURS } from "../../lib/constants";
import { getMatchEnd, getMatchTiming, hasMatchScore, useNow } from "../../lib/matchLogic";
import { useAppData } from "../../context/AppContext";
import { PostMatchModal } from "./PostMatchModal";

export function PostMatchPrompt() {
  const { connectedPlayer, isAdmin, matches } = useAppData();
  const now = useNow();
  // Fermetures de la session en cours — volontairement pas persisté : le
  // rappel réapparaîtra à la prochaine ouverture du site tant que le score
  // manque et que la fenêtre de 24h n'est pas dépassée.
  const [dismissedIds, setDismissedIds] = useState(() => new Set());

  const eligible = matches.filter((m) => {
    if (dismissedIds.has(m.id)) return false;
    if (getMatchTiming(m, now) !== "finished") return false;
    if (hasMatchScore(m)) return false;
    const end = getMatchEnd(m);
    const windowEnd = new Date(end.getTime() + POST_MATCH_ENCODE_WINDOW_HOURS * 3600000);
    if (now < end || now > windowEnd) return false;
    const isParticipant = (m.participants || []).some(
      (p) => p.playerId === connectedPlayer.id
    );
    return isAdmin || connectedPlayer.isCreditor === true || isParticipant;
  });

  // Priorité aux matchs où le joueur connecté a lui-même joué, puis au plus
  // ancien match terminé en attente de score.
  const sorted = [...eligible].sort((a, b) => {
    const aMine = (a.participants || []).some((p) => p.playerId === connectedPlayer.id);
    const bMine = (b.participants || []).some((p) => p.playerId === connectedPlayer.id);
    if (aMine !== bMine) return aMine ? -1 : 1;
    return getMatchEnd(a) - getMatchEnd(b);
  });

  const target = sorted[0];
  if (!target) return null;

  const dismiss = () => setDismissedIds((prev) => new Set(prev).add(target.id));

  return <PostMatchModal key={target.id} match={target} onClose={dismiss} />;
}
