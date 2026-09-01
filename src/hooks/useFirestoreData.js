// ─────────────────────────────────────────────────────────────────────────
// Hooks Firestore (lecture temps réel) — players & matches.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";

export function usePlayers() {
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

export function useMatches() {
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

// Réglages globaux de l'app (document unique "settings/appConfig") — pour
// l'instant, uniquement l'activation du Fun Center pour tous les joueurs
// (voir src/views/AdminView.jsx). Par défaut (document absent ou champ
// absent), le Fun Center reste réservé à l'administrateur.
export function useAppSettings() {
  const [settings, setSettings] = useState({ gameCenterEnabled: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onSnapshot(
        doc(db, "settings", "appConfig"),
        (snap) => {
          const data = snap.exists() ? snap.data() : {};
          setSettings({ gameCenterEnabled: data.gameCenterEnabled === true });
          setLoading(false);
        },
        (error) => {
          console.error(error);
          setLoading(false);
        }
      );
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
    return () => unsub();
  }, []);

  return { settings, loading };
}
