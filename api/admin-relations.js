// ─────────────────────────────────────────────────────────────────────────
// Préférences et incompatibilités entre joueurs — outil "Liens entre
// joueurs" du centre Administration (voir claude/spec-outil-liens-joueurs-
// simulateur-2026-09-19.md dans le projet Claude).
//
// Ces informations sont des CONFIDENCES faites à l'administrateur (ex. "Adrien
// ne veut plus jouer avec Jean") : personne d'autre ne doit jamais pouvoir les
// lire. Or les règles Firestore ne savent pas distinguer un administrateur
// d'un joueur (tout le monde est connecté de façon anonyme, voir
// firestore.rules). Elles sont donc stockées dans une collection totalement
// verrouillée côté navigateur (`adminRelations`, `allow read, write: if
// false`) et n'existent que via CETTE fonction serveur, qui vérifie à chaque
// appel que le jeton de session appartient bien à un administrateur
// (`isAdmin` relu en base, jamais lu dans le jeton) — même mécanique que
// api/manage-pin.js.
//
// Deux actions, toutes en POST avec { action, actingToken, ... } :
//   - "get"  : → { ok, players }  (toutes les préférences, par id de joueur)
//   - "save" : { playerId, prefs } → { ok, prefs }  (remplace la fiche de ce
//       joueur ; les autres joueurs ne sont pas touchés)
//
// Format d'une fiche (tout est facultatif, valeurs par défaut ci-dessous) :
//   {
//     mode: "indifferent" | "varied" | "stable",   // défaut "indifferent"
//     modeSince: "AAAA-MM-JJ" | null,               // début du mode Stable
//     favorites: [playerId, ...],                   // partenaires souhaités
//     avoid: [{ playerId, alsoOpponent, since }],   // joueurs à éviter
//   }
//
// Ce fichier est purement consultatif : il n'écrit JAMAIS dans `matches`,
// dans les présences ni dans la composition des équipes.
// ─────────────────────────────────────────────────────────────────────────
import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb, verifySessionToken } from "./_firebaseAdmin.js";

const MODES = ["indifferent", "varied", "stable"];
const MAX_LIST = 30;

// Date du jour au format AAAA-MM-JJ, à l'heure de Bruxelles (et non en UTC,
// pour ne pas glisser sur la veille passé minuit).
function todayBrussels() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
}

function isId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function uniqueIds(list, selfId) {
  if (!Array.isArray(list)) return [];
  const out = [];
  list.forEach((value) => {
    if (isId(value) && value !== selfId && !out.includes(value) && out.length < MAX_LIST) {
      out.push(value);
    }
  });
  return out;
}

// Nettoie ce que le navigateur envoie et complète ce que seul le serveur doit
// décider (dates de début), en s'appuyant sur la fiche précédente.
function sanitizePrefs(input, playerId, previous) {
  const raw = input && typeof input === "object" ? input : {};
  const mode = MODES.includes(raw.mode) ? raw.mode : "indifferent";
  const today = todayBrussels();

  let modeSince = null;
  if (mode === "stable") {
    modeSince =
      previous && previous.mode === "stable" && typeof previous.modeSince === "string"
        ? previous.modeSince
        : today;
  }

  const previousAvoid = new Map(
    (previous && Array.isArray(previous.avoid) ? previous.avoid : [])
      .filter((entry) => entry && isId(entry.playerId))
      .map((entry) => [entry.playerId, entry])
  );
  const avoid = [];
  (Array.isArray(raw.avoid) ? raw.avoid : []).forEach((entry) => {
    if (!entry || !isId(entry.playerId) || entry.playerId === playerId) return;
    if (avoid.some((a) => a.playerId === entry.playerId) || avoid.length >= MAX_LIST) return;
    const before = previousAvoid.get(entry.playerId);
    avoid.push({
      playerId: entry.playerId,
      alsoOpponent: entry.alsoOpponent === true,
      since: before && typeof before.since === "string" ? before.since : today,
    });
  });

  return {
    mode,
    modeSince,
    favorites: uniqueIds(raw.favorites, playerId),
    avoid,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Méthode non autorisée." });
    return;
  }

  try {
    const body = req.body || {};
    const session = verifySessionToken(body.actingToken);
    if (!session) {
      res.status(403).json({ ok: false, error: "Session invalide ou expirée. Reconnectez-vous." });
      return;
    }

    const db = getAdminDb();
    const actingSnap = await db.collection("players").doc(session.playerId).get();
    if (!actingSnap.exists || actingSnap.data().isAdmin !== true) {
      res.status(403).json({ ok: false, error: "Action réservée à l'administrateur." });
      return;
    }

    const ref = db.collection("adminRelations").doc("config");

    if (body.action === "get") {
      const snap = await ref.get();
      const data = snap.exists ? snap.data() : {};
      res.status(200).json({ ok: true, players: data.players || {} });
      return;
    }

    if (body.action === "save") {
      const { playerId, prefs } = body;
      if (!isId(playerId)) {
        res.status(400).json({ ok: false, error: "playerId manquant." });
        return;
      }
      const snap = await ref.get();
      const previous = snap.exists && snap.data().players ? snap.data().players[playerId] : null;
      const clean = sanitizePrefs(prefs, playerId, previous);
      // Chemin imbriqué (et non un objet entier) : seule la fiche de CE joueur
      // est réécrite, les autres restent intactes même si deux sauvegardes
      // se croisent.
      if (snap.exists) {
        await ref.update(new FieldPath("players", playerId), clean);
      } else {
        await ref.set({ players: { [playerId]: clean } });
      }
      res.status(200).json({ ok: true, prefs: clean });
      return;
    }

    res.status(400).json({ ok: false, error: "Action inconnue." });
  } catch (error) {
    console.error("admin-relations error:", error);
    res.status(500).json({ ok: false, error: "Erreur serveur." });
  }
}
