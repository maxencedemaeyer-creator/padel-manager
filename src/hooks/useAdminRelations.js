// ─────────────────────────────────────────────────────────────────────────
// Préférences / incompatibilités entre joueurs (outil "Liens entre joueurs"
// de l'Administration). Ces données sont des confidences faites à l'admin :
// elles ne passent JAMAIS par Firestore côté navigateur, mais par la fonction
// serveur api/admin-relations.js, qui vérifie que la personne connectée est
// bien administrateur (voir le commentaire de ce fichier). Tout est donc lu et
// écrit sur Firebase, jamais en local, et invisible pour les autres joueurs.
//
// Chargement à la demande : `enabled` reste faux tant que le volet est replié,
// pour ne rien demander au serveur tant que l'admin n'ouvre pas l'outil.
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from "react";
import { useAppData } from "../context/AppContext";

async function callAdminRelations(payload) {
  const response = await fetch("/api/admin-relations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error(
      "Le serveur ne répond pas à cette fonction. Vérifiez que le fichier api/admin-relations.js a bien été ajouté sur GitHub et que Vercel a fini de se redéployer."
    );
  }
  if (!data || !data.ok) throw new Error((data && data.error) || "Erreur serveur.");
  return data;
}

export function useAdminRelations(enabled) {
  const { sessionToken } = useAppData();
  const [relations, setRelations] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const started = useRef(false);

  const load = useCallback(async () => {
    if (!sessionToken) {
      setError("Session expirée : déconnectez-vous puis reconnectez-vous avec votre code.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await callAdminRelations({ action: "get", actingToken: sessionToken });
      setRelations(data.players || {});
      setLoaded(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (enabled && !started.current) {
      started.current = true;
      load();
    }
  }, [enabled, load]);

  // Enregistre la fiche complète d'UN joueur (mode, partenaires souhaités,
  // joueurs à éviter). Lève une exception en cas d'échec pour que l'appelant
  // puisse afficher l'erreur.
  const savePrefs = useCallback(
    async (playerId, prefs) => {
      if (!sessionToken) throw new Error("Session expirée : reconnectez-vous.");
      const data = await callAdminRelations({
        action: "save",
        actingToken: sessionToken,
        playerId,
        prefs,
      });
      setRelations((prev) => ({ ...prev, [playerId]: data.prefs }));
      return data.prefs;
    },
    [sessionToken]
  );

  return { relations, loading, error, loaded, reload: load, savePrefs };
}
