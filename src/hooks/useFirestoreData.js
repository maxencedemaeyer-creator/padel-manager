// ─────────────────────────────────────────────────────────────────────────
// Hooks Firestore (lecture temps réel) — players & matches.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
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
