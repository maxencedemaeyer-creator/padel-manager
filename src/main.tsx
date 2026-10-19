import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.jsx';
import {startAutoUpdate} from './lib/autoUpdate.js';
import './index.css';

// Mise à jour automatique : quand un joueur revient sur l'app et qu'une
// nouvelle version a été mise en ligne, la page se recharge toute seule
// (voir src/lib/autoUpdate.js — 0 lecture/écriture Firebase).
startAutoUpdate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
