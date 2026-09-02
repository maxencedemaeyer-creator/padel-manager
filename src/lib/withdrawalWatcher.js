// ─────────────────────────────────────────────────────────────────────────
// Détection des désinscriptions tardives (sans service externe) — voir
// components/matches/CourtPanel.jsx pour où les dossiers "withdrawals" sont
// créés (selfLeave), et components/layout/Header.jsx pour la clochette.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from "react";
import { collection, doc, getDocs, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { WITHDRAWAL_ALERT_WINDOW_HOURS } from "./constants";

// `matches` est fourni par l'appelant (useWithdrawalWatcher), lui-même
// alimenté par le flux temps réel déjà ouvert par useMatches() (voir
// src/hooks/useFirestoreData.js) — on ne refait plus ici un getDocs séparé
// sur toute la collection "matches". Avant ce changement, cette fonction
// retéléchargeait TOUS les matchs de l'app depuis Firestore à chaque
// ouverture ET toutes les 60 secondes tant qu'un onglet restait ouvert, en
// plus du flux temps réel déjà utilisé par le reste de l'app pour la même
// donnée — un des principaux facteurs de lenteur au chargement (voir aussi
// usePresenceAutoAbsentWatcher dans presenceWatcher.js, qui faisait la même
// chose).
async function resolvePendingWithdrawals(matches) {
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

    const freshMatches = matches || [];

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

// `matches` : tableau à jour venant de useMatches() côté appelant (voir
// src/App.tsx) — gardé dans une ref pour que l'intervalle (créé une seule
// fois) utilise toujours la dernière version reçue, sans avoir à recréer le
// setInterval à chaque mise à jour des matchs.
export function useWithdrawalWatcher(matches) {
  const matchesRef = useRef(matches);
  matchesRef.current = matches;

  useEffect(() => {
    resolvePendingWithdrawals(matchesRef.current);
    const interval = setInterval(() => resolvePendingWithdrawals(matchesRef.current), 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
