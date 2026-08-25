// ─────────────────────────────────────────────────────────────────────────
// Détection des désinscriptions tardives (sans service externe) — voir
// components/matches/CourtPanel.jsx pour où les dossiers "withdrawals" sont
// créés (selfLeave), et components/layout/Header.jsx pour la clochette.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { collection, doc, getDocs, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { WITHDRAWAL_ALERT_WINDOW_HOURS } from "./constants";

async function resolvePendingWithdrawals() {
  try {
    const pendingSnap = await getDocs(
      query(collection(db, "withdrawals"), where("resolved", "==", false))
    );
    if (pendingSnap.empty) return;

    const now = Date.now();
    const dueDocs = pendingSnap.docs.filter(
      (d) => new Date(d.data().resolveAt).getTime() <= now
    );
    if (dueDocs.length === 0) return;

    const matchesSnap = await getDocs(collection(db, "matches"));
    const freshMatches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    for (const docSnap of dueDocs) {
      const w = docSnap.data();
      // Réclame immédiatement ce dossier pour éviter un double traitement si
      // un autre appareil le résout au même moment.
      try {
        await updateDoc(doc(db, "withdrawals", docSnap.id), { resolved: true });
      } catch (e) {
        continue; // déjà réclamé par un autre appareil entre-temps
      }

      const stillActiveSameDay = freshMatches.some(
        (m) =>
          m.date === w.matchDate &&
          (m.participants || []).some((p) => p.playerId === w.playerId)
      );
      if (stillActiveSameDay) continue; // simple permutation, pas une vraie désinscription

      const matchStart = new Date(`${w.matchDate}T${w.matchTime || "00:00"}:00`).getTime();
      const hoursBefore = (matchStart - new Date(w.leftAt).getTime()) / 3600000;
      if (hoursBefore > WITHDRAWAL_ALERT_WINDOW_HOURS) continue; // désinscription assez à l'avance

      try {
        await updateDoc(doc(db, "withdrawals", docSnap.id), {
          alertWorthy: true,
          read: false,
          hoursBefore: Math.max(0, Math.round(hoursBefore)),
        });
      } catch (e) {
        console.error("Erreur lors du marquage de l'alerte :", e);
      }
    }
  } catch (e) {
    console.error("Erreur lors de la vérification des désinscriptions :", e);
  }
}

export function useWithdrawalWatcher() {
  useEffect(() => {
    resolvePendingWithdrawals();
    const interval = setInterval(resolvePendingWithdrawals, 60000);
    return () => clearInterval(interval);
  }, []);
}

// Alertes de désinscription tardive à afficher aux administrateurs.
export function useWithdrawalAlerts() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    let unsub = () => {};
    try {
      const q = query(collection(db, "withdrawals"), where("alertWorthy", "==", true));
      unsub = onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          list.sort((a, b) => new Date(b.leftAt) - new Date(a.leftAt));
          setAlerts(list);
        },
        (error) => console.error(error)
      );
    } catch (error) {
      console.error(error);
    }
    return () => unsub();
  }, []);

  return alerts;
}
