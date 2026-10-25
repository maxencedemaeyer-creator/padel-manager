// ─────────────────────────────────────────────────────────────────────────
// Changement des rôles et étiquettes protégées d'un joueur (25/10/2026,
// chantier des rôles, étape 1 — sécurité).
//
// Appelée depuis EditPlayerModal.jsx (fiche joueur), AddPlayerModal.jsx
// (ajout d'un joueur) et CreateSeasonModal.jsx (les créanciers choisis
// pour un abonnement deviennent "Créancier").
//
// POST { actingToken, updates: [{ playerId, changes: { isAdmin?, isCoach?,
//        isCreditor?, isTest?, isGuest? } }] }   → { ok, changed }
//
// Règles appliquées ICI, côté serveur (impossibles à contourner depuis un
// navigateur, puisque firestore.rules interdit désormais d'écrire ces
// champs directement) :
//   - seul un administrateur (vérifié en base, jamais dans le jeton) peut
//     changer un rôle ou une étiquette protégée ;
//   - personne ne modifie ses propres rôles, sauf l'admin principal ;
//   - seul l'admin principal nomme ou retire un administrateur ;
//   - l'admin principal ne peut jamais perdre son rôle d'administrateur
//     (le dernier admin est donc toujours protégé) ;
//   - `isOwner` (admin principal) ne se change que dans la console Firebase.
// Tout est vérifié AVANT d'écrire : soit toute la demande passe, soit rien
// n'est modifié.
// ─────────────────────────────────────────────────────────────────────────
import { getAdminDb, FieldValue, verifySessionToken } from "./_firebaseAdmin.js";
import { EDITABLE_ROLE_FIELDS, getOwnerId, getActingAdmin } from "./_roles.js";

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
    const updates = Array.isArray(body.updates) ? body.updates : [];
    if (updates.length === 0 || updates.length > 50) {
      fail(res, 400, "Requête invalide.");
      return;
    }

    const db = getAdminDb();
    const acting = await getActingAdmin(db, session);
    if (!acting) {
      fail(res, 403, "Action réservée à l'administrateur.");
      return;
    }
    const ownerId = await getOwnerId(db);
    const actingIsOwner = ownerId === acting.id;

    const writes = [];
    for (const u of updates) {
      const playerId = u && u.playerId;
      const changes = u && u.changes;
      if (!playerId || !changes || typeof changes !== "object") {
        fail(res, 400, "Requête invalide.");
        return;
      }
      const targetRef = db.collection("players").doc(playerId);
      const targetSnap = await targetRef.get();
      if (!targetSnap.exists) {
        fail(res, 404, "Joueur introuvable.");
        return;
      }
      const target = targetSnap.data();
      const isSelf = playerId === acting.id;
      const data = {};

      for (const [field, value] of Object.entries(changes)) {
        if (!EDITABLE_ROLE_FIELDS.includes(field)) {
          fail(res, 400, `Champ non autorisé : ${field}.`);
          return;
        }
        if (typeof value !== "boolean") {
          fail(res, 400, "Valeur invalide.");
          return;
        }
        if ((target[field] === true) === value) continue; // rien ne change

        if (isSelf && !actingIsOwner) {
          fail(res, 403, "Vous ne pouvez pas modifier vos propres rôles.");
          return;
        }
        if (field === "isAdmin") {
          if (!actingIsOwner) {
            fail(res, 403, "Seul l'administrateur principal peut nommer ou retirer un administrateur.");
            return;
          }
          if (playerId === ownerId && value === false) {
            fail(res, 403, "L'administrateur principal ne peut pas perdre son rôle d'administrateur.");
            return;
          }
        }
        data[field] = value;
      }

      // Nouvelle nomination comme coach : la fenêtre « Tu es désormais
      // coach ! » (CoachIntro.jsx) doit réapparaître, même si la personne
      // l'avait déjà vue lors d'une nomination précédente.
      if (data.isCoach === true) data["seenFeatures.coachIntro"] = FieldValue.delete();
      if (Object.keys(data).length > 0) writes.push({ ref: targetRef, data, name: target.name || "?" });
    }

    if (writes.length > 0) {
      const batch = db.batch();
      writes.forEach((w) => batch.update(w.ref, w.data));
      // Journal d'activité (étape 4) : une ligne par joueur modifié, écrite
      // dans le MÊME envoi que le changement de rôle (tout ou rien).
      const LABELS = {
        isAdmin: "Administrateur",
        isCoach: "Coach",
        isCreditor: "Créancier",
        isTest: "Compte test",
        isGuest: "Invité",
      };
      writes.forEach((w) => {
        const parts = Object.entries(w.data)
          .filter(([k]) => LABELS[k])
          .map(([k, v]) => `${LABELS[k]} ${v ? "donné" : "retiré"}`);
        if (parts.length === 0) return;
        batch.set(db.collection("activityLog").doc(), {
          at: FieldValue.serverTimestamp(),
          actorId: acting.id,
          actorName: acting.data.name || "?",
          type: "role",
          summary: `${w.name} : ${parts.join(", ")}`,
        });
      });
      await batch.commit();
    }

    res.status(200).json({ ok: true, changed: writes.length });
  } catch (error) {
    console.error("manage-roles error:", error);
    fail(res, 500, "Erreur serveur.");
  }
}
