// ─────────────────────────────────────────────────────────────────────────
// Game Center — Jeu "MOTUS" (SUTOM version padel) : LOGIQUE + STOCKAGE.
// L'interface vit dans src/components/games/MotusGame.jsx, les mots dans
// src/lib/motusLexique.js.
//
// Différence voulue avec SUTOM (demande de Max, 15/11/2026) : pas de "mot
// du jour". Chaque joueur enchaîne autant de parties qu'il veut, chacune
// avec un mot tiré au hasard (sans répétition tant que tout le lexique n'a
// pas été joué), et TOUTES les parties comptent dans ses statistiques.
//
// STOCKAGE : jamais en local, toujours Firebase. Un document par joueur,
// "games/motus_<playerId>" (collection "games" déjà autorisée par
// firestore.rules → aucune règle à modifier). Contenu :
// - partie       : partie en cours ou dernière partie terminée
//                  { mot, essais, termine, gagne, debut, fin }
//                  → recharger la page / changer d'appareil reprend la grille
// - stats        : { jouees, gagnees, serieActuelle, meilleureSerie,
//                    distribution[6], defaites, lettresVertes,
//                    lettresJaunes, lettresBleues }
// - parametres   : réglages du joueur (mode, clavier, thème…)
// - motsJoues    : mots déjà sortis pour ce joueur (pioche sans répétition)
// - vuRegles     : fenêtre "Comment jouer" déjà vue
// Coût Firebase : 1 lecture à l'ouverture du jeu, 1 écriture par essai
// validé (max 6 par partie) — négligeable face aux quotas gratuits.
// ─────────────────────────────────────────────────────────────────────────
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { MOTUS_LEXIQUE } from "./motusLexique";

export const MOTUS_ESSAIS_MAX = 6;
export const MOTUS_LONGUEUR_MIN = 5;
export const MOTUS_LONGUEUR_MAX = 12;

// ── LEXIQUE : filtrage automatique (5–12 lettres, A–Z, sans doublon) ─────
export const LEXIQUE_VALIDE = (() => {
  const vus = new Set();
  const ok = [];
  for (const entree of MOTUS_LEXIQUE) {
    const mot = entree.mot;
    const valide =
      typeof mot === "string" &&
      /^[A-Z]+$/.test(mot) &&
      mot.length >= MOTUS_LONGUEUR_MIN &&
      mot.length <= MOTUS_LONGUEUR_MAX;
    if (!valide) {
      console.warn(`[MOTUS] Mot ignoré (5–12 lettres A–Z sans accent) : "${mot}"`);
      continue;
    }
    if (vus.has(mot)) {
      console.warn(`[MOTUS] Mot en double ignoré : "${mot}"`);
      continue;
    }
    vus.add(mot);
    ok.push(entree);
  }
  return ok;
})();

const INDEX_LEXIQUE = new Map(LEXIQUE_VALIDE.map((e) => [e.mot, e]));

export function entreeLexique(mot) {
  return INDEX_LEXIQUE.get(mot) || null;
}

// ── LOGIQUE ──────────────────────────────────────────────────────────────

// Évaluation d'une proposition (gestion correcte des lettres doubles) :
// 1er passage = lettres bien placées, 2e passage = lettres mal placées dans
// la limite des occurrences restantes. Renvoie un tableau de
// "bien" | "mal" | "absent".
export function evaluer(proposition, solution) {
  const n = solution.length;
  const resultat = Array(n).fill("absent");
  const restantes = {};
  for (let i = 0; i < n; i++) {
    if (proposition[i] === solution[i]) resultat[i] = "bien";
    else restantes[solution[i]] = (restantes[solution[i]] || 0) + 1;
  }
  for (let i = 0; i < n; i++) {
    if (resultat[i] === "bien") continue;
    const l = proposition[i];
    if (restantes[l] > 0) {
      resultat[i] = "mal";
      restantes[l]--;
    }
  }
  return resultat;
}

// DICTIONNAIRE de validation (16/11/2026, demande de Max) : un mot qui
// n'existe pas est refusé à la validation (bandeau "pas dans le
// dictionnaire", aucun essai consommé). Référence = dictionnaire français
// classique (liste libre "an-array-of-french-words", licence MIT : ~260 000
// formes, conjugaisons et pluriels compris, sans accents) + tous les mots
// du lexique padel (VIBORA, BANDEJA…). Fichiers statiques découpés par
// 1re lettre et longueur dans public/motus-dico/ (ex. "A12.txt") : on ne
// télécharge que le petit fichier utile au mot en cours, servi par Vercel —
// aucune lecture Firebase.
const dictionnaires = new Map();

export function chargerDictionnaire(premiereLettre, longueur) {
  const cle = `${premiereLettre}${longueur}`;
  if (!dictionnaires.has(cle)) {
    const promesse = fetch(`/motus-dico/${cle}.txt`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((texte) => new Set(texte.split("\n").filter(Boolean)))
      .catch((e) => {
        dictionnaires.delete(cle); // on retentera au prochain essai
        throw e;
      });
    dictionnaires.set(cle, promesse);
  }
  return dictionnaires.get(cle);
}

// Une proposition est-elle acceptée ? Bonne longueur, bonne 1re lettre et
// mot existant (dictionnaire ou lexique padel). Si le dictionnaire n'a pas
// pu être chargé (pas de réseau), on n'empêche pas de jouer.
export async function propositionValide(proposition, solution) {
  if (proposition.length !== solution.length) return { ok: false, raison: "Mot trop court" };
  if (proposition[0] !== solution[0]) return { ok: false, raison: "Mauvaise première lettre" };
  if (INDEX_LEXIQUE.has(proposition)) return { ok: true };
  try {
    const dico = await chargerDictionnaire(solution[0], solution.length);
    if (!dico.has(proposition))
      return { ok: false, raison: "Ce mot n'est pas dans le dictionnaire" };
  } catch {
    // dictionnaire indisponible : proposition acceptée
  }
  return { ok: true };
}

// Tire un mot au hasard parmi ceux que le joueur n'a pas encore eus ;
// repart de zéro quand tout le lexique y est passé. Renvoie aussi la
// nouvelle liste des mots joués.
export function tirerMot(motsJoues = [], exclure = null) {
  const dejaJoues = new Set(motsJoues);
  let pool = LEXIQUE_VALIDE.filter((e) => !dejaJoues.has(e.mot));
  let liste = motsJoues;
  if (pool.length === 0) {
    pool = LEXIQUE_VALIDE.filter((e) => e.mot !== exclure);
    liste = [];
  }
  const choisi = pool[Math.floor(Math.random() * pool.length)].mot;
  return { mot: choisi, motsJoues: [...liste, choisi] };
}

// Lettres bien placées déjà connues (pour les pré-afficher sur la ligne en
// cours) : 1re lettre + lettres vertes des essais précédents.
export function lettresConnues(solution, essais) {
  const connues = Array(solution.length).fill(null);
  connues[0] = solution[0];
  for (const essai of essais) {
    const ev = evaluer(essai, solution);
    ev.forEach((etat, i) => {
      if (etat === "bien") connues[i] = solution[i];
    });
  }
  return connues;
}

// État des touches du clavier : priorité bien > mal > absent (une touche
// verte ne redevient jamais jaune).
export function etatClavier(solution, essais) {
  const rang = { absent: 1, mal: 2, bien: 3 };
  const etats = {};
  for (const essai of essais) {
    const ev = evaluer(essai, solution);
    ev.forEach((etat, i) => {
      const l = essai[i];
      if (!etats[l] || rang[etat] > rang[etats[l]]) etats[l] = etat;
    });
  }
  return etats;
}

export const STATS_VIDES = {
  jouees: 0,
  gagnees: 0,
  serieActuelle: 0,
  meilleureSerie: 0,
  distribution: [0, 0, 0, 0, 0, 0],
  defaites: 0,
  lettresVertes: 0,
  lettresJaunes: 0,
  lettresBleues: 0,
};

export const PARAMETRES_DEFAUT = {
  volume: "coupe", // coupe | faible | normal
  clavier: "azerty", // azerty | qwerty
  theme: "sombre", // sombre | clair
  haptique: true,
  afficherTemps: true,
  daltonien: false,
};

// Nouvelles statistiques après une partie terminée (toutes les parties
// comptent : il n'y a pas de "mode entraînement" à part).
export function statsApresPartie(stats, partie) {
  const s = {
    ...STATS_VIDES,
    ...stats,
    distribution: [...(stats?.distribution || STATS_VIDES.distribution)],
  };
  s.jouees += 1;
  if (partie.gagne) {
    s.gagnees += 1;
    s.distribution[partie.essais.length - 1] += 1;
    s.serieActuelle += 1;
    s.meilleureSerie = Math.max(s.meilleureSerie, s.serieActuelle);
  } else {
    s.defaites += 1;
    s.serieActuelle = 0;
  }
  for (const essai of partie.essais) {
    for (const etat of evaluer(essai, partie.mot)) {
      if (etat === "bien") s.lettresVertes += 1;
      else if (etat === "mal") s.lettresJaunes += 1;
      else s.lettresBleues += 1;
    }
  }
  return s;
}

// Moyenne de coups sur les parties gagnées (format français "4,33").
export function moyenneCoups(stats) {
  if (!stats?.gagnees) return "–";
  const total = stats.distribution.reduce((acc, nb, i) => acc + nb * (i + 1), 0);
  return (total / stats.gagnees).toFixed(2).replace(".", ",");
}

// Texte de partage d'une partie (ne contient JAMAIS le mot).
export function textePartagePartie(partie, numero, { daltonien, afficherTemps } = {}) {
  const emoji = daltonien
    ? { bien: "🟠", mal: "🔵", absent: "🟦" }
    : { bien: "🟢", mal: "🟡", absent: "🟦" };
  const score = partie.gagne ? `${partie.essais.length}/6` : "X/6";
  let entete = `🎾 MOTUS #${numero} ${score}`;
  if (afficherTemps && partie.debut && partie.fin)
    entete += ` ⏱️ ${formaterDuree(partie.fin - partie.debut)}`;
  const lignes = partie.essais.map((essai) =>
    evaluer(essai, partie.mot)
      .map((e) => emoji[e])
      .join("")
  );
  return [entete, ...lignes].join("\n");
}

export function textePartageStats(stats) {
  const pct = stats.jouees ? Math.round((stats.gagnees / stats.jouees) * 100) : 0;
  const max = Math.max(1, ...stats.distribution, stats.defaites);
  const barre = (nb) => "🟩".repeat(Math.round((nb / max) * 8)) || "▫️";
  const lignes = stats.distribution.map((nb, i) => `${i + 1} ${barre(nb)} ${nb}`);
  lignes.push(`- ${barre(stats.defaites)} ${stats.defaites}`);
  return [
    "🎾 MOTUS — mes stats",
    `Parties : ${stats.jouees} · Victoires : ${pct} %`,
    `Moyenne : ${moyenneCoups(stats)} coups · Meilleure série : ${stats.meilleureSerie}`,
    ...lignes,
  ].join("\n");
}

export function formaterDuree(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

// ── STOCKAGE (Firebase) ──────────────────────────────────────────────────

function motusRef(playerId) {
  return doc(db, "games", `motus_${playerId}`);
}

export async function chargerMotus(playerId) {
  const snap = await getDoc(motusRef(playerId));
  const data = snap.exists() ? snap.data() : {};
  return {
    partie: data.partie || null,
    stats: { ...STATS_VIDES, ...(data.stats || {}) },
    parametres: { ...PARAMETRES_DEFAUT, ...(data.parametres || {}) },
    motsJoues: Array.isArray(data.motsJoues) ? data.motsJoues : [],
    vuRegles: !!data.vuRegles,
  };
}

// Enregistre uniquement les champs fournis (merge) — une seule écriture.
export async function enregistrerMotus(playerId, champs) {
  await setDoc(motusRef(playerId), { ...champs, updatedAt: serverTimestamp() }, { merge: true });
}
