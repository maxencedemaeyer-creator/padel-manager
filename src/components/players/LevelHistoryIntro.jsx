// ─────────────────────────────────────────────────────────────────────────
// Petite fenêtre de présentation "Nouveau : l'historique de niveau", affichée
// UNE SEULE FOIS à chaque joueur (09/10/2026), pour lui expliquer la nouveauté
// et lui montrer où la trouver (onglet Équipe → petite icône horloge sur la
// carte d'un joueur).
//
// Stockage : Firebase, jamais en local. Quand le joueur ferme la fenêtre, on
// note sur SA fiche (collection "players") que c'est vu :
//   seenFeatures.levelHistory = true
// Une seule écriture par joueur, une fois pour toutes — aucune lecture en plus
// (la fiche du joueur connecté est déjà suivie en temps réel par l'app). Les
// autres champs de seenFeatures ne sont pas touchés : on pourra réutiliser le
// même principe pour de futures nouveautés ("seenFeatures.autreChose").
//
// La fenêtre n'apparaît que si l'historique est réellement visible pour le
// joueur : l'admin le voit toujours, les autres joueurs seulement quand le
// Niveau est activé (switch "rankingEnabled", Administration).
// Monté une seule fois dans App.tsx, donc actif peu importe l'onglet ouvert.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useRef } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Button, Modal } from "../ui";

export function LevelHistoryIntro() {
  const { connectedPlayer, isAdmin, rankingEnabled, setView } = useAppData();
  // Fermeture immédiate côté écran, sans attendre la réponse de Firebase.
  const [closed, setClosed] = useState(false);
  const saving = useRef(false);

  if (!connectedPlayer || closed) return null;
  if (!isAdmin && !rankingEnabled) return null;
  if (connectedPlayer.seenFeatures && connectedPlayer.seenFeatures.levelHistory) return null;

  const markSeenAndClose = (goToTeam = false) => {
    setClosed(true);
    if (goToTeam && typeof setView === "function") setView("players");
    if (saving.current) return;
    saving.current = true;
    updateDoc(doc(db, "players", connectedPlayer.id), {
      "seenFeatures.levelHistory": true,
    }).catch((error) => {
      // Pas bloquant : au pire la fenêtre réapparaîtra à la prochaine visite.
      console.error("Impossible d'enregistrer que la nouveauté a été vue :", error);
    });
  };

  return (
    <Modal
      title="Nouveau : historique de niveau 📈"
      onClose={() => markSeenAndClose(false)}
      footer={
        <>
          <Button variant="secondary" onClick={() => markSeenAndClose(false)}>
            J'ai compris
          </Button>
          <Button onClick={() => markSeenAndClose(true)}>Voir l'onglet Équipe</Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-text)]">
        Tu peux désormais consulter l'<strong>historique de niveau</strong> de chaque joueur
        du club, toi compris : comment son niveau a évolué, soirée après soirée, match après
        match.
      </p>

      <div className="p-3 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)]">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-faint)] mb-2">
          Où le trouver ?
        </p>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="w-9 h-8 rounded-md bg-white border border-[var(--color-lime)]/60 text-[var(--color-lime)] flex items-center justify-center shrink-0 shadow-sm"
          >
            <Icon.History className="w-4 h-4" />
          </span>
          <p className="text-sm text-[var(--color-text-dim)]">
            Onglet <strong>Équipe</strong>, puis touche la petite icône d'horloge en bas à
            droite de la carte d'un joueur.
          </p>
        </div>
      </div>

      <p className="text-xs text-[var(--color-text-faint)]">
        Cette fenêtre ne s'affiche qu'une seule fois.
      </p>
    </Modal>
  );
}
