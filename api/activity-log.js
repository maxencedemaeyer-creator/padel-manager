// ─────────────────────────────────────────────────────────────────────────
// Journal d'activité (25/10/2026, chantier des rôles, étape 4).
//
// POST { action: "add", actingToken, type, summary }
//   → ajoute une ligne. L'auteur (id + nom) et la date sont fixés ICI, par
//     le serveur, d'après le jeton de connexion : impossible d'écrire une
//     ligne au nom de quelqu'un d'autre.
// POST { action: "list", actingToken, before? }
//   → réservé à l'administrateur (vérifié en base) ; renvoie les 50 lignes
//     les plus récentes (ou les 50 précédant `before`, en millisecondes),
//     et efface au passage les lignes de plus de 12 mois.
//
// La collection `activityLog` n'apparaît pas dans firestore.rules : elle est
// donc refusée à tout navigateur (règle « refus par défaut »). Seul ce
// serveur (SDK Admin) y lit et écrit.
// ─────────────────────────────────────────────────────────────────────────
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb, FieldValue, verifySessionToken } from "./_firebaseAdmin.js";
import { getActingAdmin } from "./_roles.js";

const TYPES = ["score", "payment", "presence", "composition", "match", "player", "role", "level", "money"];
const PAGE_SIZE = 50;
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // 12 mois

function fail(res, status, error) {
  res.status(status).json({ ok: false, error });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    fail(res, 405, "Méthode non autorisée.");
    return;
  }
  try {
    const body = req.body || {};
    const session = verifySessionToken(body.actingToken);
    if (!session) {
      fail(res, 403, "Session invalide ou expirée. Reconnectez-vous.");
      return;
    }
    const db = getAdminDb();

    if (body.action === "add") {
      const type = body.type;
      const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 300) : "";
      if (!TYPES.includes(type) || !summary) {
        fail(res, 400, "Requête invalide.");
        return;
      }
      const actorSnap = await db.collection("players").doc(session.playerId).get();
      if (!actorSnap.exists) {
        fail(res, 403, "Joueur introuvable.");
        return;
      }
      await db.collection("activityLog").add({
        at: FieldValue.serverTimestamp(),
        actorId: session.playerId,
        actorName: actorSnap.data().name || "?",
        type,
        summary,
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (body.action === "list") {
      const acting = await getActingAdmin(db, session);
      if (!acting) {
        fail(res, 403, "Action réservée à l'administrateur.");
        return;
      }
      const col = db.collection("activityLog");

      // Purge des lignes de plus de 12 mois (au plus 200 à la fois, et
      // seulement à l'ouverture du journal — jamais en tâche de fond).
      if (!body.before) {
        const cutoff = Timestamp.fromMillis(Date.now() - RETENTION_MS);
        const old = await col.where("at", "<", cutoff).limit(200).get();
        if (!old.empty) {
          const batch = db.batch();
          old.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }

      let q = col.orderBy("at", "desc");
      if (typeof body.before === "number" && body.before > 0) {
        q = q.startAfter(Timestamp.fromMillis(body.before));
      }
      const snap = await q.limit(PAGE_SIZE).get();
      const entries = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          at: data.at && typeof data.at.toMillis === "function" ? data.at.toMillis() : null,
          actorId: data.actorId || null,
          actorName: data.actorName || "?",
          type: data.type || "",
          summary: data.summary || "",
        };
      });
      res.status(200).json({ ok: true, entries, hasMore: snap.size === PAGE_SIZE });
      return;
    }

    fail(res, 400, "Action inconnue.");
  } catch (error) {
    console.error("activity-log error:", error);
    fail(res, 500, "Erreur serveur.");
  }
}
