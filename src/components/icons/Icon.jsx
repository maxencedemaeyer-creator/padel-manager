// ─────────────────────────────────────────────────────────────────────────
// Icônes SVG inline — aucune dépendance externe (pas de lucide-react etc).
// Usage : <Icon.Trophy className="w-4 h-4" />
// ─────────────────────────────────────────────────────────────────────────
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
  Key: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12.3L20 3.3M15.5 3.5L18.5 6.5M13 6L16 9" />
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
  Settings: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  Trash: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M4 7h16M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7m2 0v13a2 2 0 01-2 2H9a2 2 0 01-2-2V7h10z" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  ),
  Bell: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M6 8a6 6 0 1112 0c0 4.5 1.5 6 1.5 6h-15S6 12.5 6 8z" />
      <path d="M10 21a2 2 0 004 0" />
    </svg>
  ),
  Wallet: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M3 7a2 2 0 012-2h13a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      <path d="M16 12h3M3 9h18" />
    </svg>
  ),
  AlertCircle: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  ),
  CheckCircle: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  ),
  ArrowDownRight: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M7 7l10 10M17 7v10H7" />
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
  Flame: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M12 2c1.5 3-2 4.5-2 8a4 4 0 008 0c1.5 1.5 2 3.5 2 5a8 8 0 11-16 0c0-4 3-6 3-9 1 1 1.5 2 1.5 3C9.5 5.5 11 3.5 12 2z" />
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
  Question: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.5a2.8 2.8 0 015.4 1c0 1.9-2.6 2.1-2.6 4" />
      <circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  Refresh: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M4 4v5h5" />
      <path d="M20 20v-5h-5" />
      <path d="M5.5 9a7 7 0 0112.3-2.5L20 9M18.5 15a7 7 0 01-12.3 2.5L4 15" />
    </svg>
  ),
  Camera: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <path d="M4 8a2 2 0 012-2h1.5l1-1.6A2 2 0 0110.2 3.4h3.6a2 2 0 011.7 1l1 1.6H18a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  ),
};


export default Icon;
