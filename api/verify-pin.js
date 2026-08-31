// ─────────────────────────────────────────────────────────────────────────
// Vérification du code PIN de connexion — appelée par le clavier PIN de
// l'app (src/components/auth/AuthGate.jsx) à la place de l'ancienne
// comparaison faite directement dans le navigateur.
//
// Les codes PIN "sécurisés" vivent dans la collection Firestore
// player_credentials, verrouillée (personne ne peut la lire ou l'écrire
// directement depuis un navigateur — voir firestore.rules). Seule cette
// fonction, via le SDK Admin, peut y accéder.
//
// Migration automatique et progressive : les comptes créés AVANT ce
// correctif ont encore leur code sur l'ancienne fiche players/{id}. À la
// première connexion réussie (ou tentative) après ce correctif, on déplace
// le code vers player_credentials et on l'efface de players — sans aucune
// action manuelle nécessaire, ni pour Max ni pour les joueurs.
//
// Depuis le 31/08/2026 : une connexion réussie émet aussi un jeton de
// session signé (voir _firebaseAdmin.js) que le navigateur renvoie ensuite
// à manage-pin.js pour prouver son identité avant de changer un code PIN.
// ─────────────────────────────────────────────────────────────────────────
import { getAdminDb, FieldValue, signSessionToken } from "./_firebaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Méthode non autorisée." });
    return;
  }

  try {
    const { playerId, pin } = req.body || {};
    if (!playerId || typeof pin !== "string" || pin.length !== 4) {
      res.status(400).json({ ok: false, error: "Requête invalide." });
      return;
    }

    const db = getAdminDb();
    const credRef = db.collection("player_credentials").doc(playerId);
    const credSnap = await credRef.get();

    let codes;
    let needsMigration = false;

    if (credSnap.exists) {
      codes = credSnap.data();
    } else {
      const playerRef = db.collection("players").doc(playerId);
      const playerSnap = await playerRef.get();
      if (!playerSnap.exists) {
        res.status(200).json({ ok: false });
        return;
      }
      const data = playerSnap.data();
      codes = {
        accessCode: data.accessCode || null,
        secondaryTestCode: data.secondaryTestCode || null,
        secondaryTestPlayerId: data.secondaryTestPlayerId || null,
      };
      needsMigration = Boolean(codes.accessCode);
    }

    let loginAsPlayerId = null;
    if (codes.accessCode && pin === codes.accessCode) {
      loginAsPlayerId = playerId;
    } else if (codes.secondaryTestCode && pin === codes.secondaryTestCode) {
      loginAsPlayerId = codes.secondaryTestPlayerId || null;
    }

    if (needsMigration) {
      await credRef.set({
        accessCode: codes.accessCode,
        secondaryTestCode: codes.secondaryTestCode,
        secondaryTestPlayerId: codes.secondaryTestPlayerId,
      });
      await db.collection("players").doc(playerId).update({
        accessCode: FieldValue.delete(),
        secondaryTestCode: FieldValue.delete(),
        secondaryTestPlayerId: FieldValue.delete(),
      });
    }

    if (!loginAsPlayerId) {
      res.status(200).json({ ok: false });
      return;
    }

    res.status(200).json({
      ok: true,
      loginAsPlayerId,
      sessionToken: signSessionToken(loginAsPlayerId),
    });
  } catch (error) {
    console.error("verify-pin error:", error);
    res.status(500).json({ ok: false, error: "Erreur serveur." });
  }
}
