import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        output: {
          // Separe les grosses librairies tierces (React, Firebase) du code
          // propre a l'app dans des fichiers distincts, plutot qu'un seul
          // gros fichier ~1 Mo. Deux effets :
          // 1) le navigateur peut telecharger ces morceaux en parallele au
          //    lieu d'un seul bloc ;
          // 2) surtout, comme React/Firebase changent rarement d'une
          //    livraison de fonctionnalite a l'autre (le contenu de ce
          //    fichier reste identique), le navigateur d'un joueur qui a
          //    deja ouvert l'app garde ce morceau en cache d'une mise a jour
          //    a l'autre et n'a plus qu'a retelecharger le petit fichier
          //    contenant le vrai changement, au lieu de tout retelecharger
          //    a chaque nouvelle fonctionnalite livree.
          manualChunks: {
            'vendor-firebase': [
              'firebase/app',
              'firebase/auth',
              'firebase/firestore',
              'firebase/storage',
            ],
            'vendor-react': ['react', 'react-dom'],
          },
        },
      },
    },
  };
});
