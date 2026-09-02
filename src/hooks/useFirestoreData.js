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

// Abonnements (ex-"saisons") — un document par lot généré depuis "Créer un
// abonnement" (voir CreateSeasonModal.jsx) : club, terrain(s), période,
// récurrence, tarif, et la liste des créanciers + leur créance de départ
// pour ce lot précis. Chaque match généré référence son abonnement via
// `match.abonnementId` — voir lib/stats.js (getCreditorClaims).
export function useAbonnements() {
  const [abonnements, setAbonnements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub = () => {};
    try {
      const q = query(collection(db, "abonnements"), orderBy("startDate", "asc"));
      unsub = onSnapshot(
        q,
        (snap) => {
          setAbonnements(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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

  return { abonnements, loading };
}

// Clubs — entités réutilisables lors de la génération d'un abonnement
// (nom, adresse et logo optionnels, éditables depuis "Administration" →
// "Clubs", voir ManageClubsModal.jsx).
export function useClubs() {
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub = () => {};
    try {
      const q = query(collection(db, "clubs"), orderBy("name", "asc"));
      unsub = onSnapshot(
        q,
        (snap) => {
          setClubs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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

  return { clubs, loading };
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
