// ─────────────────────────────────────────────────────────────────────────
// Sécurité "présent mais jamais composé" — même principe que
// withdrawalWatcher.js (pas de service externe / cron : tant qu'un appareil
// a l'app ouverte, il vérifie périodiquement et corrige si besoin).
//
// Un joueur peut répondre "présent" à une session (voir lib/availability.js)
// sans jamais être placé sur un terrain — typiquement parce qu'il y avait
// plus de présents que de places disponibles et que l'admin a dû composer
// sans lui ("il a fallu qu'il passe son tour"). Sans correction, ce joueur
// resterait affiché "présent" indéfiniment alors qu'il n'a en réalité pas
// joué ce match-là.
//
// PRESENCE_AUTO_ABSENT_DELAY_MINUTES après le DÉBUT du match, on repasse
// automatiquement en "absent" tout joueur encore "présent" sur une session
// mais absent de la composition de TOUS les terrains de cette session
// (peu importe le type Saison/Ponctuel — la présence n'est pas réservée à un
// seul type de match). Réutilise setSessionAvailability (lib/availability.js)
// pour rester cohérent avec le reste de l'app — même écriture Firestore
// que si le joueur avait cliqué "Absent" lui-même.
//
// Conséquence à connaître : une fois basculé "absent", ce joueur ne peut
// plus être choisi directement dans PickPlayerModal (les joueurs "absent" y
// sont désactivés) — un admin qui veut l'y placer quand même doit d'abord le
// repasser "présent" via "Gérer les présences" (ManagePresenceModal). C'est
// voulu : ça évite qu'un joueur qui a déjà cédé sa place soit réassigné par
// erreur, sans empêcher une correction volontaire de l'admin.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { PRESENCE_AUTO_ABSENT_DELAY_MINUTES } from "./constants";
import { getMatchStart, groupMatchesBySession } from "./matchLogic";
import { setSessionAvailability } from "./availability";

async function autoAbsentUnplacedPresences() {
  try {
    const matchesSnap = await getDocs(collection(db, "matches"));
    const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const now = Date.now();

    for (const session of groupMatchesBySession(matches)) {
      const start = getMatchStart(session[0]).getTime();
      if (now - start < PRESENCE_AUTO_ABSENT_DELAY_MINUTES * 60000) continue;

      const placedIds = new Set();
      session.forEach((m) =>
        (m.participants || []).forEach((p) => placedIds.add(p.playerId))
      );

      const presentIds = new Set();
      session.forEach((m) =>
        Object.entries(m.availability || {}).forEach(([playerId, status]) => {
          if (status === "present") presentIds.add(playerId);
        })
      );

      const toFlip = [...presentIds].filter((playerId) => !placedIds.has(playerId));
      for (const playerId of toFlip) {
        try {
          await setSessionAvailability(session, playerId, "absent");
        } catch (e) {
          console.error("Erreur lors du passage automatique en absent :", e);
        }
      }
    }
  } catch (e) {
    console.error("Erreur lors de la vérification des présences non composées :", e);
  }
}

export function usePresenceAutoAbsentWatcher() {
  useEffect(() => {
    autoAbsentUnplacedPresences();
    const interval = setInterval(autoAbsentUnplacedPresences, 60000);
    return () => clearInterval(interval);
  }, []);
}
