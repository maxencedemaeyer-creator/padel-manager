// ─────────────────────────────────────────────────────────────────────────
// Filet de sécurité global : jusqu'ici, la moindre erreur JavaScript non
// prévue N'IMPORTE OÙ dans l'app (une donnée ancienne dans un format
// inattendu, un cas limite non testé...) faisait disparaître TOUTE l'app
// d'un coup — écran blanc, sans aucun message, ressenti comme "le site a
// planté". React n'a pas de filet de sécurité par défaut : sans ce
// composant, une erreur de rendu n'importe où (même dans un tout petit
// détail d'affichage) fait s'effondrer l'app entière.
//
// Avec ce composant (monté une seule fois, tout en haut de l'app — voir
// main.tsx), une erreur reste maintenant contenue : au lieu d'un écran
// blanc muet, la personne voit un message clair avec un bouton pour
// recharger, au lieu de devoir deviner qu'il faut fermer/rouvrir l'appli.
// Aucun comportement existant n'est modifié tant qu'aucune erreur ne se
// produit — ce composant ne fait rien d'autre qu'attraper les erreurs.
// ─────────────────────────────────────────────────────────────────────────
import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Toujours utile en cas de souci : visible dans la console développeur
    // du navigateur de la personne concernée, pour pouvoir diagnostiquer
    // après coup sur base de sa description.
    console.error("Erreur non interceptée dans l'app :", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="pm-root min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--color-danger)]/15 border border-[var(--color-danger)]/40 flex items-center justify-center mb-4 text-[var(--color-danger)] text-2xl">
            ⚠️
          </div>
          <h2 className="pm-display font-bold text-xl mb-2">
            Un problème est survenu
          </h2>
          <p className="text-sm text-[var(--color-text-dim)] mb-6">
            Une erreur inattendue a interrompu l'affichage. Vos données ne
            sont pas perdues — elles restent sur le serveur. Rechargez la
            page pour reprendre normalement.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-2xl bg-[var(--color-lime)] text-black font-bold active:scale-[0.98] transition-transform"
          >
            Recharger la page
          </button>
          <p className="text-[11px] text-[var(--color-text-faint)] mt-4">
            Si ça se reproduit, dites à l'administrateur à quel écran c'est
            arrivé — ça aide beaucoup à corriger le problème.
          </p>
        </div>
      </div>
    );
  }
}
