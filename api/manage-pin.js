// ─────────────────────────────────────────────────────────────────────────
// Gestion des codes PIN par un administrateur (ou par un joueur pour son
// propre code) — appelée depuis AddPlayerModal.jsx, EditPlayerModal.jsx et
// StatsView.jsx (fenêtre "Modifier mon code PIN"), à la place des anciens
// appels directs à Firestore (les codes ne sont plus jamais lisibles ni
// modifiables directement depuis le navigateur — voir firestore.rules).
//
// Trois actions, toutes en POST avec { action, ... } dans le corps :
//   - "check"    : { code, excludePlayerId?, actingToken } → { duplicatePlayerId }
//   - "generate" : { excludePlayerId?, actingToken }        → { code }
//   - "set"      : { playerId, accessCode?, secondaryTestCode?, secondaryTestPlayerId?, actingToken? }
//       Seuls les champs fournis sont modifiés (les autres restent
//       inchangés) ; passer explicitement `null` efface un champ optionnel.
//
// Vérification d'identité (31/08/2026) : cette route utilise le SDK Admin et
// contourne donc complètement les règles Firestore — sans contrôle, un
// simple appel réseau avec l'id de N'IMPORTE QUEL joueur suffisait à lui
// écraser son code PIN et à se connecter à sa place. `actingToken` est le
// jeton signé émis par verify-pin.js à la connexion (voir
// _firebaseAdmin.js) :
//   - "check"/"generate" exigent un jeton valide (n'importe quel joueur
//     connecté) — ça bloque un visiteur anonyme qui n'a jamais réussi de
//     connexion PIN, mais ça n'empêche pas un joueur du groupe déjà connecté
//     de tester ces routes ; limite acceptée, cohérente avec le reste de
//     l'app (voir la note "limites connues" du 30/08 sur l'absence de rôles
//     au niveau des règles Firestore).
//   - "set" exige un jeton valide dont le titulaire est SOIT le joueur ciblé
//     (un joueur change son propre code) SOIT un administrateur (`isAdmin`
//     vérifié en base, pas dans le jeton). Exception : aucun jeton n'existe
//     encore lors de la toute première création de compte (base
//     entièrement vide, voir AuthGate.jsx → BootstrapAdmin) — ce cas précis
//     reste autorisé sans jeton, mais seulement tant qu'aucun joueur
//     n'existe déjà.
// ─────────────────────────────────────────────────────────────────────────
import { getAdminDb, FieldValue, verifySessionToken } from "./_firebaseAdmin.js";
import { getOwnerId, getActingAdmin } from "./_roles.js";

async function collectAllCodes(db) {
  const [credsSnap, playersSnap] = await Promise.all([
    db.collection("player_credentials").get(),
    db.collection("players").get(),
  ]);
  const byPlayerId = new Map();
  playersSnap.forEach((docSnap) => {
    const code = docSnap.data().accessCode;
    if (code) byPlayerId.set(docSnap.id, code);
  });
  credsSnap.forEach((docSnap) => {
    const code = docSnap.data().accessCode;
    if (code) byPlayerId.set(docSnap.id, code);
  });
  return byPlayerId;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Méthode non autorisée." });
    return;
  }

  try {
    const body = req.body || {};
    const db = getAdminDb();
    const session = verifySessionToken(body.actingToken);

    if (body.action === "check" || body.action === "generate") {
      if (!session) {
        res.status(403).json({ ok: false, error: "Session invalide ou expirée. Reconnectez-vous." });
        return;
      }
    }

    // Consultation des codes PIN par l'administrateur (ajout du 01/10/2026) :
    // renvoie { codes: { [playerId]: "1234" } }. Réservé aux admins (vérifié
    // en base, pas dans le jeton). Coût : une lecture par joueur, seulement
    // quand l'admin ouvre le volet "Codes PIN" dans l'onglet Administration.
    if (body.action === "list") {
      if (!session) {
        res.status(403).json({ ok: false, error: "Session invalide ou expirée. Reconnectez-vous." });
        return;
      }
      const acting = await getActingAdmin(db, session);
      if (!acting) {
        res.status(403).json({ ok: false, error: "Action réservée à l'administrateur." });
        return;
      }
      const codes = await collectAllCodes(db);
      // 25/10/2026 (rôles, étape 1) : seul l'admin principal voit le code
      // des AUTRES administrateurs — sinon un admin pourrait se connecter à
      // la place d'un autre admin. Chacun voit toujours son propre code.
      const ownerId = await getOwnerId(db);
      if (ownerId !== acting.id) {
        const adminsSnap = await db.collection("players").where("isAdmin", "==", true).get();
        adminsSnap.forEach((d) => {
          if (d.id !== acting.id) codes.delete(d.id);
        });
      }
      res.status(200).json({ ok: true, codes: Object.fromEntries(codes) });
      return;
    }

    if (body.action === "check") {
      const { code, excludePlayerId } = body;
      if (!code || code.length !== 4) {
        res.status(400).json({ ok: false, error: "Code invalide." });
        return;
      }
      const codes = await collectAllCodes(db);
      let duplicatePlayerId = null;
      for (const [id, c] of codes) {
        if (c === code && id !== excludePlayerId) {
          duplicatePlayerId = id;
          break;
        }
      }
      res.status(200).json({ ok: true, duplicatePlayerId });
      return;
    }

    if (body.action === "generate") {
      const { excludePlayerId } = body;
      const codes = await collectAllCodes(db);
      const taken = new Set(
        [...codes.entries()]
          .filter(([id]) => id !== excludePlayerId)
          .map(([, c]) => c)
      );
      let code;
      do {
        code = String(Math.floor(1000 + Math.random() * 9000));
      } while (taken.has(code));
      res.status(200).json({ ok: true, code });
      return;
    }

    if (body.action === "set") {
      const { playerId, accessCode, secondaryTestCode, secondaryTestPlayerId } = body;
      if (!playerId) {
        res.status(400).json({ ok: false, error: "playerId manquant." });
        return;
      }
      if (accessCode !== undefined && (typeof accessCode !== "string" || accessCode.length !== 4)) {
        res.status(400).json({ ok: false, error: "Code PIN invalide." });
        return;
      }

      if (!session) {
        // Seul cas où l'absence de jeton est légitime : la toute première
        // création de compte, quand la base ne contient encore aucun
        // joueur (voir BootstrapAdmin dans AuthGate.jsx).
        const anyPlayer = await db.collection("players").limit(1).get();
        if (!anyPlayer.empty) {
          res.status(403).json({ ok: false, error: "Session invalide ou expirée. Reconnectez-vous." });
          return;
        }
      } else if (session.playerId !== playerId) {
        const acting = await getActingAdmin(db, session);
        if (!acting) {
          // Coach (25/10/2026, étape 3 des rôles) : il peut ajouter un
          // joueur, et donc lui donner son PREMIER code — uniquement pour un
          // joueur qui n'a encore aucun code (fiche toute neuve), qui n'est
          // ni admin ni coach, et sans toucher à la connexion secrète. Il ne
          // peut jamais changer le code d'un joueur existant.
          const coachSnap = await db.collection("players").doc(session.playerId).get();
          const isCoach =
            coachSnap.exists && coachSnap.data().isCoach === true && coachSnap.data().archived !== true;
          let allowedForCoach = false;
          if (isCoach && accessCode !== undefined && secondaryTestCode === undefined && secondaryTestPlayerId === undefined) {
            const [targetSnap, credSnap] = await Promise.all([
              db.collection("players").doc(playerId).get(),
              db.collection("player_credentials").doc(playerId).get(),
            ]);
            const t = targetSnap.exists ? targetSnap.data() : null;
            const hasCode = (credSnap.exists && credSnap.data().accessCode) || (t && t.accessCode);
            allowedForCoach = Boolean(t) && !hasCode && t.isAdmin !== true && t.isCoach !== true;
          }
          if (!allowedForCoach) {
            res.status(403).json({ ok: false, error: "Action réservée à l'administrateur." });
            return;
          }
        } else {
          // 25/10/2026 (rôles, étape 1) : le code d'un administrateur ne peut
          // être changé que par lui-même ou par l'admin principal.
          const targetSnap = await db.collection("players").doc(playerId).get();
          if (targetSnap.exists && targetSnap.data().isAdmin === true) {
            const ownerId = await getOwnerId(db);
            if (ownerId !== acting.id) {
              res.status(403).json({
                ok: false,
                error: "Seul l'administrateur principal peut changer le code d'un administrateur.",
              });
              return;
            }
          }
        }
      }

      // Connexion secrète (corrigé le 25/10/2026 — correctif du 21/09 jamais
      // déployé) : DÉFINIR un code secondaire ou sa destination est réservé à
      // un administrateur agissant sur SA PROPRE fiche, et la destination
      // doit être un compte marqué "test". EFFACER (null) reste permis au
      // titulaire ou à un admin. Avant ce correctif, n'importe quel joueur
      // connecté pouvait se poser une connexion secrète vers n'importe quel
      // compte (admin compris) en appelant directement cette route.
      const definesSecondary =
        (secondaryTestCode !== undefined && secondaryTestCode !== null) ||
        (secondaryTestPlayerId !== undefined && secondaryTestPlayerId !== null);
      if (definesSecondary) {
        const acting = await getActingAdmin(db, session);
        if (!acting || acting.id !== playerId) {
          res.status(403).json({
            ok: false,
            error: "La connexion secrète est réservée à l'administrateur, sur sa propre fiche.",
          });
          return;
        }
        if (secondaryTestCode !== undefined && secondaryTestCode !== null) {
          if (typeof secondaryTestCode !== "string" || !/^\d{4}$/.test(secondaryTestCode)) {
            res.status(400).json({ ok: false, error: "Code secondaire invalide." });
            return;
          }
        }
        let destinationId = secondaryTestPlayerId;
        if (destinationId === undefined) {
          const credSnap = await db.collection("player_credentials").doc(playerId).get();
          destinationId = credSnap.exists ? credSnap.data().secondaryTestPlayerId || null : null;
        }
        if (destinationId) {
          const destSnap = await db.collection("players").doc(destinationId).get();
          if (!destSnap.exists || destSnap.data().isTest !== true) {
            res.status(403).json({
              ok: false,
              error: "La connexion secrète ne peut ouvrir qu'un profil coché « Compte test ».",
            });
            return;
          }
        }
      }

      const update = {};
      if (accessCode !== undefined) update.accessCode = accessCode;
      if (secondaryTestCode !== undefined) {
        update.secondaryTestCode = secondaryTestCode === null ? FieldValue.delete() : secondaryTestCode;
      }
      if (secondaryTestPlayerId !== undefined) {
        update.secondaryTestPlayerId =
          secondaryTestPlayerId === null ? FieldValue.delete() : secondaryTestPlayerId;
      }

      if (Object.keys(update).length > 0) {
        await db.collection("player_credentials").doc(playerId).set(update, { merge: true });
      }

      const playerRef = db.collection("players").doc(playerId);
      const playerSnap = await playerRef.get();
      if (playerSnap.exists) {
        const data = playerSnap.data();
        if ("accessCode" in data || "secondaryTestCode" in data || "secondaryTestPlayerId" in data) {
          await playerRef.update({
            accessCode: FieldValue.delete(),
            secondaryTestCode: FieldValue.delete(),
            secondaryTestPlayerId: FieldValue.delete(),
          });
        }
      }

      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ ok: false, error: "Action inconnue." });
  } catch (error) {
    console.error("manage-pin error:", error);
    res.status(500).json({ ok: false, error: "Erreur serveur." });
  }
}
