// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────
// Ce fichier est écrit en JavaScript classique (sans annotations de type).
// S'il est utilisé dans un projet TypeScript (App.tsx), la ligne ci-dessus
// désactive la vérification de types stricte pour CE fichier uniquement,
// afin d'éviter les erreurs de build (implicit "any", etc.) — le reste du
// projet TypeScript continue d'être vérifié normalement.
// ─────────────────────────────────────────────────────────────────────────
/**
 * =============================================================================
 *  PADEL MANAGER — Application complète de gestion de club de padel
 * =============================================================================
 *  Stack : React + Tailwind CSS + Firebase (Firestore)
 *
 *  ⚠️ INSTALLATION DANS VOTRE PROJET
 *  --------------------------------------------------------------------------
 *  1. Ce fichier est un composant React autonome, prêt pour la production.
 *     Placez-le dans src/PadelManagerApp.jsx (Vite ou Create React App),
 *     avec Tailwind CSS déjà configuré dans le projet.
 *  2. Installez Firebase :  npm install firebase
 *  3. Remplacez l'objet `firebaseConfig` ci-dessous par la configuration de
 *     votre propre projet Firebase (Console Firebase > Paramètres du projet).
 *  4. Dans la Console Firebase, créez une base Firestore et publiez des règles
 *     de sécurité adaptées à votre club (l'app n'utilise pas Firebase Auth :
 *     l'authentification se fait par code PIN applicatif, voir section 3).
 *  5. Importez et affichez <PadelManagerApp /> dans votre App.jsx racine.
 *
 *  Remarque : cet aperçu ne s'exécute pas dans le bac à sable de Claude.ai
 *  (le SDK Firebase et le localStorage n'y sont pas disponibles) — le code
 *  est destiné à tourner dans votre propre environnement de déploiement.
 * =============================================================================
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useContext,
  createContext,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported as analyticsIsSupported } from "firebase/analytics";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  increment,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

/* =============================================================================
   0. CONFIGURATION FIREBASE — projet "Padel Manager"
   ========================================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyCGKon9mVdOn0FIBY3BvtVX9DPiudF6LJA",
  authDomain: "padel-manager-6f6f3.firebaseapp.com",
  projectId: "padel-manager-6f6f3",
  storageBucket: "padel-manager-6f6f3.firebasestorage.app",
  messagingSenderId: "42822367197",
  appId: "1:42822367197:web:d1fca198e220f1f7602834",
  measurementId: "G-14KPMP7L30",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Analytics : chargé uniquement côté navigateur, et seulement si le
// contexte le supporte (évite toute erreur en SSR ou navigateurs restrictifs).
let analytics;
if (typeof window !== "undefined") {
  analyticsIsSupported()
    .then((supported) => {
      if (supported) analytics = getAnalytics(firebaseApp);
    })
    .catch(() => {
      // Analytics non disponible dans cet environnement : on ignore.
    });
}

const SESSION_KEY = "padelManagerSession";
const ADMIN_MASTER_CODE = "4812"; // Code admin de secours (Maxence)

/* =============================================================================
   1. DESIGN TOKENS — palette "crème pastel élégante" (blanc chaud / bleu doux / sauge)
   ========================================================================= */
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');

      :root{
        --color-bg: #FAF8F5;
        --color-surface: #FFFFFF;
        --color-surface-2: #F4EFE7;
        --color-border: #E8E2D8;
        --color-text: #1E293B;
        --color-text-dim: #64748B;
        --color-text-faint: #94A3B8;
        --color-lime: #6FA98A;
        --color-lime-dim: #5B8F73;
        --color-blue: #7DB8DB;
        --color-paid: #34D399;
        --color-unpaid: #FB923C;
        --color-danger: #F87171;
        --font-display: 'Space Grotesk', sans-serif;
        --font-body: 'Inter', sans-serif;
        --font-mono: 'JetBrains Mono', monospace;
      }

      .pm-root{
        font-family: var(--font-body);
        background:
          radial-gradient(circle at 15% 0%, rgba(111,169,138,0.07), transparent 40%),
          radial-gradient(circle at 100% 20%, rgba(125,184,219,0.09), transparent 45%),
          var(--color-bg);
        color: var(--color-text);
        min-height: 100vh;
      }
      .pm-root *{ font-family: inherit; }
      .pm-display{ font-family: var(--font-display); letter-spacing: -0.02em; }
      .pm-mono{ font-family: var(--font-mono); }

      .pm-scroll::-webkit-scrollbar{ display:none; }
      .pm-scroll{ -ms-overflow-style:none; scrollbar-width:none; }

      .pm-scroll-visible{ scrollbar-width: thin; scrollbar-color: var(--color-border) transparent; }
      .pm-scroll-visible::-webkit-scrollbar{ width: 6px; }
      .pm-scroll-visible::-webkit-scrollbar-track{ background: transparent; }
      .pm-scroll-visible::-webkit-scrollbar-thumb{ background-color: var(--color-border); border-radius: 999px; }

      @keyframes pm-pulse{
        0%,100%{ opacity:1; } 50%{ opacity:.45; }
      }
      .pm-pulse{ animation: pm-pulse 1.6s ease-in-out infinite; }

      @keyframes pm-shake{
        10%,90%{ transform: translateX(-2px); }
        20%,80%{ transform: translateX(4px); }
        30%,50%,70%{ transform: translateX(-8px); }
        40%,60%{ transform: translateX(8px); }
      }
      .pm-shake{ animation: pm-shake 0.5s cubic-bezier(.36,.07,.19,.97); }

      @keyframes pm-rise{
        from{ opacity:0; transform: translateY(12px); }
        to{ opacity:1; transform: translateY(0); }
      }
      .pm-rise{ animation: pm-rise .35s ease-out both; }

      @keyframes pm-fade{
        from{ opacity:0; } to{ opacity:1; }
      }
      .pm-fade{ animation: pm-fade .2s ease-out both; }
    `}</style>
  );
}

/* =============================================================================
   2. ICONES (SVG inline — aucune dépendance externe)
   ========================================================================= */
const Icon = {
  Ball: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M6 5c2.5 2 2.5 12 0 14M18 5c-2.5 2-2.5 12 0 14" />
    </svg>
  ),
  Users: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c.8-3.6 3-5.4 5.5-5.4s4.7 1.8 5.5 5.4" />
      <circle cx="17" cy="8.5" r="2.5" />
      <path d="M15.5 14.9c2.2.2 3.9 2 4.5 5.1" />
    </svg>
  ),
  Shield: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M12 3l7 3v6c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  Plus: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  X: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  Logout: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  Dice: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  Check: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" {...p}>
      <path d="M4 12l5 5L20 6" />
    </svg>
  ),
  Edit: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  ),
  Chart: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M4 20V10M12 20V4M20 20v-7" />
      <path d="M3 20h18" />
    </svg>
  ),
  Swords: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M5 4l7 7-3 3-7-7V4h3z" />
      <path d="M19 4l-7 7 3 3 7-7V4h-3z" />
      <path d="M8 14l-4 4M16 14l4 4" />
    </svg>
  ),
  Chevron: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  ),
  Backspace: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M9 5h11a1 1 0 011 1v12a1 1 0 01-1 1H9l-6-7 6-7z" />
      <path d="M13 10l4 4M17 10l-4 4" />
    </svg>
  ),
  Calendar: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  Coin: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 15.2c.4.9 1.4 1.5 2.5 1.5 1.6 0 2.8-1 2.8-2.3 0-3-5.3-1.6-5.3-4.6 0-1.3 1.2-2.3 2.8-2.3 1.1 0 2 .5 2.5 1.4M12 6.3v1.2M12 16.5v1.2" />
    </svg>
  ),
  Trophy: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M8 4h8v5a4 4 0 01-8 0V4z" />
      <path d="M8 5H4v1a4 4 0 004 4M16 5h4v1a4 4 0 01-4 4" />
      <path d="M12 13v3M9 20h6M10 20v-2h4v2" />
    </svg>
  ),
};

/* =============================================================================
   3. UTILITAIRES
   ========================================================================= */
function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const DAYS_SHORT_FR = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];

function formatDateFR(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return `${DAYS_SHORT_FR[d.getDay()]} ${d.getDate()} ${d.toLocaleDateString("fr-FR", {
    month: "long",
  })}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function generateUniqueCode(players, excludeId = null) {
  const taken = new Set(
    players.filter((p) => p.id !== excludeId).map((p) => p.accessCode)
  );
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (taken.has(code));
  return code;
}

function findDuplicateOwner(players, code, excludeId = null) {
  if (!code || code.length !== 4) return null;
  return (
    players.find((p) => p.accessCode === code && p.id !== excludeId) || null
  );
}

function isPlayerAdmin(player) {
  if (!player) return false;
  return player.isAdmin === true || player.accessCode === ADMIN_MASTER_CODE;
}

function getRecurringDates(startDateStr, intervalDays, count) {
  const dates = [];
  let d = new Date(startDateStr + "T00:00:00");
  for (let i = 0; i < count; i++) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + Number(intervalDays));
  }
  return dates.map((d) => d.toISOString().slice(0, 10));
}

function parseFeeInput(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = parseFloat(String(value).replace(",", "."));
  return isNaN(n) ? null : n;
}

const RECURRENCE_OPTIONS = [
  { label: "Toutes les semaines", days: 7 },
  { label: "Toutes les 2 semaines", days: 14 },
  { label: "Toutes les 3 semaines", days: 21 },
  { label: "Tous les mois", days: 28 },
];

const LEVELS = [
  { label: "P50", value: 100 },
  { label: "P100", value: 90 },
  { label: "P200", value: 80 },
  { label: "P300", value: 70 },
  { label: "P400", value: 60 },
  { label: "P500", value: 50 },
  { label: "P600", value: 40 },
  { label: "P700", value: 30 },
  { label: "P1000", value: 20 },
  { label: "Pas de niveau", value: 0 },
];

const HAND_OPTIONS = ["Droitier", "Gaucher", "Ambidextre"];
const SIDE_OPTIONS = ["Droite", "Gauche", "Polyvalent"];

// Rétrocompatibilité : d'anciennes fiches joueur en base peuvent encore
// contenir l'ancienne valeur "Les deux" (avant le renommage en "Polyvalent").
function normalizeSide(value) {
  return value === "Les deux" ? "Polyvalent" : value;
}
const FEDERATION_OPTIONS = ["Aucune", "AFP", "AFT", "AFP + AFT"];

const EMOJI_CHOICES = ["🎾", "🏆", "🔥", "⚡️", "😎", "🐐", "🚀", "💪", "🦁", "🎯"];

/* =============================================================================
   4. HOOKS FIRESTORE (lecture temps réel)
   ========================================================================= */
function usePlayers() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub = () => {};
    try {
      const q = query(collection(db, "players"), orderBy("levelSortValue", "desc"));
      unsub = onSnapshot(
        q,
        (snap) => {
          setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoading(false);
        },
        (error) => {
          console.error(error);
          alert("Erreur Firestore : " + error.message);
          setLoading(false);
        }
      );
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
      setLoading(false);
    }
    return () => unsub();
  }, []);

  return { players, loading };
}

function useMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub = () => {};
    try {
      const q = query(
        collection(db, "matches"),
        orderBy("date", "asc"),
        orderBy("time", "asc")
      );
      unsub = onSnapshot(
        q,
        (snap) => {
          setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoading(false);
        },
        (error) => {
          console.error(error);
          alert("Erreur Firestore : " + error.message);
          setLoading(false);
        }
      );
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
      setLoading(false);
    }
    return () => unsub();
  }, []);

  return { matches, loading };
}

/* =============================================================================
   5. CONTEXTE APPLICATIF (session + données partagées)
   ========================================================================= */
const AppDataContext = createContext(null);
function useAppData() {
  return useContext(AppDataContext);
}

/* =============================================================================
   6. PETITS COMPOSANTS UI RÉUTILISABLES
   ========================================================================= */
function Badge({ children, tone = "neutral", className = "" }) {
  const tones = {
    neutral: "bg-stone-100 text-stone-500 border-stone-200",
    paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
    unpaid: "bg-rose-100 text-rose-700 border-rose-200",
    lime: "bg-teal-100 text-teal-700 border-teal-200",
    blue: "bg-sky-100 text-sky-700 border-sky-200",
    danger: "bg-rose-100 text-rose-600 border-rose-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

function Button({ children, variant = "primary", className = "", ...rest }) {
  const variants = {
    primary:
      "bg-sky-200 text-sky-900 hover:bg-sky-300 active:scale-[0.98] shadow-sm shadow-sky-200/60",
    secondary:
      "bg-white text-[var(--color-text)] border border-stone-200/60 hover:border-sky-300 active:scale-[0.98] shadow-sm",
    ghost: "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
    danger: "bg-rose-100 text-rose-700 border border-rose-200",
  };
  return (
    <button
      className={cn(
        "px-4 py-3 rounded-2xl font-semibold text-sm transition-all disabled:opacity-40 disabled:pointer-events-none",
        variants[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function Card({ children, className = "" }) {
  return (
    <div
      className={cn(
        "bg-[var(--color-surface)] border border-stone-200/60 rounded-2xl shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

function Modal({ title, onClose, children, footer, wide = false }) {
  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto pm-fade">
      <div
        className={cn(
          "relative w-full max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden pm-rise",
          wide ? "max-w-lg" : "max-w-sm"
        )}
      >
        <div className="p-4 border-b border-stone-200 flex justify-between items-center bg-stone-50 shrink-0">
          <h3 className="pm-display font-bold text-lg text-[var(--color-text)]">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white border border-stone-200 text-[var(--color-text-dim)] hover:text-[var(--color-text)] shrink-0"
          >
            <Icon.X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3 flex-1 pm-scroll-visible">{children}</div>
        {footer && (
          <div className="p-4 border-t border-stone-200 bg-stone-50 flex justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
  // Portail : la fenêtre est attachée directement à <body>, donc jamais
  // affectée par un parent (transform, filtre, overflow...) qui casserait
  // son positionnement "fixed".
  return createPortal(content, document.body);
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full px-4 py-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-faint)] focus:outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100 transition-shadow text-sm";

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Icon.Ball className="w-8 h-8 text-[var(--color-lime)] pm-pulse" />
    </div>
  );
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center mb-4 text-[var(--color-text-faint)]">
        {icon}
      </div>
      <p className="font-semibold text-[var(--color-text)] mb-1">{title}</p>
      {subtitle && (
        <p className="text-sm text-[var(--color-text-dim)] max-w-xs">{subtitle}</p>
      )}
    </div>
  );
}

/* =============================================================================
   7. AUTHENTIFICATION — sélection joueur + clavier PIN tactile
   ========================================================================= */
function PlayerTile({ player, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-lime)]/60 active:scale-[0.97] transition-all"
    >
      <div className="w-14 h-14 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-2xl">
        {player.emoji || "🎾"}
      </div>
      <span className="text-xs font-semibold text-center leading-tight">
        {player.name}
      </span>
    </button>
  );
}

function PinKeypad({ player, onBack, onSuccess }) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState(false);

  const press = (d) => {
    if (digits.length >= 4 || error) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === 4) {
      setTimeout(() => {
        if (next === player.accessCode) {
          onSuccess(player);
        } else {
          setError(true);
          setTimeout(() => {
            setError(false);
            setDigits("");
          }, 550);
        }
      }, 120);
    }
  };
  const backspace = () => setDigits((d) => d.slice(0, -1));

  return (
    <div className="flex flex-col items-center pm-rise">
      <button
        onClick={onBack}
        className="self-start flex items-center gap-1 text-sm text-[var(--color-text-dim)] mb-4"
      >
        <Icon.Chevron className="w-4 h-4 rotate-180" /> Retour
      </button>

      <div className="w-16 h-16 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-3xl mb-3">
        {player.emoji || "🎾"}
      </div>
      <p className="pm-display font-bold text-lg mb-1">{player.name}</p>
      <p className="text-xs text-[var(--color-text-dim)] mb-6">
        Entrez votre code à 4 chiffres
      </p>

      <div
        className={cn(
          "flex gap-4 mb-8",
          error && "pm-shake"
        )}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "w-4 h-4 rounded-full border-2 transition-colors",
              error
                ? "border-[var(--color-danger)] bg-[var(--color-danger)]"
                : i < digits.length
                ? "border-[var(--color-lime)] bg-[var(--color-lime)]"
                : "border-[var(--color-border)] bg-transparent"
            )}
          />
        ))}
      </div>
      {error && (
        <p className="text-[var(--color-danger)] text-xs font-semibold -mt-5 mb-5">
          Code incorrect, réessayez
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            className="pm-mono aspect-square rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] text-xl font-bold hover:border-[var(--color-lime)]/50 active:scale-95 transition-all"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          onClick={() => press("0")}
          className="pm-mono aspect-square rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] text-xl font-bold hover:border-[var(--color-lime)]/50 active:scale-95 transition-all"
        >
          0
        </button>
        <button
          onClick={backspace}
          className="aspect-square rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-dim)] active:scale-95 transition-all"
        >
          <Icon.Backspace className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

function BootstrapAdmin() {
  const [name, setName] = useState("Maxence");
  const [code, setCode] = useState(ADMIN_MASTER_CODE);
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim() || code.length !== 4) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "players"), {
        name: name.trim(),
        email: "",
        accessCode: code,
        isAdmin: true,
        isCreditor: true,
        creditBalance: 0,
        level: "Pas de niveau",
        levelSortValue: 0,
        emoji: "🎾",
        dominantHand: "Droitier",
        preferredSide: "Polyvalent",
        federation: "Aucune",
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-sm pm-rise">
      <div className="w-14 h-14 rounded-2xl bg-[var(--color-lime)]/15 border border-[var(--color-lime)]/40 flex items-center justify-center mb-4 text-[var(--color-lime)]">
        <Icon.Shield className="w-7 h-7" />
      </div>
      <h2 className="pm-display font-bold text-2xl mb-1">Bienvenue 👋</h2>
      <p className="text-sm text-[var(--color-text-dim)] mb-6">
        Aucun joueur n'existe encore. Créez le premier compte, administrateur
        du club, pour démarrer.
      </p>
      <Field label="Nom de l'administrateur">
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. Maxence"
        />
      </Field>
      <Field label="Code PIN (4 chiffres)">
        <input
          className={cn(inputClass, "pm-mono tracking-[0.3em] text-center")}
          value={code}
          maxLength={4}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
        />
      </Field>
      <Button
        className="w-full mt-2"
        onClick={create}
        disabled={saving || !name.trim() || code.length !== 4}
      >
        {saving ? "Création..." : "Créer le compte administrateur"}
      </Button>
    </div>
  );
}

function AuthGate({ children }) {
  const { players, loading } = usePlayers();
  const [connectedPlayer, setConnectedPlayer] = useState(null);
  const [selectedForPin, setSelectedForPin] = useState(null);
  const [restoring, setRestoring] = useState(true);

  // Restauration de session (localStorage)
  useEffect(() => {
    if (loading) return;
    try {
      const savedId = localStorage.getItem(SESSION_KEY);
      if (savedId) {
        const found = players.find((p) => p.id === savedId);
        if (found) setConnectedPlayer(found);
      }
    } catch (e) {
      // localStorage indisponible : on ignore silencieusement
    }
    setRestoring(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Garder le joueur connecté synchronisé avec les mises à jour temps réel
  useEffect(() => {
    if (connectedPlayer) {
      const fresh = players.find((p) => p.id === connectedPlayer.id);
      if (fresh && JSON.stringify(fresh) !== JSON.stringify(connectedPlayer)) {
        setConnectedPlayer(fresh);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players]);

  const login = (player) => {
    setConnectedPlayer(player);
    try {
      localStorage.setItem(SESSION_KEY, player.id);
    } catch (e) {}
  };

  const logout = () => {
    setConnectedPlayer(null);
    setSelectedForPin(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  };

  if (loading || restoring) {
    return (
      <div className="pm-root flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  if (connectedPlayer) {
    return (
      <AppDataContext.Provider
        value={{ connectedPlayer, isAdmin: isPlayerAdmin(connectedPlayer), logout, players }}
      >
        {children}
      </AppDataContext.Provider>
    );
  }

  return (
    <div className="pm-root flex flex-col items-center justify-center min-h-screen px-6 py-10">
      {players.length === 0 ? (
        <BootstrapAdmin />
      ) : selectedForPin ? (
        <PinKeypad
          player={selectedForPin}
          onBack={() => setSelectedForPin(null)}
          onSuccess={login}
        />
      ) : (
        <div className="w-full max-w-sm pm-rise">
          <div className="flex items-center gap-2 mb-1">
            <Icon.Ball className="w-7 h-7 text-[var(--color-lime)]" />
            <h1 className="pm-display font-extrabold text-2xl">Padel Manager</h1>
          </div>
          <p className="text-sm text-[var(--color-text-dim)] mb-7">
            Sélectionnez votre profil pour vous connecter
          </p>
          <div className="grid grid-cols-3 gap-3">
            {players.map((p) => (
              <PlayerTile key={p.id} player={p} onClick={() => setSelectedForPin(p)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* =============================================================================
   8. LAYOUT — header fixe + navigation basse
   ========================================================================= */
function Header() {
  const { connectedPlayer, isAdmin, logout } = useAppData();
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-5 py-4 bg-[var(--color-bg)]/90 backdrop-blur-md border-b border-[var(--color-border)]">
      <div className="flex items-center gap-2">
        <Icon.Ball className="w-5 h-5 text-[var(--color-lime)]" />
        <span className="pm-display font-extrabold text-base">Padel Manager</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)]">
          <span className="w-7 h-7 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-sm">
            {connectedPlayer.emoji || "🎾"}
          </span>
          <span className="text-xs font-semibold max-w-[80px] truncate">
            {connectedPlayer.name}
          </span>
          {isAdmin && (
            <Badge tone="lime" className="!px-1.5 !py-0.5">
              Admin
            </Badge>
          )}
        </div>
        <button
          onClick={logout}
          aria-label="Déconnexion"
          className="p-2.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/40"
        >
          <Icon.Logout className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}

function BottomNav({ view, setView }) {
  const { isAdmin, connectedPlayer } = useAppData();
  const tabs = [
    { id: "matches", label: "Matchs", icon: Icon.Trophy },
    { id: "players", label: "Joueurs", icon: Icon.Users },
    { id: "stats", label: "Stats", icon: Icon.Chart },
    ...(connectedPlayer.isCreditor
      ? [{ id: "accounting", label: "Compta", icon: Icon.Coin }]
      : []),
    ...(isAdmin ? [{ id: "admin", label: "Administration", icon: Icon.Shield }] : []),
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-[var(--color-bg)]/95 backdrop-blur-md border-t border-[var(--color-border)] flex px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
      {tabs.map((t) => {
        const active = view === t.id;
        const IconEl = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className="flex-1 flex flex-col items-center gap-1 py-1.5"
          >
            <IconEl
              className={cn(
                "w-5 h-5",
                active ? "text-sky-600" : "text-[var(--color-text-faint)]"
              )}
            />
            <span
              className={cn(
                "text-[11px] font-semibold",
                active ? "text-sky-600" : "text-[var(--color-text-faint)]"
              )}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/* =============================================================================
   9. JOUEURS — liste + formulaire admin avec anti-doublon PIN
   ========================================================================= */
function InfoChip({ children }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-surface-2)] text-[var(--color-text-dim)] border border-[var(--color-border)]">
      {children}
    </span>
  );
}

function EditPlayerModal({ player, onClose }) {
  const { isAdmin, players } = useAppData();

  // Champs de jeu — modifiables par le joueur lui-même ou par l'admin
  const [dominantHand, setDominantHand] = useState(player.dominantHand || "Droitier");
  const [preferredSide, setPreferredSide] = useState(
    normalizeSide(player.preferredSide) || "Polyvalent"
  );
  const [federation, setFederation] = useState(player.federation || "Aucune");
  const [level, setLevel] = useState(player.level || "Pas de niveau");

  // Champs de profil complets — modifiables uniquement par l'administrateur
  const [name, setName] = useState(player.name || "");
  const [email, setEmail] = useState(player.email || "");
  const [emoji, setEmoji] = useState(player.emoji || "🎾");
  const [accessCode, setAccessCode] = useState(player.accessCode || "");
  const [playerIsAdmin, setPlayerIsAdmin] = useState(player.isAdmin === true);
  const [isCreditor, setIsCreditor] = useState(player.isCreditor === true);
  const [advancedAmount, setAdvancedAmount] = useState(
    player.advancedAmount != null ? String(player.advancedAmount) : ""
  );

  const [saving, setSaving] = useState(false);

  const duplicateOwner = useMemo(
    () => (isAdmin ? findDuplicateOwner(players, accessCode, player.id) : null),
    [isAdmin, players, accessCode, player.id]
  );
  const generateCode = () => setAccessCode(generateUniqueCode(players, player.id));

  const canSubmit = isAdmin
    ? name.trim().length > 0 && accessCode.length === 4 && !duplicateOwner
    : true;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const levelInfo = LEVELS.find((l) => l.label === level);
      const payload = {
        dominantHand,
        preferredSide,
        federation,
        level,
        levelSortValue: levelInfo ? levelInfo.value : 0,
      };
      if (isAdmin) {
        Object.assign(payload, {
          name: name.trim(),
          email: email.trim(),
          emoji,
          accessCode,
          isAdmin: playerIsAdmin,
          isCreditor,
          advancedAmount: parseFeeInput(advancedAmount),
        });
      }
      await updateDoc(doc(db, "players", player.id), payload);
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Profil de ${player.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </>
      }
    >
      {!isAdmin && (
        <p className="text-xs text-[var(--color-text-dim)] mb-4">
          Seules les informations de jeu ci-dessous peuvent être modifiées ici.
        </p>
      )}

      {isAdmin && (
        <>
          <Field label="Avatar">
            <div className="flex flex-wrap gap-2">
              {EMOJI_CHOICES.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-lg border transition-all",
                    emoji === e
                      ? "border-[var(--color-lime)] bg-[var(--color-lime)]/15"
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Nom complet">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Camille Dupuis"
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="camille@email.com"
            />
          </Field>

          <Field label="Code PIN (4 chiffres)">
            <div className="flex gap-2">
              <input
                className={cn(inputClass, "pm-mono tracking-[0.3em] text-center")}
                value={accessCode}
                maxLength={4}
                onChange={(e) =>
                  setAccessCode(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
              />
              <button
                onClick={generateCode}
                className="px-4 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-lime)] flex items-center gap-1.5 text-xs font-semibold shrink-0"
              >
                <Icon.Dice className="w-4 h-4" /> Générer
              </button>
            </div>
            {duplicateOwner && (
              <p className="text-[var(--color-danger)] text-xs font-semibold mt-2">
                ⚠️ Ce code est déjà attribué à {duplicateOwner.name}. Veuillez en
                choisir un autre.
              </p>
            )}
          </Field>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Main dominante">
          <select
            className={inputClass}
            value={dominantHand}
            onChange={(e) => setDominantHand(e.target.value)}
          >
            {HAND_OPTIONS.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </Field>
        <Field label="Position de jeu">
          <select
            className={inputClass}
            value={preferredSide}
            onChange={(e) => setPreferredSide(e.target.value)}
          >
            {SIDE_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Fédération">
        <select
          className={inputClass}
          value={federation}
          onChange={(e) => setFederation(e.target.value)}
        >
          {FEDERATION_OPTIONS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </Field>

      <Field label="Niveau estimé">
        <select className={inputClass} value={level} onChange={(e) => setLevel(e.target.value)}>
          {LEVELS.map((l) => (
            <option key={l.label} value={l.label}>
              {l.label}
            </option>
          ))}
        </select>
      </Field>

      {isAdmin && (
        <div className="flex flex-col gap-2 mb-2">
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={playerIsAdmin}
              onChange={(e) => setPlayerIsAdmin(e.target.checked)}
              className="w-4 h-4 accent-[var(--color-lime)]"
            />
            Administrateur (gestion complète du club)
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={isCreditor}
              onChange={(e) => setIsCreditor(e.target.checked)}
              className="w-4 h-4 accent-[var(--color-lime)]"
            />
            Créancier (peut recevoir des paiements de match)
          </label>
          {isCreditor && (
            <Field label="Montant avancé au club — € (optionnel)">
              <input
                type="text"
                inputMode="decimal"
                className={inputClass}
                value={advancedAmount}
                onChange={(e) => setAdvancedAmount(e.target.value)}
                placeholder="Ex. 300"
              />
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}

function PlayerRow({ player }) {
  const { isAdmin, connectedPlayer, matches } = useAppData();
  const [showEdit, setShowEdit] = useState(false);
  const levelInfo = LEVELS.find((l) => l.value === player.levelSortValue);
  const canEdit = isAdmin || player.id === connectedPlayer.id;
  const adjustedBalance = player.isCreditor
    ? getCreditorAccounting(player.id, matches).totalPaidAllTime + (player.manualAdjustment || 0)
    : 0;

  return (
    <>
      <Card className="p-4 flex items-center gap-3">
        <div className="w-11 h-11 shrink-0 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-xl">
          {player.emoji || "🎾"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm truncate">{player.name}</span>
            {isPlayerAdmin(player) && (
              <Badge tone="lime" className="!px-1.5 !py-0.5 !text-[10px]">
                Admin
              </Badge>
            )}
            {player.isCreditor && (
              <Badge tone="blue" className="!px-1.5 !py-0.5 !text-[10px]">
                Créancier
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <InfoChip>{levelInfo?.label || player.level || "Pas de niveau"}</InfoChip>
            <InfoChip>{player.dominantHand || "—"}</InfoChip>
            <InfoChip>Côté {normalizeSide(player.preferredSide) || "—"}</InfoChip>
            {player.federation && player.federation !== "Aucune" && (
              <InfoChip>{player.federation}</InfoChip>
            )}
          </div>
        </div>
        {player.isCreditor && (
          <div className="text-right shrink-0">
            <p className="pm-mono font-bold text-[var(--color-lime)] text-sm">
              {adjustedBalance.toLocaleString("fr-FR")} €
          </div>
        )}
        {canEdit && (
          <button
            onClick={() => setShowEdit(true)}
            aria-label="Modifier le profil"
            className="p-2.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-sky-700 hover:border-sky-300 shrink-0"
          >
            <Icon.Edit className="w-4 h-4" />
          </button>
        )}
      </Card>
      {showEdit && <EditPlayerModal player={player} onClose={() => setShowEdit(false)} />}
    </>
  );
}

function AddPlayerModal({ onClose }) {
  const { players } = useAppData();
  const [form, setForm] = useState({
    name: "",
    email: "",
    accessCode: "",
    isAdmin: false,
    isCreditor: false,
    level: "Pas de niveau",
    dominantHand: "Droitier",
    preferredSide: "Polyvalent",
    federation: "Aucune",
    emoji: "🎾",
  });
  const [saving, setSaving] = useState(false);

  const duplicateOwner = useMemo(
    () => findDuplicateOwner(players, form.accessCode),
    [players, form.accessCode]
  );

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const generateCode = () => setF("accessCode", generateUniqueCode(players));

  const canSubmit =
    form.name.trim().length > 0 && form.accessCode.length === 4 && !duplicateOwner;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const levelInfo = LEVELS.find((l) => l.label === form.level);
      await addDoc(collection(db, "players"), {
        name: form.name.trim(),
        email: form.email.trim(),
        accessCode: form.accessCode,
        isAdmin: form.isAdmin,
        isCreditor: form.isCreditor,
        creditBalance: 0,
        level: form.level,
        levelSortValue: levelInfo ? levelInfo.value : 0,
        emoji: form.emoji,
        dominantHand: form.dominantHand,
        preferredSide: form.preferredSide,
        federation: form.federation,
        createdAt: serverTimestamp(),
      });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Ajouter un joueur"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Ajout en cours..." : "Ajouter le joueur"}
          </Button>
        </>
      }
    >
      <Field label="Avatar">
        <div className="flex flex-wrap gap-2">
          {EMOJI_CHOICES.map((e) => (
            <button
              key={e}
              onClick={() => setF("emoji", e)}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center text-lg border transition-all",
                form.emoji === e
                  ? "border-[var(--color-lime)] bg-[var(--color-lime)]/15"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Nom complet">
        <input
          className={inputClass}
          value={form.name}
          onChange={(e) => setF("name", e.target.value)}
          placeholder="Ex. Camille Dupuis"
        />
      </Field>

      <Field label="Email">
        <input
          type="email"
          className={inputClass}
          value={form.email}
          onChange={(e) => setF("email", e.target.value)}
          placeholder="camille@email.com"
        />
      </Field>

      <Field label="Code PIN (4 chiffres)">
        <div className="flex gap-2">
          <input
            className={cn(inputClass, "pm-mono tracking-[0.3em] text-center")}
            value={form.accessCode}
            maxLength={4}
            onChange={(e) => setF("accessCode", e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="0000"
          />
          <button
            onClick={generateCode}
            className="px-4 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-lime)] flex items-center gap-1.5 text-xs font-semibold shrink-0"
          >
            <Icon.Dice className="w-4 h-4" /> Générer
          </button>
        </div>
        {duplicateOwner && (
          <p className="text-[var(--color-danger)] text-xs font-semibold mt-2">
            ⚠️ Ce code est déjà attribué à {duplicateOwner.name}. Veuillez en
            choisir un autre.
          </p>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Niveau">
          <select
            className={inputClass}
            value={form.level}
            onChange={(e) => setF("level", e.target.value)}
          >
            {LEVELS.map((l) => (
              <option key={l.label} value={l.label}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Main dominante">
          <select
            className={inputClass}
            value={form.dominantHand}
            onChange={(e) => setF("dominantHand", e.target.value)}
          >
            {HAND_OPTIONS.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Côté préféré">
          <select
            className={inputClass}
            value={form.preferredSide}
            onChange={(e) => setF("preferredSide", e.target.value)}
          >
            {SIDE_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Fédération">
          <select
            className={inputClass}
            value={form.federation}
            onChange={(e) => setF("federation", e.target.value)}
          >
            {FEDERATION_OPTIONS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-col gap-2 mb-2">
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.isAdmin}
            onChange={(e) => setF("isAdmin", e.target.checked)}
            className="w-4 h-4 accent-[var(--color-lime)]"
          />
          Administrateur (gestion complète du club)
        </label>
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.isCreditor}
            onChange={(e) => setF("isCreditor", e.target.checked)}
            className="w-4 h-4 accent-[var(--color-lime)]"
          />
          Créancier (peut recevoir des paiements de match)
        </label>
      </div>
    </Modal>
  );
}

const PLAYER_SORT_OPTIONS = [
  { id: "name-asc", label: "Nom (A → Z)" },
  { id: "name-desc", label: "Nom (Z → A)" },
  { id: "level-desc", label: "Niveau (fort → faible)" },
  { id: "level-asc", label: "Niveau (faible → fort)" },
  { id: "balance-asc", label: "Solde (débiteur → créditeur)" },
];

function PlayersView() {
  const { players, matches, isAdmin } = useAppData();
  const [showAdd, setShowAdd] = useState(false);
  const [sortBy, setSortBy] = useState("name-asc");

  // Tri purement local à l'affichage — ne modifie jamais l'ordre dans Firestore.
  const sorted = useMemo(() => {
    const balanceOf = (p) =>
      p.isCreditor
        ? getCreditorAccounting(p.id, matches).totalPaidAllTime + (p.manualAdjustment || 0)
        : 0;
    const arr = [...players];
    switch (sortBy) {
      case "name-desc":
        arr.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "level-desc":
        arr.sort((a, b) => (b.levelSortValue || 0) - (a.levelSortValue || 0));
        break;
      case "level-asc":
        arr.sort((a, b) => (a.levelSortValue || 0) - (b.levelSortValue || 0));
        break;
      case "balance-asc":
        arr.sort((a, b) => balanceOf(a) - balanceOf(b));
        break;
      case "name-asc":
      default:
        arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return arr;
  }, [players, matches, sortBy]);

  return (
    <div className="px-4 pt-4 pb-28">
      <div className="flex items-center justify-between mb-4">
        <h2 className="pm-display font-bold text-xl">Joueurs</h2>
        {isAdmin && (
          <Button variant="secondary" className="!py-2 !px-3" onClick={() => setShowAdd(true)}>
            <span className="flex items-center gap-1.5">
              <Icon.Plus className="w-4 h-4" /> Ajouter
            </span>
          </Button>
        )}
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
          Trier par
        </label>
        <select
          className={inputClass}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          {PLAYER_SORT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<Icon.Users className="w-6 h-6" />}
          title="Aucun joueur"
          subtitle="Ajoutez les membres de votre club pour commencer."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((p) => (
            <PlayerRow key={p.id} player={p} />
          ))}
        </div>
      )}

      {showAdd && <AddPlayerModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

/* =============================================================================
   10. PAIEMENTS — modale de sélection du créancier
   ========================================================================= */
function PaymentModal({ match, participant, onClose }) {
  const { players, matches, isAdmin, connectedPlayer } = useAppData();
  const allCreditors = players.filter((p) => p.isCreditor === true);
  const creditors = isAdmin
    ? allCreditors
    : allCreditors.filter((c) => c.id === connectedPlayer.id);
  const [saving, setSaving] = useState(false);

  const confirmPayment = async (creditor) => {
    setSaving(true);
    try {
      const updatedParticipants = match.participants.map((p) =>
        p.playerId === participant.playerId
          ? { ...p, paidStatus: "paid", creditorId: creditor.id }
          : p
      );
      await updateDoc(doc(db, "matches", match.id), {
        participants: updatedParticipants,
      });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="À quel créancier ce joueur a-t-il payé ?" onClose={onClose}>
      <p className="text-sm text-[var(--color-text-dim)] mb-4">
        Paiement de <span className="font-semibold text-[var(--color-text)]">{participant.name}</span> —{" "}
        {(match.matchFeePerPlayer || 0).toLocaleString("fr-FR")} €
      </p>
      {creditors.length === 0 ? (
        <EmptyState
          icon={<Icon.Coin className="w-6 h-6" />}
          title="Aucun créancier disponible"
          subtitle="Activez l'option « Créancier » sur au moins un joueur, depuis l'onglet Joueurs."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {creditors.map((c) => {
            const adjustedBalance =
              getCreditorAccounting(c.id, matches).totalPaidAllTime + (c.manualAdjustment || 0);
            return (
              <button
                key={c.id}
                disabled={saving}
                onClick={() => confirmPayment(c)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)] hover:border-[var(--color-lime)]/50 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <span className="w-10 h-10 rounded-full bg-[var(--color-surface)] flex items-center justify-center text-lg">
                  {c.emoji || "🎾"}
                </span>
                <span className="flex-1 text-left">
                  <span className="block text-sm font-semibold">{c.name}</span>
                  <span className="block text-xs text-[var(--color-text-dim)]">
                    Solde actuel : {adjustedBalance.toLocaleString("fr-FR")} €
                  </span>
                </span>
                <Icon.Chevron className="w-4 h-4 text-[var(--color-text-faint)]" />
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/* =============================================================================
   11. MATCHS — cartes, création (ponctuel / saison), fin de match
   ========================================================================= */
const MATCH_DURATION_MINUTES = 60; // un match dure 1h : commence à l'heure encodée, terminé 1h plus tard

function getMatchStart(match) {
  return new Date(`${match.date}T${match.time || "00:00"}:00`);
}
function getMatchEnd(match) {
  return new Date(getMatchStart(match).getTime() + MATCH_DURATION_MINUTES * 60000);
}
// Le statut n'est plus déclenché manuellement par un bouton : il est calculé
// automatiquement à partir de l'heure de début encodée et de sa durée fixe.
function getMatchTiming(match, now = new Date()) {
  const start = getMatchStart(match);
  const end = getMatchEnd(match);
  if (now < start) return "upcoming";
  if (now < end) return "ongoing";
  return "finished";
}
function hasMatchScore(match) {
  const s = match.scores || {};
  return Boolean(s.set1 || s.set2 || s.set3);
}
// Comptabilité créancier — tout est recalculé en direct à partir des matchs
// et des participants, jamais depuis un compteur qui pourrait se désynchroniser.
function getCreditorAccounting(creditorId, matches) {
  let totalPaidAllTime = 0; // tout paiement confirmé, peu importe la date du match
  let totalPaidPastMatches = 0; // uniquement les matchs déjà passés
  let selfReimbursed = 0; // matchs déjà joués par le créancier lui-même
  const paymentsReceived = [];

  matches.forEach((m) => {
    const fee = m.matchFeePerPlayer || 0;
    const finished = getMatchTiming(m) === "finished";
    (m.participants || []).forEach((p) => {
      if (p.paidStatus === "paid" && p.creditorId === creditorId) {
        totalPaidAllTime += fee;
        if (finished) {
          totalPaidPastMatches += fee;
          paymentsReceived.push({ matchId: m.id, date: m.date, name: p.name, fee });
        }
      }
      if (p.playerId === creditorId && finished) {
        selfReimbursed += fee;
      }
    });
  });

  paymentsReceived.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { totalPaidAllTime, totalPaidPastMatches, selfReimbursed, paymentsReceived };
}

// Les 3 façons distinctes de répartir 4 joueurs en 2 équipes de 2.
// Indices dans le tableau des 4 joueurs sélectionnés (ordre de sélection).
const PAIRING_PATTERNS = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

// Statistiques d'un joueur — uniquement sur les matchs déjà terminés.
// Coéquipier/adversaire ne sont comptabilisés que si l'équipe (team: "A"/"B")
// a été renseignée lors de l'assignation ; victoire/défaite uniquement si
// l'équipe gagnante a aussi été renseignée en fin de match.
function computePlayerStats(playerId, matches) {
  let played = 0;
  let wins = 0;
  let losses = 0;
  const partnerCounts = new Map();
  const opponentCounts = new Map();

  matches.forEach((m) => {
    if (getMatchTiming(m) !== "finished") return;
    const participants = m.participants || [];
    const me = participants.find((p) => p.playerId === playerId);
    if (!me) return;
    played += 1;

    if (me.team && m.winningTeam) {
      if (me.team === m.winningTeam) wins += 1;
      else losses += 1;
    }

    if (me.team) {
      participants.forEach((p) => {
        if (p.playerId === playerId || !p.team) return;
        const map = p.team === me.team ? partnerCounts : opponentCounts;
        map.set(p.playerId, (map.get(p.playerId) || 0) + 1);
      });
    }
  });

  const topOf = (map) => {
    let best = null;
    map.forEach((count, id) => {
      if (!best || count > best.count) best = { id, count };
    });
    return best;
  };

  const decided = wins + losses;
  return {
    played,
    wins,
    losses,
    winRate: decided > 0 ? Math.round((wins / decided) * 100) : 0,
    topPartner: topOf(partnerCounts),
    topOpponent: topOf(opponentCounts),
  };
}

// Garde l'affichage à jour minute par minute (un match "à venir" doit basculer
// tout seul en "terminé" sans que personne n'ait à rafraîchir la page).
function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function StatusBadge({ match, now }) {
  const timing = getMatchTiming(match, now);
  if (timing === "ongoing")
    return (
      <Badge tone="lime" className="pm-pulse">
        ● En cours
      </Badge>
    );
  if (timing === "finished") return <Badge tone="neutral">Terminé</Badge>;
  return <Badge tone="blue">À venir</Badge>;
}

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Répartit les 4 emplacements d'un match en 2 équipes de 2 (haut / bas du filet).
// Utilise l'équipe (team: "A"/"B") si connue, complète dans l'ordre sinon —
// ne modifie aucune donnée, se contente d'organiser l'affichage.
function getCourtSlots(match) {
  const participants = match.participants || [];
  const top = participants.filter((p) => p.team === "A");
  const bottom = participants.filter((p) => p.team === "B");
  const untracked = participants.filter((p) => p.team !== "A" && p.team !== "B");
  untracked.forEach((p) => {
    if (top.length < 2) top.push(p);
    else if (bottom.length < 2) bottom.push(p);
  });
  while (top.length < 2) top.push(null);
  while (bottom.length < 2) bottom.push(null);
  return { top: top.slice(0, 2), bottom: bottom.slice(0, 2) };
}

function PlayerSlotCard({
  participant,
  playerRecord,
  canAssign,
  canPay,
  isCreditorParticipant,
  onAssignClick,
  onPayClick,
}) {
  if (!participant) {
    return (
      <div
        role={canAssign ? "button" : undefined}
        tabIndex={canAssign ? 0 : undefined}
        onClick={canAssign ? onAssignClick : undefined}
        className={cn(
          "flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 border-dashed min-h-[86px] text-center",
          canAssign
            ? "border-[var(--color-border)] text-[var(--color-text-faint)] cursor-pointer hover:border-sky-300 hover:text-sky-600"
            : "border-[var(--color-border)]/60 text-[var(--color-text-faint)]/70"
        )}
      >
        <Icon.Plus className="w-4 h-4" />
        <span className="text-[11px] font-medium">Emplacement libre</span>
      </div>
    );
  }

  const paid = isCreditorParticipant || participant.paidStatus === "paid";
  const badgeTone = isCreditorParticipant ? "blue" : paid ? "paid" : "unpaid";
  const badgeLabel = isCreditorParticipant ? "Avancé" : paid ? "Payé" : "Attente";
  const side = normalizeSide(playerRecord?.preferredSide);
  const roleLabel =
    side === "Droite" ? "Joueur de droite" : side === "Gauche" ? "Joueur de gauche" : "Polyvalent";

  return (
    <div
      role={canAssign ? "button" : undefined}
      tabIndex={canAssign ? 0 : undefined}
      onClick={canAssign ? onAssignClick : undefined}
      className={cn(
        "flex items-start gap-2 p-3 rounded-xl border bg-white min-h-[86px]",
        canAssign ? "cursor-pointer hover:border-sky-300" : "border-[var(--color-border)]"
      )}
    >
      <span className="w-9 h-9 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-xs font-bold text-[var(--color-text)] shrink-0">
        {getInitials(participant.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold truncate">{participant.name}</span>
        <span className="block text-[10px] text-[var(--color-text-faint)] mb-1">{roleLabel}</span>
        <span className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={!canPay || paid}
            onClick={(e) => {
              e.stopPropagation();
              if (canPay && !paid) onPayClick();
            }}
          >
            <Badge tone={badgeTone} className="!px-1.5 !py-0.5 !text-[10px]">
              {badgeLabel}
            </Badge>
          </button>
          {isCreditorParticipant && (
            <Badge tone="lime" className="!px-1.5 !py-0.5 !text-[10px]">
              Créancier
            </Badge>
          )}
        </span>
      </span>
    </div>
  );
}

function EndMatchModal({ match, onClose }) {
  const { players } = useAppData();
  const [set1, setSet1] = useState(match.scores?.set1 || "");
  const [set2, setSet2] = useState(match.scores?.set2 || "");
  const [set3, setSet3] = useState(match.scores?.set3 || "");
  const [type, setType] = useState(match.matchType || "Officiel");
  const [winningTeam, setWinningTeam] = useState(match.winningTeam || "");
  const [saving, setSaving] = useState(false);

  const teamAParticipants = (match.participants || []).filter((p) => p.team === "A");
  const teamBParticipants = (match.participants || []).filter((p) => p.team === "B");
  const hasTeams = teamAParticipants.length === 2 && teamBParticipants.length === 2;
  const teamLabel = (list) =>
    list
      .map((p) => players.find((pl) => pl.id === p.playerId)?.name || p.name)
      .join(" & ");

  const isSetScoreSuspicious = (value) => {
    const nums = String(value || "").match(/\d+/g);
    return Boolean(nums && nums.some((n) => Number(n) > 7));
  };

  const submit = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "matches", match.id), {
        scores: { set1, set2, set3 },
        matchType: type,
        winningTeam: hasTeams && winningTeam ? winningTeam : null,
      });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Score du match"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer le score"}
          </Button>
        </>
      }
    >
      <p className="text-xs text-[var(--color-text-dim)] mb-4">
        1, 2 ou 3 sets (jusqu'à 7 jeux chacun). Laissez vide pour un match amical sans score.
      </p>
      <div className="grid grid-cols-3 gap-2 mb-1">
        {[
          ["Set 1", set1, setSet1],
          ["Set 2", set2, setSet2],
          ["Set 3", set3, setSet3],
        ].map(([label, val, setter]) => (
          <Field key={label} label={label}>
            <input
              className={cn(inputClass, "pm-mono text-center")}
              value={val}
              placeholder="6-4"
              onChange={(e) => setter(e.target.value)}
            />
            {isSetScoreSuspicious(val) && (
              <p className="text-[var(--color-danger)] text-[10px] font-semibold mt-1">
                ⚠️ Max 7 jeux
              </p>
            )}
          </Field>
        ))}
      </div>
      <Field label="Type de partie">
        <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
          <option>Officiel</option>
          <option>Amical</option>
          <option>Tournante</option>
        </select>
      </Field>
      {hasTeams ? (
        <Field label="Équipe gagnante (pour les statistiques)">
          <select
            className={inputClass}
            value={winningTeam}
            onChange={(e) => setWinningTeam(e.target.value)}
          >
            <option value="">Non renseigné</option>
            <option value="A">Équipe A — {teamLabel(teamAParticipants)}</option>
            <option value="B">Équipe B — {teamLabel(teamBParticipants)}</option>
          </select>
        </Field>
      ) : (
        <p className="text-[11px] text-[var(--color-text-faint)] -mt-2">
          Composition des équipes non renseignée — les statistiques de victoire ne
          seront pas comptabilisées pour ce match.
        </p>
      )}
    </Modal>
  );
}

function AssignPlayersModal({ match, onClose }) {
  const { players, matches } = useAppData();
  const [selected, setSelected] = useState(
    (match.participants || []).map((p) => p.playerId)
  );
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [pairingIndex, setPairingIndex] = useState(() => {
    const teamAIds = (match.participants || [])
      .filter((p) => p.team === "A")
      .map((p) => p.playerId);
    if (teamAIds.length !== 2) return 0;
    const initialSelected = (match.participants || []).map((p) => p.playerId);
    const idx = PAIRING_PATTERNS.findIndex(([a]) => {
      const ids = a.map((i) => initialSelected[i]);
      return ids.length === 2 && ids.every((id) => teamAIds.includes(id));
    });
    return idx >= 0 ? idx : 0;
  });

  // Joueurs déjà engagés sur un AUTRE match le même jour (double terrain, etc.) :
  // on retrouve, pour chacun, le match en question afin d'expliquer pourquoi
  // il est indisponible.
  const conflictByPlayerId = useMemo(() => {
    const map = new Map();
    matches.forEach((m) => {
      if (m.id === match.id || m.date !== match.date) return;
      (m.participants || []).forEach((p) => {
        if (!map.has(p.playerId)) map.set(p.playerId, m);
      });
    });
    return map;
  }, [matches, match.id, match.date]);

  const toggle = (id) => {
    if (conflictByPlayerId.has(id)) return; // déjà pris ce jour-là ailleurs
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]
    );
  };

  const filteredPlayers = players.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const pattern = PAIRING_PATTERNS[pairingIndex % PAIRING_PATTERNS.length];
  const teamA = selected.length === 4 ? pattern[0].map((i) => selected[i]) : [];
  const teamB = selected.length === 4 ? pattern[1].map((i) => selected[i]) : [];
  const nameOf = (id) => players.find((p) => p.id === id)?.name || "?";

  const submit = async () => {
    setSaving(true);
    try {
      const existing = match.participants || [];
      const participants = selected.map((id) => {
        const team = selected.length === 4 ? (teamA.includes(id) ? "A" : "B") : null;
        const already = existing.find((p) => p.playerId === id);
        if (already) return { ...already, team }; // conserve le paiement, met à jour l'équipe
        const p = players.find((pl) => pl.id === id);
        return { playerId: id, name: p.name, paidStatus: "unpaid", creditorId: null, team };
      });
      await updateDoc(doc(db, "matches", match.id), { participants });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Assigner les joueurs"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Enregistrement..." : "Valider"}
          </Button>
        </>
      }
    >
      <p className="text-xs text-[var(--color-text-dim)] mb-3">
        Sélectionnez jusqu'à 4 joueurs pour le match du {formatDateFR(match.date)}
        {match.time ? ` à ${match.time}` : ""}. N'importe quel joueur du club peut
        être choisi, sauf s'il est déjà sur un autre match ce jour-là.
      </p>

      <input
        className={cn(inputClass, "mb-3")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un joueur..."
      />

      <Field label={`Joueurs (${selected.length}/4) — ${filteredPlayers.length} affiché(s)`}>
        <div className="flex flex-col gap-2 max-h-72 sm:max-h-[26rem] overflow-y-auto pm-scroll-visible pr-1">
          {filteredPlayers.length === 0 ? (
            <p className="text-xs text-[var(--color-text-faint)] italic py-2">
              Aucun joueur ne correspond à cette recherche.
            </p>
          ) : (
            filteredPlayers.map((p) => {
              const conflict = conflictByPlayerId.get(p.id);
              const isSelected = selected.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={cn(
                    "flex items-center gap-2.5 p-2.5 rounded-xl border text-sm",
                    conflict
                      ? "border-[var(--color-border)] bg-[var(--color-surface-2)]/50 opacity-50 cursor-not-allowed"
                      : "cursor-pointer",
                    !conflict && isSelected
                      ? "border-[var(--color-lime)]/60 bg-[var(--color-lime)]/10"
                      : !conflict && "border-[var(--color-border)] bg-[var(--color-surface-2)]"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(p.id)}
                    disabled={Boolean(conflict) || (!isSelected && selected.length >= 4)}
                    className="w-4 h-4 accent-[var(--color-lime)] shrink-0"
                  />
                  <span className="flex-1 min-w-0 truncate">
                    {p.emoji} {p.name}
                  </span>
                  {conflict && (
                    <span className="text-[10px] text-[var(--color-text-faint)] shrink-0 text-right">
                      Déjà sur {conflict.location || "un autre terrain"}
                      {conflict.time ? ` · ${conflict.time}` : ""}
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>
      </Field>

      {selected.length === 4 && (
        <Field label="Composition des équipes">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)]">
              <p className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase mb-1">
                Équipe A
              </p>
              {teamA.map((id) => (
                <p key={id} className="text-sm font-medium truncate">
                  {nameOf(id)}
                </p>
              ))}
            </div>
            <div className="p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)]">
              <p className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase mb-1">
                Équipe B
              </p>
              {teamB.map((id) => (
                <p key={id} className="text-sm font-medium truncate">
                  {nameOf(id)}
                </p>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPairingIndex((i) => (i + 1) % PAIRING_PATTERNS.length)}
            className="text-xs font-semibold text-sky-700 underline underline-offset-2"
          >
            🔄 Changer la répartition des équipes
          </button>
        </Field>
      )}
    </Modal>
  );
}

function CourtPanel({ match, now }) {
  const { isAdmin, connectedPlayer, players } = useAppData();
  const [showEnd, setShowEnd] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState(null);

  const participants = match.participants || [];
  const filledCount = participants.length;
  const isParticipant = participants.some((p) => p.playerId === connectedPlayer.id);
  const timing = getMatchTiming(match, now);
  const finished = timing === "finished";
  const scoreEntered = hasMatchScore(match);
  const canManagePayments = isAdmin || connectedPlayer.isCreditor === true;
  const canAssign = isAdmin && !finished;
  const creditorPlayerIds = new Set(
    players.filter((p) => p.isCreditor === true).map((p) => p.id)
  );
  const playerById = (id) => players.find((p) => p.id === id);
  const { top, bottom } = getCourtSlots(match);

  const fillBadge =
    filledCount === 4
      ? "4/4 joueurs • Complet"
      : filledCount === 0
      ? "Créneau libre"
      : `${filledCount}/4 joueurs`;

  const renderSlot = (participant, key) => (
    <PlayerSlotCard
      key={key}
      participant={participant}
      playerRecord={participant ? playerById(participant.playerId) : null}
      canAssign={canAssign}
      canPay={canManagePayments}
      isCreditorParticipant={participant ? creditorPlayerIds.has(participant.playerId) : false}
      onAssignClick={() => setShowAssign(true)}
      onPayClick={() => setPaymentTarget(participant)}
    />
  );

  return (
    <Card
      className={cn(
        "p-4 pm-rise",
        isParticipant && "border-[var(--color-lime)]/40"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{match.location || "Terrain"}</p>
          <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
            {match.matchFeePerPlayer != null
              ? `${match.matchFeePerPlayer.toLocaleString("fr-FR")} € / joueur`
              : "Tarif non renseigné"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusBadge match={match} now={now} />
          <Badge tone={filledCount === 4 ? "paid" : "neutral"} className="!text-[10px]">
            {fillBadge}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {top.map((p, i) => renderSlot(p, p?.playerId || `top-${i}`))}
      </div>

      <div className="relative flex items-center my-2.5">
        <div className="flex-1 h-px bg-[var(--color-border)]" />
        <span className="mx-2 px-2.5 py-1 rounded-full bg-slate-800 text-white text-[10px] font-bold tracking-wide shrink-0">
          FILET • NET
        </span>
        <div className="flex-1 h-px bg-[var(--color-border)]" />
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {bottom.map((p, i) => renderSlot(p, p?.playerId || `bottom-${i}`))}
      </div>

      {scoreEntered && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--color-surface-2)] mb-3">
          <Icon.Trophy className="w-4 h-4 text-[var(--color-lime)] shrink-0" />
          <span className="pm-mono text-sm font-bold">
            {[match.scores.set1, match.scores.set2, match.scores.set3]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {match.matchType && (
            <Badge tone="blue" className="!text-[10px] ml-auto">
              {match.matchType}
            </Badge>
          )}
        </div>
      )}

      {isAdmin && finished && (
        <Button
          variant="secondary"
          className="w-full !py-2 !text-xs"
          onClick={() => setShowEnd(true)}
        >
          {scoreEntered ? "Modifier le score" : "Encoder le score"}
        </Button>
      )}

      {showEnd && <EndMatchModal match={match} onClose={() => setShowEnd(false)} />}
      {showAssign && (
        <AssignPlayersModal match={match} onClose={() => setShowAssign(false)} />
      )}
      {paymentTarget && (
        <PaymentModal
          match={match}
          participant={paymentTarget}
          onClose={() => setPaymentTarget(null)}
        />
      )}
    </Card>
  );
}

function groupMatchesBySession(matches) {
  const map = new Map();
  matches.forEach((m) => {
    const key = `${m.date}|${m.time}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  });
  return [...map.values()];
}

function SessionCard({ sessionMatches, now }) {
  const first = sessionMatches[0];
  return (
    <Card className="p-4 pm-rise">
      <div className="flex items-baseline justify-between mb-3">
        <p className="pm-display font-bold text-base">
          {formatDateFR(first.date)} · {first.time}
        </p>
        <Badge tone="neutral" className="!text-[10px]">
          {sessionMatches.length} terrain{sessionMatches.length > 1 ? "s" : ""}
        </Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sessionMatches.map((m) => (
          <CourtPanel key={m.id} match={m} now={now} />
        ))}
      </div>
    </Card>
  );
}

function CreateMatchModal({ onClose }) {
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("20:00");
  const [location, setLocation] = useState("");
  const [fee, setFee] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = Boolean(date && time);

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "matches"), {
        date,
        time,
        location: location.trim(),
        type: "Ponctuel",
        matchFeePerPlayer: parseFeeInput(fee),
        participants: [],
        scores: { set1: "", set2: "", set3: "" },
        status: "À venir",
        createdAt: serverTimestamp(),
      });
      onClose();
    } catch (error) {
      alert("Erreur de création : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Nouveau match ponctuel"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Création..." : "Créer le match"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Heure">
          <input
            type="time"
            className={inputClass}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Terrain / lieu (optionnel)">
        <input
          className={inputClass}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Ex. Terrain 2"
        />
      </Field>
      <Field label="Tarif par joueur — € (optionnel)">
        <input
          type="text"
          inputMode="decimal"
          className={inputClass}
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          placeholder="Ex. 13,5"
        />
      </Field>
      <p className="text-xs text-[var(--color-text-dim)]">
        Un terrain accueille 4 joueurs. Vous pourrez les sélectionner ensuite
        directement depuis la carte du match, sur la page d'accueil.
      </p>
    </Modal>
  );
}

function CreateSeasonModal({ onClose }) {
  const [startDate, setStartDate] = useState(todayISO());
  const [recurrence, setRecurrence] = useState(RECURRENCE_OPTIONS[0].label);
  const [numberOfMatches, setNumberOfMatches] = useState(10);
  const [time, setTime] = useState("20:00");
  const [fee, setFee] = useState("");
  const [courtsCount, setCourtsCount] = useState(1);
  const [courtNumbers, setCourtNumbers] = useState(["1"]);
  const [clubName, setClubName] = useState("");
  const [saving, setSaving] = useState(false);

  // Ajuste automatiquement le nombre de cases "numéro de terrain" pour qu'il
  // corresponde toujours exactement au nombre de terrains saisi.
  useEffect(() => {
    const n = Math.max(1, Number(courtsCount) || 1);
    setCourtNumbers((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) {
        next.push(String(next.length + 1));
      }
      return next;
    });
  }, [courtsCount]);

  const setCourtNumberAt = (index, value) => {
    setCourtNumbers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const canSubmit =
    Boolean(startDate) && Number(numberOfMatches) > 0 && courtNumbers.length > 0;

  const totalMatches = Number(numberOfMatches || 0) * courtNumbers.length;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const interval =
        RECURRENCE_OPTIONS.find((r) => r.label === recurrence)?.days || 7;
      const dates = getRecurringDates(startDate, interval, Number(numberOfMatches));
      const courtList = courtNumbers.map((c, i) => (c.trim() ? c.trim() : String(i + 1)));

      const parsedFee = parseFeeInput(fee);
      const club = clubName.trim();

      const batch = writeBatch(db);
      let writesQueued = 0;
      dates.forEach((d) => {
        courtList.forEach((court) => {
          const ref = doc(collection(db, "matches"));
          batch.set(ref, {
            date: d,
            time,
            location: club ? `${club} — Terrain ${court}` : `Terrain ${court}`,
            type: "Saison",
            matchFeePerPlayer: parsedFee,
            participants: [],
            scores: { set1: "", set2: "", set3: "" },
            status: "À venir",
            createdAt: serverTimestamp(),
          });
          writesQueued += 1;
        });
      });
      await batch.commit();
      alert(
        `${writesQueued} match(s) créé(s) avec succès dans Firestore ` +
          `(${dates.length} date(s) × ${courtList.length} terrain(s)).`
      );
      onClose();
    } catch (error) {
      alert("Erreur de création : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Créer une saison complète"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Génération en cours..." : `Générer les ${totalMatches} matchs`}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date du premier match">
          <input
            type="date"
            className={inputClass}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="Récurrence">
          <select
            className={inputClass}
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
          >
            {RECURRENCE_OPTIONS.map((r) => (
              <option key={r.label}>{r.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre de matchs">
          <input
            type="number"
            min="1"
            className={inputClass}
            value={numberOfMatches}
            onChange={(e) => setNumberOfMatches(e.target.value)}
          />
        </Field>
        <Field label="Heure">
          <input
            type="time"
            className={inputClass}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Prix par joueur — € (optionnel)">
        <input
          type="text"
          inputMode="decimal"
          className={inputClass}
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          placeholder="Ex. 13,5"
        />
      </Field>

      <Field label="Nombre de terrains">
        <input
          type="number"
          min="1"
          className={inputClass}
          value={courtsCount}
          onChange={(e) => setCourtsCount(e.target.value)}
        />
      </Field>

      <Field label={`Numéros des terrains (${courtNumbers.length} case${courtNumbers.length > 1 ? "s" : ""})`}>
        <div className="grid grid-cols-3 gap-2">
          {courtNumbers.map((val, i) => (
            <input
              key={i}
              className={cn(inputClass, "text-center")}
              value={val}
              onChange={(e) => setCourtNumberAt(i, e.target.value)}
              placeholder={`Terrain ${i + 1}`}
            />
          ))}
        </div>
        <p className="text-[11px] text-[var(--color-text-faint)] mt-1.5">
          Une case par terrain — modifiez le nombre ci-dessus pour en ajouter ou en retirer.
        </p>
      </Field>

      <Field label="Nom du club (optionnel)">
        <input
          className={inputClass}
          value={clubName}
          onChange={(e) => setClubName(e.target.value)}
          placeholder="Ex. Padel Club Bruxelles"
        />
      </Field>

      <p className="text-xs text-[var(--color-text-dim)] mb-3">
        {totalMatches} match{totalMatches > 1 ? "s" : ""} seront générés (
        {numberOfMatches} date{Number(numberOfMatches) > 1 ? "s" : ""} ×{" "}
        {courtNumbers.length} terrain{courtNumbers.length > 1 ? "s" : ""}),{" "}
        {recurrence.toLowerCase()}, à partir du {formatDateFR(startDate)}. La
        sélection des joueurs se fera ensuite depuis la page d'accueil.
      </p>
    </Modal>
  );
}

function MatchesView() {
  const { matches, isAdmin } = useAppData();
  const now = useNow();
  const [filter, setFilter] = useState("upcoming");
  const [showCreateMatch, setShowCreateMatch] = useState(false);

  const sortedByStart = [...matches].sort((a, b) => getMatchStart(a) - getMatchStart(b));
  const notFinished = sortedByStart.filter((m) => getMatchTiming(m, now) !== "finished");
  const finishedDesc = sortedByStart
    .filter((m) => getMatchTiming(m, now) === "finished")
    .sort((a, b) => getMatchStart(b) - getMatchStart(a));

  // Prochain match : toutes les rencontres du jour le plus proche à venir
  // (ex. les 2 terrains du jeudi suivant).
  const nextDate = notFinished[0]?.date;
  const nextGroup = nextDate ? notFinished.filter((m) => m.date === nextDate) : [];

  // Dernier match joué : toutes les rencontres du dernier jour déjà terminé.
  const lastDate = finishedDesc[0]?.date;
  const lastGroup = lastDate ? finishedDesc.filter((m) => m.date === lastDate) : [];

  const highlightedIds = new Set([...nextGroup, ...lastGroup].map((m) => m.id));
  const otherMatches = sortedByStart.filter((m) => !highlightedIds.has(m.id));
  const otherFiltered = otherMatches.filter((m) =>
    filter === "upcoming"
      ? getMatchTiming(m, now) !== "finished"
      : getMatchTiming(m, now) === "finished"
  );

  return (
    <div className="px-4 pt-4 pb-28 relative min-h-[70vh]">
      <h2 className="pm-display font-bold text-xl mb-4">Matchs</h2>

      <div className="mb-6">
        <h3 className="font-semibold text-sm text-[var(--color-text-dim)] mb-2">
          Prochain match
        </h3>
        {nextGroup.length > 0 ? (
          <div className="flex flex-col gap-4">
            {groupMatchesBySession(nextGroup).map((session) => (
              <SessionCard
                key={`${session[0].date}|${session[0].time}`}
                sessionMatches={session}
                now={now}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Icon.Calendar className="w-6 h-6" />}
            title="Aucun match à venir"
            subtitle={
              isAdmin
                ? "Créez un match ponctuel avec le bouton + ci-dessous, ou lancez une saison complète depuis l'onglet Administration."
                : "Revenez plus tard, l'administrateur programmera bientôt de nouveaux matchs."
            }
          />
        )}
      </div>

      {lastGroup.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-sm text-[var(--color-text-dim)] mb-2">
            Dernier match joué
          </h3>
          <div className="flex flex-col gap-4">
            {groupMatchesBySession(lastGroup).map((session) => (
              <SessionCard
                key={`${session[0].date}|${session[0].time}`}
                sessionMatches={session}
                now={now}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-[var(--color-text-dim)]">
            Reste de la saison
          </h3>
          <div className="flex bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full p-1">
            {[
              ["upcoming", "À venir"],
              ["done", "Terminés"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                  filter === id
                    ? "bg-sky-200 text-sky-900"
                    : "text-[var(--color-text-dim)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {otherFiltered.length === 0 ? (
          <EmptyState
            icon={<Icon.Calendar className="w-6 h-6" />}
            title={
              filter === "upcoming" ? "Aucun autre match à venir" : "Aucun autre match terminé"
            }
            subtitle="Le reste de la saison apparaîtra ici."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {groupMatchesBySession(otherFiltered).map((session) => (
              <SessionCard
                key={`${session[0].date}|${session[0].time}`}
                sessionMatches={session}
                now={now}
              />
            ))}
          </div>
        )}
      </div>

      {isAdmin && (
        <button
          onClick={() => setShowCreateMatch(true)}
          aria-label="Créer un match ponctuel"
          className="fixed bottom-24 right-5 z-20 w-14 h-14 rounded-full bg-sky-200 text-sky-900 flex items-center justify-center shadow-lg shadow-sky-300/50 active:scale-95 transition-all"
        >
          <Icon.Plus className="w-6 h-6" />
        </button>
      )}

      {showCreateMatch && <CreateMatchModal onClose={() => setShowCreateMatch(false)} />}
    </div>
  );
}

/* =============================================================================
   12. ADMINISTRATION — dashboard des soldes de créances
   ========================================================================= */
function CreditorBalanceEditor({ creditor, rawTotal }) {
  const [value, setValue] = useState(String(rawTotal + (creditor.manualAdjustment || 0)));
  const save = async () => {
    const target = parseFeeInput(value);
    if (target == null) return;
    try {
      await updateDoc(doc(db, "players", creditor.id), {
        manualAdjustment: target - rawTotal,
      });
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    }
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      className="pm-mono font-bold text-[var(--color-lime)] bg-transparent text-right w-24 focus:outline-none border-b border-transparent focus:border-sky-300"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
    />
  );
}

function AdminView() {
  const { players, matches } = useAppData();
  const [showCreateSeason, setShowCreateSeason] = useState(false);
  const creditors = players.filter((p) => p.isCreditor);
  const creditorRawTotals = new Map(
    creditors.map((c) => [c.id, getCreditorAccounting(c.id, matches).totalPaidAllTime])
  );
  const creditorAdjustedTotals = new Map(
    creditors.map((c) => [
      c.id,
      (creditorRawTotals.get(c.id) || 0) + (c.manualAdjustment || 0),
    ])
  );
  const totalBalance = [...creditorAdjustedTotals.values()].reduce((s, v) => s + v, 0);
  const upcomingCount = matches.filter((m) => getMatchTiming(m) !== "finished").length;
  const unpaidCount = matches.reduce(
    (sum, m) =>
      sum + (m.participants || []).filter((p) => p.paidStatus !== "paid").length,
    0
  );

  const stats = [
    { label: "Joueurs", value: players.length, icon: Icon.Users },
    { label: "Créanciers", value: creditors.length, icon: Icon.Shield },
    { label: "Matchs à venir", value: upcomingCount, icon: Icon.Calendar },
    { label: "Paiements en attente", value: unpaidCount, icon: Icon.Coin },
  ];

  return (
    <div className="px-4 pt-4 pb-28">
      <div className="flex items-center justify-between mb-4">
        <h2 className="pm-display font-bold text-xl">Administration</h2>
        <Button
          variant="secondary"
          className="!py-2 !px-3"
          onClick={() => setShowCreateSeason(true)}
        >
          <span className="flex items-center gap-1.5">
            <Icon.Calendar className="w-4 h-4" /> Créer une saison
          </span>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <s.icon className="w-4 h-4 text-[var(--color-lime)] mb-2" />
            <p className="pm-display text-2xl font-extrabold">{s.value}</p>
            <p className="text-xs text-[var(--color-text-dim)]">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-[var(--color-text-dim)]">
          Soldes des créanciers
        </h3>
        <span className="pm-mono text-sm font-bold text-[var(--color-lime)]">
          Total : {totalBalance.toLocaleString("fr-FR")} €
        </span>
      </div>

      {creditors.length === 0 ? (
        <EmptyState
          icon={<Icon.Coin className="w-6 h-6" />}
          title="Aucun créancier configuré"
          subtitle="Activez l'option « Créancier » sur un joueur depuis l'onglet Joueurs pour qu'il puisse recevoir des paiements."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {[...creditors]
            .sort((a, b) => (creditorAdjustedTotals.get(b.id) || 0) - (creditorAdjustedTotals.get(a.id) || 0))
            .map((c) => (
              <Card key={c.id} className="p-4 flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-lg">
                  {c.emoji || "🎾"}
                </span>
                <span className="flex-1 font-semibold text-sm">{c.name}</span>
                <CreditorBalanceEditor creditor={c} rawTotal={creditorRawTotals.get(c.id) || 0} />
              </Card>
            ))}
        </div>
      )}
      {showCreateSeason && (
        <CreateSeasonModal onClose={() => setShowCreateSeason(false)} />
      )}
    </div>
  );
}

/* =============================================================================
   13. STATISTIQUES — matchs terminés uniquement
   ========================================================================= */
function StatKpiCard({ icon: IconEl, value, label }) {
  return (
    <Card className="p-4">
      <IconEl className="w-4 h-4 text-[var(--color-lime)] mb-2" />
      <p className="pm-display text-xl font-extrabold">{value}</p>
      <p className="text-xs text-[var(--color-text-dim)]">{label}</p>
    </Card>
  );
}

function StatsView() {
  const { connectedPlayer, isAdmin, players, matches } = useAppData();
  const myStats = computePlayerStats(connectedPlayer.id, matches);
  const nameOf = (id) => players.find((p) => p.id === id)?.name || "Joueur inconnu";

  return (
    <div className="px-4 pt-4 pb-28">
      <h2 className="pm-display font-bold text-xl mb-1">Statistiques</h2>
      <p className="text-xs text-[var(--color-text-dim)] mb-4">
        Calculées uniquement sur les matchs déjà terminés.
      </p>

      <h3 className="font-semibold text-sm text-[var(--color-text-dim)] mb-3">
        Mes statistiques
      </h3>
      {myStats.played === 0 ? (
        <Card className="p-5 mb-6">
          <p className="text-sm text-[var(--color-text-dim)] text-center">
            Aucune statistique disponible pour le moment.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <StatKpiCard icon={Icon.Trophy} value={myStats.played} label="Matchs joués" />
            <StatKpiCard
              icon={Icon.Check}
              value={`${myStats.wins}V — ${myStats.losses}D`}
              label={`${myStats.winRate}% de victoires`}
            />
          </div>
          <div className="flex flex-col gap-2 mb-6">
            {myStats.topPartner ? (
              <Card className="p-4 flex items-center gap-3">
                <Icon.Users className="w-5 h-5 text-[var(--color-lime)] shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[10px] uppercase tracking-wide text-[var(--color-text-faint)]">
                    Coéquipier fétiche
                  </span>
                  <span className="block text-sm font-semibold truncate">
                    {nameOf(myStats.topPartner.id)} · {myStats.topPartner.count} match
                    {myStats.topPartner.count > 1 ? "s" : ""} ensemble
                  </span>
                </span>
              </Card>
            ) : (
              <Card className="p-4">
                <p className="text-xs text-[var(--color-text-faint)] italic">
                  Coéquipier fétiche : pas encore assez de matchs avec équipes renseignées.
                </p>
              </Card>
            )}
            {myStats.topOpponent ? (
              <Card className="p-4 flex items-center gap-3">
                <Icon.Swords className="w-5 h-5 text-rose-500 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[10px] uppercase tracking-wide text-[var(--color-text-faint)]">
                    Bête noire
                  </span>
                  <span className="block text-sm font-semibold truncate">
                    {nameOf(myStats.topOpponent.id)} · {myStats.topOpponent.count} confrontation
                    {myStats.topOpponent.count > 1 ? "s" : ""}
                  </span>
                </span>
              </Card>
            ) : (
              <Card className="p-4">
                <p className="text-xs text-[var(--color-text-faint)] italic">
                  Bête noire : pas encore assez de matchs avec équipes renseignées.
                </p>
              </Card>
            )}
          </div>
        </>
      )}

      {isAdmin && (
        <>
          <h3 className="font-semibold text-sm text-[var(--color-text-dim)] mb-3">
            Tous les joueurs
          </h3>
          <div className="flex flex-col gap-2">
            {players.map((p) => {
              const s = computePlayerStats(p.id, matches);
              return (
                <Card key={p.id} className="p-3.5 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-base shrink-0">
                    {p.emoji || "🎾"}
                  </span>
                  <span className="flex-1 min-w-0 text-sm font-semibold truncate">
                    {p.name}
                  </span>
                  {s.played === 0 ? (
                    <span className="text-xs text-[var(--color-text-faint)] italic shrink-0">
                      Aucune statistique
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--color-text-dim)] text-right shrink-0">
                      {s.played} matchs · {s.wins}V-{s.losses}D · {s.winRate}%
                    </span>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* =============================================================================
   14. COMPTABILITÉ — calculatrice personnelle pour chaque créancier
   ========================================================================= */
function AccountingView() {
  const { connectedPlayer, matches } = useAppData();
  const { totalPaidAllTime, totalPaidPastMatches, selfReimbursed, paymentsReceived } =
    getCreditorAccounting(connectedPlayer.id, matches);
  const adjustedPaidAllTime = totalPaidAllTime + (connectedPlayer.manualAdjustment || 0);
  const advanced = connectedPlayer.advancedAmount || 0;
  const remaining = advanced - adjustedPaidAllTime;

  const blocks = [
    {
      label: "Montant avancé au départ",
      value: advanced,
      icon: Icon.Shield,
      hint: "Renseigné par l'administrateur.",
    },
    {
      label: "Montant restant à payer",
      value: remaining,
      icon: Icon.Coin,
      hint: "Avance − ce qui vous a déjà été payé.",
      tone: remaining > 0 ? "unpaid" : "paid",
    },
    {
      label: "Montant autoremboursé",
      value: selfReimbursed,
      icon: Icon.Trophy,
      hint: "Vos propres matchs déjà joués × leur tarif.",
    },
    {
      label: "Total remboursé (matchs passés)",
      value: totalPaidPastMatches,
      icon: Icon.Check,
      hint: "Payé par les joueurs pour des matchs déjà terminés.",
      tone: "paid",
    },
  ];

  return (
    <div className="px-4 pt-4 pb-28">
      <h2 className="pm-display font-bold text-xl mb-1">Ma comptabilité</h2>
      <p className="text-xs text-[var(--color-text-dim)] mb-4">
        Calculé automatiquement à partir des matchs et paiements enregistrés — aucun
        moyen de paiement externe n'est utilisé.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {blocks.map((b) => (
          <Card key={b.label} className="p-4">
            <b.icon
              className={cn(
                "w-4 h-4 mb-2",
                b.tone === "paid"
                  ? "text-emerald-600"
                  : b.tone === "unpaid"
                  ? "text-rose-600"
                  : "text-[var(--color-lime)]"
              )}
            />
            <p className="pm-display text-xl font-extrabold">
              {b.value.toLocaleString("fr-FR")} €
            </p>
            <p className="text-xs text-[var(--color-text-dim)] mt-0.5">{b.label}</p>
            <p className="text-[10px] text-[var(--color-text-faint)] mt-1">{b.hint}</p>
          </Card>
        ))}
      </div>

      <h3 className="font-semibold text-sm text-[var(--color-text-dim)] mb-3">
        Paiements reçus (matchs passés)
      </h3>
      {paymentsReceived.length === 0 ? (
        <EmptyState
          icon={<Icon.Coin className="w-6 h-6" />}
          title="Aucun paiement enregistré pour l'instant"
          subtitle="Les paiements que vous confirmez depuis l'onglet Matchs apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {paymentsReceived.map((p, i) => (
            <Card key={i} className="p-3.5 flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate">{p.name}</span>
                <span className="block text-xs text-[var(--color-text-faint)]">
                  {formatDateFR(p.date)}
                </span>
              </span>
              <span className="pm-mono font-bold text-emerald-600 text-sm shrink-0">
                +{p.fee.toLocaleString("fr-FR")} €
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* =============================================================================
   15. COMPOSANT RACINE
   ========================================================================= */
function MainApp() {
  const { matches, players } = { ...useAppData() };
  const matchesHook = useMatches();
  const [view, setView] = useState("matches");

  return (
    <AppDataContext.Provider
      value={{ ...useAppData(), matches: matchesHook.matches }}
    >
      <div className="pm-root">
        <Header />
        {matchesHook.loading ? (
          <Spinner />
        ) : view === "matches" ? (
          <MatchesView />
        ) : view === "players" ? (
          <PlayersView />
        ) : view === "stats" ? (
          <StatsView />
        ) : view === "accounting" ? (
          <AccountingView />
        ) : (
          <AdminView />
        )}
        <BottomNav view={view} setView={setView} />
      </div>
    </AppDataContext.Provider>
  );
}

export default function PadelManagerApp() {
  return (
    <>
      <GlobalStyles />
      <AuthGate>
        <MainApp />
      </AuthGate>
    </>
  );
}
