// ─────────────────────────────────────────────────────────────────────────
// Petits composants UI réutilisables : Badge, Button, Card, Modal, Field,
// inputClass, Spinner, EmptyState. Le "design system" minimal de l'app.
// ─────────────────────────────────────────────────────────────────────────
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import Icon from "../icons/Icon";

export function Badge({ children, tone = "neutral", className = "" }) {
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

export function Button({ children, variant = "primary", className = "", ...rest }) {
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

export function Card({ children, className = "" }) {
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

export function Modal({ title, onClose, children, footer, wide = false }) {
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

export function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

export const inputClass =
  "w-full px-4 py-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-faint)] focus:outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100 transition-shadow text-sm";

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Icon.Ball className="w-8 h-8 text-[var(--color-lime)] pm-pulse" />
    </div>
  );
}

export function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-sm">
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
