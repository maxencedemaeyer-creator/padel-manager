// ─────────────────────────────────────────────────────────────────────────
// Fenêtre « Tu es désormais coach ! » (25/10/2026, étape 3 des rôles),
// affichée UNE SEULE FOIS à un joueur qui vient d'être nommé coach, pour
// lui présenter ses nouvelles possibilités et où les trouver.
//
// Stockage : Firebase, jamais en local — même principe que la présentation
// de l'Historique de niveau (LevelHistoryIntro.jsx). À la fermeture, on note
// sur SA fiche : seenFeatures.coachIntro = true (une seule écriture, aucune
// lecture en plus). Si le rôle coach lui est retiré puis rendu plus tard,
// le serveur efface ce drapeau (api/manage-roles.js) : la fenêtre
// réapparaît donc à chaque nouvelle nomination.
// Monté une seule fois dans App.tsx, donc actif peu importe l'onglet ouvert.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useRef } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAppData } from "../../context/AppContext";
import { COACH_PAST_DAYS_LIMIT } from "../../lib/permissions";
import { Button, Modal } from "../ui";

const ITEMS = [
  {
    emoji: "📋",
    title: "Matchs",
    text: "Prépare les sessions (flèche ▸ sur la carte), ouvre ou ferme la convocation, modifie les présences et compose les terrains.",
  },
  {
    emoji: "🎾",
    title: "Scores",
    text: `Encode ou corrige un score, jusqu'à ${COACH_PAST_DAYS_LIMIT} jours après le match.`,
  },
  {
    emoji: "➕",
    title: "Équipe",
    text: "Ajoute un nouveau joueur et envoie-lui son code par WhatsApp.",
  },
  {
    emoji: "🔗",
    title: "Mon profil",
    text: "Tout en bas, l'outil « Liens entre joueurs » pour préparer tes compositions.",
  },
];

export function CoachIntro() {
  const { connectedPlayer, perms } = useAppData();
  // Fermeture immédiate côté écran, sans attendre la réponse de Firebase.
  const [closed, setClosed] = useState(false);
  const saving = useRef(false);

  if (!connectedPlayer || closed) return null;
  if (!perms.isCoach) return null;
  if (connectedPlayer.seenFeatures && connectedPlayer.seenFeatures.coachIntro) return null;

  const markSeenAndClose = () => {
    setClosed(true);
    if (saving.current) return;
    saving.current = true;
    updateDoc(doc(db, "players", connectedPlayer.id), {
      "seenFeatures.coachIntro": true,
    }).catch((error) => {
      // Pas bloquant : au pire la fenêtre réapparaîtra à la prochaine visite.
      console.error("Impossible d'enregistrer que la présentation coach a été vue :", error);
    });
  };

  return (
    <Modal
      title="🎯 Tu es désormais coach !"
      onClose={markSeenAndClose}
      footer={<Button onClick={markSeenAndClose}>OK, compris</Button>}
    >
      <p className="text-sm text-[var(--color-text)] mb-3">
        Voici ce que tu peux faire en plus, et où le trouver :
      </p>
      <ul className="flex flex-col gap-2.5">
        {ITEMS.map((item) => (
          <li
            key={item.title}
            className="flex items-start gap-3 p-3 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)]"
          >
            <span aria-hidden="true" className="text-lg leading-none mt-0.5">
              {item.emoji}
            </span>
            <span className="text-sm text-[var(--color-text-dim)]">
              <strong className="text-[var(--color-text)]">{item.title}</strong> : {item.text}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
