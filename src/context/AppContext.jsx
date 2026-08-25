// ─────────────────────────────────────────────────────────────────────────
// Contexte applicatif (session + données partagées) — fournit
// { connectedPlayer, isAdmin, players, matches, login, logout } à toute
// l'app. Le Provider est créé dans components/auth/AuthGate.jsx.
// ─────────────────────────────────────────────────────────────────────────
import { createContext, useContext } from "react";

export const AppDataContext = createContext(null);

export function useAppData() {
  return useContext(AppDataContext);
}
