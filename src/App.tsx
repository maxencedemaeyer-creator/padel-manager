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

function getSeasonDates(startDateStr, dayOfWeek, count) {
  const dates = [];
  let d = new Date(startDateStr + "T00:00:00");
  while (d.getDay() !== Number(dayOfWeek)) {
    d.setDate(d.getDate() + 1);
  }
  for (let i = 0; i < count; i++) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return dates.map((d) => d.toISOString().slice(0, 10));
}

const LEVELS = [
  { label: "Débutant", value: 1 },
  { label: "Intermédiaire", value: 2 },
  { label: "Avancé", value: 3 },
  { label: "Expert", value: 4 },
];

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
    unpaid: "bg-orange-100 text-orange-700 border-orange-200",
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

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pm-fade">
      <div
        className="absolute inset-0 bg-slate-900/25 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full sm:rounded-3xl rounded-t-3xl bg-[var(--color-surface)] border border-stone-200/60 shadow-xl max-h-[92vh] overflow-y-auto pm-scroll pm-rise",
          wide ? "sm:max-w-lg" : "sm:max-w-sm"
        )}
      >
        <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
          <h3 className="pm-display font-bold text-lg">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            <Icon.X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
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
        level: "Avancé",
        levelSortValue: 3,
        emoji: "🎾",
        dominantHand: "Droitier",
        preferredSide: "Les deux",
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
  const { isAdmin } = useAppData();
  const tabs = [
    { id: "matches", label: "Matchs", icon: Icon.Trophy },
    { id: "players", label: "Joueurs", icon: Icon.Users },
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
function PlayerRow({ player }) {
  const levelInfo = LEVELS.find((l) => l.value === player.levelSortValue);
  return (
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
        <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
          {levelInfo?.label || player.level || "—"} · {player.dominantHand || "—"} ·
          Côté {player.preferredSide || "—"}
        </p>
      </div>
      {player.isCreditor && (
        <div className="text-right shrink-0">
          <p className="pm-mono font-bold text-[var(--color-lime)] text-sm">
            {(player.creditBalance || 0).toLocaleString("fr-FR")} €
          </p>
          <p className="text-[10px] text-[var(--color-text-faint)]">solde</p>
        </div>
      )}
    </Card>
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
    level: "Intermédiaire",
    dominantHand: "Droitier",
    preferredSide: "Les deux",
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
    <Modal title="Ajouter un joueur" onClose={onClose} wide>
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
            <option>Droitier</option>
            <option>Gaucher</option>
          </select>
        </Field>
      </div>

      <Field label="Côté préféré">
        <select
          className={inputClass}
          value={form.preferredSide}
          onChange={(e) => setF("preferredSide", e.target.value)}
        >
          <option>Droite</option>
          <option>Gauche</option>
          <option>Les deux</option>
        </select>
      </Field>

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

      <Button className="w-full mt-3" onClick={submit} disabled={!canSubmit || saving}>
        {saving ? "Ajout en cours..." : "Ajouter le joueur"}
      </Button>
    </Modal>
  );
}

function PlayersView() {
  const { players, isAdmin } = useAppData();
  const [showAdd, setShowAdd] = useState(false);
  const sorted = [...players].sort(
    (a, b) => (b.levelSortValue || 0) - (a.levelSortValue || 0)
  );

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
  const { players } = useAppData();
  const creditors = players.filter((p) => p.isCreditor === true);
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
      await updateDoc(doc(db, "players", creditor.id), {
        creditBalance: increment(match.matchFeePerPlayer || 0),
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
          {creditors.map((c) => (
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
                  Solde actuel : {(c.creditBalance || 0).toLocaleString("fr-FR")} €
                </span>
              </span>
              <Icon.Chevron className="w-4 h-4 text-[var(--color-text-faint)]" />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* =============================================================================
   11. MATCHS — cartes, création (ponctuel / saison), fin de match
   ========================================================================= */
function StatusBadge({ status }) {
  if (status === "En cours")
    return (
      <Badge tone="lime" className="pm-pulse">
        ● En cours
      </Badge>
    );
  if (status === "Terminé") return <Badge tone="neutral">Terminé</Badge>;
  return <Badge tone="blue">À venir</Badge>;
}

function ParticipantChip({ participant, match, canManage }) {
  const [showPayment, setShowPayment] = useState(false);
  const paid = participant.paidStatus === "paid";
  return (
    <>
      <div className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)]">
        <span className="w-6 h-6 rounded-full bg-[var(--color-surface)] flex items-center justify-center text-xs">
          🎾
        </span>
        <span className="text-xs font-medium max-w-[70px] truncate">
          {participant.name}
        </span>
        <button
          disabled={paid || !canManage}
          onClick={() => setShowPayment(true)}
          className={cn(!paid && canManage && "cursor-pointer")}
        >
          <Badge tone={paid ? "paid" : "unpaid"} className="!px-2 !py-0.5">
            {paid ? "Payé" : "À payer"}
          </Badge>
        </button>
      </div>
      {showPayment && (
        <PaymentModal
          match={match}
          participant={participant}
          onClose={() => setShowPayment(false)}
        />
      )}
    </>
  );
}

function EndMatchModal({ match, onClose }) {
  const [set1, setSet1] = useState(match.scores?.set1 || "");
  const [set2, setSet2] = useState(match.scores?.set2 || "");
  const [set3, setSet3] = useState(match.scores?.set3 || "");
  const [type, setType] = useState(match.matchType || "Officiel");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "matches", match.id), {
        scores: { set1, set2, set3 },
        matchType: type,
        status: "Terminé",
      });
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Terminer le match" onClose={onClose}>
      <div className="grid grid-cols-3 gap-2 mb-4">
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
      <Button className="w-full mt-2" onClick={submit} disabled={saving}>
        {saving ? "Enregistrement..." : "Enregistrer le résultat"}
      </Button>
    </Modal>
  );
}

function MatchCard({ match }) {
  const { isAdmin, connectedPlayer } = useAppData();
  const [showEnd, setShowEnd] = useState(false);
  const isParticipant = match.participants?.some((p) => p.playerId === connectedPlayer.id);

  const startMatch = async () => {
    try {
      await updateDoc(doc(db, "matches", match.id), { status: "En cours" });
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    }
  };

  return (
    <Card
      className={cn(
        "p-4 pm-rise",
        isParticipant && "border-[var(--color-lime)]/40"
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="pm-display font-bold text-base">{formatDateFR(match.date)}</p>
          <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
            {match.time} · {match.location}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={match.status} />
          <Badge tone="neutral" className="!text-[10px]">
            {match.type} · {(match.matchFeePerPlayer || 0).toLocaleString("fr-FR")} €
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {(match.participants || []).map((p) => (
          <ParticipantChip
            key={p.playerId}
            participant={p}
            match={match}
            canManage={isAdmin}
          />
        ))}
      </div>

      {match.status === "Terminé" && match.scores && (
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

      {isAdmin && match.status !== "Terminé" && (
        <div className="flex gap-2 pt-1">
          {match.status === "À venir" && (
            <Button variant="secondary" className="flex-1 !py-2 !text-xs" onClick={startMatch}>
              Démarrer le match
            </Button>
          )}
          <Button
            variant="secondary"
            className="flex-1 !py-2 !text-xs"
            onClick={() => setShowEnd(true)}
          >
            Terminer le match
          </Button>
        </div>
      )}
      {isAdmin && match.status === "Terminé" && (
        <button
          onClick={() => setShowEnd(true)}
          className="text-xs font-semibold text-[var(--color-text-dim)] underline underline-offset-2"
        >
          Modifier le score
        </button>
      )}

      {showEnd && <EndMatchModal match={match} onClose={() => setShowEnd(false)} />}
    </Card>
  );
}

function CreateMatchModal({ onClose }) {
  const { players } = useAppData();
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("20:00");
  const [location, setLocation] = useState("Terrains 1 & 2");
  const [fee, setFee] = useState(10);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const canSubmit = date && time && location && selected.length === 4;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const participants = selected.map((id) => {
        const p = players.find((pl) => pl.id === id);
        return { playerId: id, name: p.name, paidStatus: "unpaid", creditorId: null };
      });
      await addDoc(collection(db, "matches"), {
        date,
        time,
        location,
        type: "Ponctuel",
        matchFeePerPlayer: Number(fee),
        participants,
        scores: { set1: "", set2: "", set3: "" },
        status: "À venir",
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
    <Modal title="Nouveau match ponctuel" onClose={onClose} wide>
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
      <Field label="Terrain / lieu">
        <input
          className={inputClass}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </Field>
      <Field label="Tarif par joueur (€)">
        <input
          type="number"
          min="0"
          className={inputClass}
          value={fee}
          onChange={(e) => setFee(e.target.value)}
        />
      </Field>
      <Field label={`Joueurs (${selected.length}/4)`}>
        <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pm-scroll">
          {players.map((p) => (
            <label
              key={p.id}
              className={cn(
                "flex items-center gap-2.5 p-2.5 rounded-xl border text-sm cursor-pointer",
                selected.includes(p.id)
                  ? "border-[var(--color-lime)]/60 bg-[var(--color-lime)]/10"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
              )}
            >
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={() => toggle(p.id)}
                disabled={!selected.includes(p.id) && selected.length >= 4}
                className="w-4 h-4 accent-[var(--color-lime)]"
              />
              <span>{p.emoji} {p.name}</span>
            </label>
          ))}
        </div>
      </Field>
      <Button className="w-full mt-2" onClick={submit} disabled={!canSubmit || saving}>
        {saving ? "Création..." : "Créer le match"}
      </Button>
    </Modal>
  );
}

function CreateSeasonModal({ onClose }) {
  const { players } = useAppData();
  const [dayOfWeek, setDayOfWeek] = useState(4); // Jeudi par défaut
  const [startDate, setStartDate] = useState(todayISO());
  const [weeks, setWeeks] = useState(44);
  const [time, setTime] = useState("20:00");
  const [location, setLocation] = useState("Terrains 1 & 2");
  const [fee, setFee] = useState(10);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const canSubmit = startDate && weeks > 0 && selected.length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const dates = getSeasonDates(startDate, dayOfWeek, Number(weeks));
      const participants = selected.map((id) => {
        const p = players.find((pl) => pl.id === id);
        return { playerId: id, name: p.name, paidStatus: "unpaid", creditorId: null };
      });
      const batch = writeBatch(db);
      dates.forEach((d) => {
        const ref = doc(collection(db, "matches"));
        batch.set(ref, {
          date: d,
          time,
          location,
          type: "Saison",
          matchFeePerPlayer: Number(fee),
          participants,
          scores: { set1: "", set2: "", set3: "" },
          status: "À venir",
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
      onClose();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Créer une saison complète" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jour récurrent">
          <select
            className={inputClass}
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
          >
            {DAYS_FR.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nombre de semaines">
          <input
            type="number"
            min="1"
            className={inputClass}
            value={weeks}
            onChange={(e) => setWeeks(e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Première date à partir de">
          <input
            type="date"
            className={inputClass}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
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
      <Field label="Terrain / lieu">
        <input
          className={inputClass}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </Field>
      <Field label="Tarif par joueur (€)">
        <input
          type="number"
          min="0"
          className={inputClass}
          value={fee}
          onChange={(e) => setFee(e.target.value)}
        />
      </Field>
      <Field label={`Joueurs réguliers (${selected.length} sélectionné${selected.length > 1 ? "s" : ""})`}>
        <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pm-scroll">
          {players.map((p) => (
            <label
              key={p.id}
              className={cn(
                "flex items-center gap-2.5 p-2.5 rounded-xl border text-sm cursor-pointer",
                selected.includes(p.id)
                  ? "border-[var(--color-lime)]/60 bg-[var(--color-lime)]/10"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
              )}
            >
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={() => toggle(p.id)}
                className="w-4 h-4 accent-[var(--color-lime)]"
              />
              <span>{p.emoji} {p.name}</span>
            </label>
          ))}
        </div>
      </Field>
      <p className="text-xs text-[var(--color-text-dim)] mb-3">
        {weeks} matchs seront générés, tous les {DAYS_FR[dayOfWeek].toLowerCase()}s à{" "}
        {time}, à partir du {formatDateFR(getSeasonDates(startDate, dayOfWeek, 1)[0])}.
      </p>
      <Button className="w-full" onClick={submit} disabled={!canSubmit || saving}>
        {saving ? "Génération en cours..." : `Générer les ${weeks} matchs`}
      </Button>
    </Modal>
  );
}

function MatchesView() {
  const { matches, isAdmin } = useAppData();
  const [filter, setFilter] = useState("upcoming");
  const [showChoice, setShowChoice] = useState(false);
  const [showCreateMatch, setShowCreateMatch] = useState(false);
  const [showCreateSeason, setShowCreateSeason] = useState(false);

  const filtered = matches.filter((m) =>
    filter === "upcoming" ? m.status !== "Terminé" : m.status === "Terminé"
  );

  return (
    <div className="px-4 pt-4 pb-28 relative min-h-[70vh]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="pm-display font-bold text-xl">Matchs</h2>
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

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Icon.Calendar className="w-6 h-6" />}
          title={filter === "upcoming" ? "Aucun match à venir" : "Aucun match terminé"}
          subtitle={
            isAdmin
              ? "Créez un match ponctuel ou lancez une saison complète."
              : "Revenez plus tard, l'administrateur programmera bientôt de nouveaux matchs."
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      )}

      {isAdmin && (
        <button
          onClick={() => setShowChoice(true)}
          className="fixed bottom-24 right-5 z-20 w-14 h-14 rounded-full bg-sky-200 text-sky-900 flex items-center justify-center shadow-lg shadow-sky-300/50 active:scale-95 transition-all"
        >
          <Icon.Plus className="w-6 h-6" />
        </button>
      )}

      {showChoice && (
        <Modal title="Créer" onClose={() => setShowChoice(false)}>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                setShowChoice(false);
                setShowCreateMatch(true);
              }}
              className="flex items-center gap-3 p-4 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)] hover:border-[var(--color-lime)]/50 text-left"
            >
              <Icon.Ball className="w-5 h-5 text-[var(--color-lime)]" />
              <span>
                <span className="block font-semibold text-sm">Match ponctuel</span>
                <span className="block text-xs text-[var(--color-text-dim)]">
                  Une rencontre unique
                </span>
              </span>
            </button>
            <button
              onClick={() => {
                setShowChoice(false);
                setShowCreateSeason(true);
              }}
              className="flex items-center gap-3 p-4 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)] hover:border-[var(--color-lime)]/50 text-left"
            >
              <Icon.Calendar className="w-5 h-5 text-[var(--color-blue)]" />
              <span>
                <span className="block font-semibold text-sm">Saison complète</span>
                <span className="block text-xs text-[var(--color-text-dim)]">
                  Génère une série de matchs récurrents
                </span>
              </span>
            </button>
          </div>
        </Modal>
      )}
      {showCreateMatch && <CreateMatchModal onClose={() => setShowCreateMatch(false)} />}
      {showCreateSeason && <CreateSeasonModal onClose={() => setShowCreateSeason(false)} />}
    </div>
  );
}

/* =============================================================================
   12. ADMINISTRATION — dashboard des soldes de créances
   ========================================================================= */
function AdminView() {
  const { players, matches } = useAppData();
  const creditors = players.filter((p) => p.isCreditor);
  const totalBalance = creditors.reduce((s, c) => s + (c.creditBalance || 0), 0);
  const upcomingCount = matches.filter((m) => m.status !== "Terminé").length;
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
      <h2 className="pm-display font-bold text-xl mb-4">Administration</h2>

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
            .sort((a, b) => (b.creditBalance || 0) - (a.creditBalance || 0))
            .map((c) => (
              <Card key={c.id} className="p-4 flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-lg">
                  {c.emoji || "🎾"}
                </span>
                <span className="flex-1 font-semibold text-sm">{c.name}</span>
                <span className="pm-mono font-bold text-[var(--color-lime)]">
                  {(c.creditBalance || 0).toLocaleString("fr-FR")} €
                </span>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}

/* =============================================================================
   13. COMPOSANT RACINE
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
