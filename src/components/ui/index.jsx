// ─────────────────────────────────────────────────────────────────────────
// Petits composants UI réutilisables : Badge, Button, Card, Modal, Field,
// inputClass, Spinner, EmptyState. Le "design system" minimal de l'app.
// ─────────────────────────────────────────────────────────────────────────
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import Icon from "../icons/Icon";

export function Badge({ children, tone = "neutral", className = "" }) {
  const tones = {
    neutral: "bg-white/60 text-[var(--color-text-dim)] border-white/70",
    paid: "bg-emerald-100/70 text-emerald-700 border-emerald-200/60",
    unpaid: "bg-orange-100/70 text-orange-700 border-orange-200/60",
    lime: "bg-teal-100/70 text-teal-700 border-teal-200/60",
    blue: "bg-sky-100/70 text-sky-700 border-sky-200/60",
    danger: "bg-rose-100/70 text-rose-600 border-rose-200/60",
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
      "bg-[var(--color-lime)] text-white hover:brightness-105 active:scale-[0.98] shadow-[0_8px_20px_-6px_rgba(63,164,124,0.5)]",
    secondary:
      "bg-white/90 text-[var(--color-text)] border border-white/70 hover:bg-white active:scale-[0.98] shadow-sm",
    ghost: "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
    danger: "bg-rose-100/70 text-rose-700 border border-rose-200/60",
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
        "bg-white/90 border border-white/70 rounded-[26px] shadow-[0_12px_32px_-8px_rgba(20,33,61,0.12)]",
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
          "relative w-full max-h-[90vh] flex flex-col bg-white/80 backdrop-blur-2xl backdrop-saturate-150 border border-white/60 rounded-[28px] shadow-2xl overflow-hidden pm-rise",
          wide ? "max-w-lg" : "max-w-sm"
        )}
      >
        <div className="p-4 border-b border-white/50 flex justify-between items-center bg-white/70 shrink-0">
          <h3 className="pm-display font-bold text-lg text-[var(--color-text)]">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/70 border border-white/70 text-[var(--color-text-dim)] hover:text-[var(--color-text)] shrink-0"
          >
            <Icon.X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3 flex-1 pm-scroll-visible">{children}</div>
        {footer && (
          <div className="p-4 border-t border-white/50 bg-white/70 flex justify-end gap-2 shrink-0">
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
  "w-full px-4 py-3 rounded-2xl bg-white/85 border border-white/70 text-[var(--color-text)] placeholder-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-blue)]/40 focus:ring-4 focus:ring-[var(--color-blue)]/10 transition-shadow text-sm";

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Icon.Ball className="w-8 h-8 text-[var(--color-lime)] pm-pulse" />
    </div>
  );
}

export function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 bg-white/85 border border-white/60 rounded-[26px] shadow-sm">
      <div className="w-14 h-14 rounded-2xl bg-white/60 border border-white/70 flex items-center justify-center mb-4 text-[var(--color-text-faint)]">
        {icon}
      </div>
      <p className="font-semibold text-[var(--color-text)] mb-1">{title}</p>
      {subtitle && (
        <p className="text-sm text-[var(--color-text-dim)] max-w-xs">{subtitle}</p>
      )}
    </div>
  );
}
