// ─────────────────────────────────────────────────────────────────────────
// Game Center — Jeu "MOTUS" (SUTOM version padel) : INTERFACE.
// Plein écran par-dessus l'app (portail vers <body>). Logique et stockage
// Firebase dans src/lib/motus.js, mots dans src/lib/motusLexique.js.
//
// Règles : mot de padel de 5 à 12 lettres, 1re lettre donnée et imposée,
// 6 essais. Rond vert = bien placée, rond jaune = mal placée, fond bleu =
// absente. Parties illimitées (un nouveau mot à chaque fois), toutes
// comptées dans les statistiques du joueur, enregistrées sur Firebase.
// Sections : ÉTAT, LOGIQUE, RENDU, ÉVÉNEMENTS.
// ─────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppData } from "../../context/AppContext";
import { MOTUS_CATEGORIES } from "../../lib/motusLexique";
import {
  MOTUS_ESSAIS_MAX,
  PARAMETRES_DEFAUT,
  STATS_VIDES,
  chargerDictionnaire,
  chargerMotus,
  enregistrerMotus,
  entreeLexique,
  etatClavier,
  evaluer,
  formaterDuree,
  lettresConnues,
  moyenneCoups,
  propositionValide,
  statsApresPartie,
  textePartagePartie,
  textePartageStats,
  tirerMot,
} from "../../lib/motus";

const DUREE_LETTRE_MS = 250; // retournement d'une case
const ACCENT = "#d7f23c"; // jaune "balle" : titre et boutons, jamais dans la grille

const CLAVIERS = {
  azerty: ["AZERTYUIOP", "QSDFGHJKLM", "WXCVBN"],
  qwerty: ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"],
};

const THEMES = {
  sombre: {
    fond: "#0d2236",
    panneau: "#132f4c",
    texte: "#ffffff",
    texteDoux: "rgba(255,255,255,0.65)",
    case: "#1f5f99",
    bordure: "rgba(255,255,255,0.55)",
    touche: "#17375a",
    toucheTexte: "#ffffff",
    toucheContour: "rgba(255,255,255,0.85)",
    toucheSpeciale: "#3b5574",
  },
  clair: {
    fond: "#e8f0f8",
    panneau: "#ffffff",
    texte: "#0d2236",
    texteDoux: "rgba(13,34,54,0.65)",
    case: "#2a6db0",
    bordure: "rgba(255,255,255,0.85)",
    touche: "#ffffff",
    toucheTexte: "#0d2236",
    toucheContour: "rgba(13,34,54,0.55)",
    toucheSpeciale: "#c9d6e3",
  },
};

function couleurs(daltonien) {
  return daltonien
    ? { bien: "#f5793a", mal: "#85c0f9", texteBien: "#ffffff", texteMal: "#0d2236", coche: true }
    : { bien: "#1fa84a", mal: "#ffbd00", texteBien: "#ffffff", texteMal: "#1a1a1a", coche: false };
}

const LIBELLE_ETAT = { bien: "bien placée", mal: "mal placée", absent: "absente" };

// Petits sons façon Motus, générés à la volée (aucun fichier audio).
let audioCtx = null;
function bip(freq, dureeMs, volume) {
  if (!volume) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dureeMs / 1000);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dureeMs / 1000);
  } catch {
    // navigateur sans Web Audio : on joue sans le son
  }
}
const VOLUMES = { coupe: 0, faible: 0.04, normal: 0.12 };

function vibrer(actif, motif) {
  if (actif && typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(motif);
    } catch {
      /* ignoré */
    }
  }
}

function nouvellePartie(motsJoues, exclure) {
  const { mot, motsJoues: liste } = tirerMot(motsJoues, exclure);
  return {
    partie: { mot, essais: [], termine: false, gagne: false, debut: null, fin: null },
    motsJoues: liste,
  };
}

// ── Petits composants d'affichage ────────────────────────────────────────

function Case({ lettre, etat, taille, theme, coul, fantome, delai, anime }) {
  const rond = etat === "bien" || etat === "mal";
  const fondRond = etat === "bien" ? coul.bien : coul.mal;
  const couleurLettre = rond ? (etat === "bien" ? coul.texteBien : coul.texteMal) : "#ffffff";
  return (
    <div
      className={`relative flex items-center justify-center font-bold select-none ${anime ? "motus-flip" : ""}`}
      style={{
        width: taille,
        height: taille,
        background: theme.case,
        boxShadow: `inset 0 0 0 1px ${theme.bordure}`,
        fontSize: `calc(${taille} * 0.56)`,
        animationDelay: anime ? `${delai}ms` : undefined,
      }}
      aria-label={lettre ? `${lettre}${etat ? `, ${LIBELLE_ETAT[etat]}` : ""}` : "case vide"}
    >
      {rond && (
        <span
          className={`absolute rounded-full ${anime ? "motus-show" : ""}`}
          style={{
            inset: "6%",
            background: fondRond,
            animationDelay: anime ? `${delai + DUREE_LETTRE_MS}ms` : undefined,
          }}
        />
      )}
      <span
        className="relative leading-none"
        style={{
          color: fantome ? "rgba(255,255,255,0.45)" : couleurLettre,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        {lettre}
        {etat === "bien" && coul.coche ? (
          <span className="absolute -top-1 -right-2 text-[0.45em]">✓</span>
        ) : null}
      </span>
    </div>
  );
}

function Panneau({ titre, onClose, theme, children }) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center p-3 bg-black/60 motus-fade"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={titre}
        className="w-full max-w-md max-h-full overflow-y-auto rounded-2xl shadow-2xl"
        style={{ background: theme.panneau, color: theme.texte }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 flex items-center justify-between px-4 py-3 border-b"
          style={{ background: theme.panneau, borderColor: "rgba(127,127,127,0.25)" }}
        >
          <h3 className="font-bold text-lg">{titre}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-9 h-9 rounded-full flex items-center justify-center text-lg"
            style={{ background: "rgba(127,127,127,0.18)" }}
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-4 text-sm">{children}</div>
      </div>
    </div>
  );
}

function Choix({ label, valeur, options, onChange, theme }) {
  return (
    <div>
      <div className="text-xs font-semibold mb-1.5" style={{ color: theme.texteDoux }}>
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, texte]) => {
          const actif = v === valeur;
          return (
            <button
              key={String(v)}
              type="button"
              onClick={() => onChange(v)}
              aria-pressed={actif}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border"
              style={{
                background: actif ? ACCENT : "transparent",
                color: actif ? "#0d2236" : theme.texte,
                borderColor: actif ? ACCENT : "rgba(127,127,127,0.45)",
              }}
            >
              {texte}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BlocStats({ stats, coul, theme, essaisPartie }) {
  const max = Math.max(1, ...stats.distribution, stats.defaites);
  const lignes = [
    ...stats.distribution.map((nb, i) => ({ label: String(i + 1), nb, cle: i + 1 })),
    { label: "-", nb: stats.defaites, cle: "X" },
  ];
  const pct = stats.jouees ? Math.round((stats.gagnees / stats.jouees) * 100) : 0;
  const tuiles = [
    ["Victoires", `${stats.gagnees} /${stats.jouees}`],
    ["Réussite", `${pct} %`],
    ["Moyenne coups", moyenneCoups(stats)],
    ["Série en cours", stats.serieActuelle],
    ["Meilleure série", stats.meilleureSerie],
    ["Lettres 🟢", stats.lettresVertes],
    ["Lettres 🟡", stats.lettresJaunes],
    ["Lettres 🟦", stats.lettresBleues],
  ];
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {lignes.map((l) => {
          const duJour = essaisPartie === l.cle;
          return (
            <div key={l.label} className="flex items-center gap-2">
              <span className="w-3 text-right font-mono text-xs">{l.label}</span>
              <div className="flex-1">
                <div
                  className="h-5 rounded flex items-center justify-end px-1.5 text-xs font-bold text-white"
                  style={{
                    width: `${Math.max(8, (l.nb / max) * 100)}%`,
                    background: duJour ? coul.bien : theme.case,
                  }}
                >
                  {l.nb}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-xs" style={{ color: theme.texteDoux }}>
        Nombre total de parties jouées : <b style={{ color: theme.texte }}>{stats.jouees}</b>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {tuiles.map(([titre, valeur]) => (
          <div
            key={titre}
            className="rounded-lg p-1.5 text-center"
            style={{ background: "rgba(127,127,127,0.14)" }}
          >
            <div className="font-bold text-sm leading-tight">{valeur}</div>
            <div className="text-[10px] leading-tight mt-0.5" style={{ color: theme.texteDoux }}>
              {titre}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Composant principal ──────────────────────────────────────────────────

export function MotusGame({ onClose }) {
  const { connectedPlayer } = useAppData();
  const playerId = connectedPlayer?.id || null;

  // ── ÉTAT ──
  const [charge, setCharge] = useState(false);
  const [erreurChargement, setErreurChargement] = useState("");
  const [stats, setStats] = useState(STATS_VIDES);
  const [parametres, setParametres] = useState(PARAMETRES_DEFAUT);
  const [motsJoues, setMotsJoues] = useState([]);
  const [partie, setPartie] = useState(null);
  const [saisie, setSaisie] = useState("");
  const [revelation, setRevelation] = useState(null); // index de la ligne en cours de retournement
  const [secousse, setSecousse] = useState(false);
  const [verification, setVerification] = useState(false); // dictionnaire en cours de consultation
  const [message, setMessage] = useState("");
  const [panneau, setPanneau] = useState(null); // regles | stats | parametres | fin
  const [annonce, setAnnonce] = useState("");
  const [premiereVisite, setPremiereVisite] = useState(false);
  const minuteurs = useRef([]);
  const messageTimer = useRef(null);
  const premiereLettreSautee = useRef(false);

  const theme = THEMES[parametres.theme] || THEMES.sombre;
  const coul = couleurs(parametres.daltonien);
  const volume = VOLUMES[parametres.volume] ?? 0;

  useEffect(
    () => () => {
      minuteurs.current.forEach(clearTimeout);
      clearTimeout(messageTimer.current);
    },
    []
  );

  // Bloque le défilement de la page derrière le jeu.
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = avant;
    };
  }, []);

  // Chargement depuis Firebase (1 seule lecture).
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const data = playerId
          ? await chargerMotus(playerId)
          : { partie: null, stats: STATS_VIDES, parametres: PARAMETRES_DEFAUT, motsJoues: [], vuRegles: true };
        if (annule) return;
        setStats(data.stats);
        setParametres(data.parametres);
        let mots = data.motsJoues;
        let p = data.partie;
        if (!p || p.termine || !entreeLexique(p.mot)) {
          const n = nouvellePartie(mots, p?.mot);
          p = n.partie;
          mots = n.motsJoues;
        }
        setMotsJoues(mots);
        setPartie(p);
        setSaisie(p.mot[0]);
        if (!data.vuRegles) {
          setPremiereVisite(true);
          setPanneau("regles");
        }
        setCharge(true);
      } catch (e) {
        if (!annule) setErreurChargement(e?.message || "Impossible de charger le jeu.");
      }
    })();
    return () => {
      annule = true;
    };
  }, [playerId]);

  const sauver = useCallback(
    (champs) => {
      if (!playerId) return;
      enregistrerMotus(playerId, champs).catch(() => {
        afficherMessage("⚠️ Sauvegarde impossible (connexion ?)");
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playerId]
  );

  function afficherMessage(texte, duree = 1800) {
    setMessage(texte);
    clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setMessage(""), duree);
  }

  function changerParametre(cle, valeur) {
    const suivants = { ...parametres, [cle]: valeur };
    setParametres(suivants);
    sauver({ parametres: suivants });
  }

  // ── LOGIQUE ──
  const solution = partie?.mot || "";
  const n = solution.length;
  const entree = solution ? entreeLexique(solution) : null;
  const essaisAffiches = partie
    ? revelation != null
      ? partie.essais.slice(0, revelation)
      : partie.essais
    : [];
  const clavierEtats = useMemo(
    () => (partie ? etatClavier(solution, essaisAffiches) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [partie, revelation]
  );
  const connues = useMemo(
    () => (partie ? lettresConnues(solution, essaisAffiches) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [partie, revelation]
  );
  const enJeu =
    charge && partie && !partie.termine && revelation == null && !panneau && !verification;

  // Précharge le petit fichier du dictionnaire utile au mot en cours, pour
  // que la vérification soit instantanée au moment de valider.
  useEffect(() => {
    if (solution) chargerDictionnaire(solution[0], n).catch(() => {});
  }, [solution, n]);

  const taperLettre = useCallback(
    (l) => {
      if (!enJeu) return;
      // La 1re case est verrouillée : si le joueur commence par taper cette
      // lettre (réflexe naturel), on l'ignore au lieu de la doubler.
      setSaisie((s) => {
        if (s.length === 1 && l === solution[0] && !premiereLettreSautee.current) {
          premiereLettreSautee.current = true;
          return s;
        }
        premiereLettreSautee.current = true;
        return s.length < n ? s + l : s;
      });
      if (!partie.debut) setPartie((p) => ({ ...p, debut: Date.now() }));
    },
    [enJeu, n, partie, solution]
  );

  const effacer = useCallback(() => {
    if (!enJeu) return;
    setSaisie((s) => {
      if (s.length <= 2) premiereLettreSautee.current = false;
      return s.length > 1 ? s.slice(0, -1) : s;
    });
  }, [enJeu]);

  const refuser = useCallback(
    (raison) => {
      setSecousse(true);
      vibrer(parametres.haptique, 120);
      afficherMessage(raison, 2600);
      setAnnonce(raison);
      const t = setTimeout(() => setSecousse(false), 450);
      minuteurs.current.push(t);
    },
    [parametres.haptique]
  );

  const valider = useCallback(async () => {
    if (!enJeu) return;
    setVerification(true);
    const verdict = await propositionValide(saisie, solution);
    setVerification(false);
    if (!verdict.ok) {
      refuser(verdict.raison);
      return;
    }
    const ev = evaluer(saisie, solution);
    const essais = [...partie.essais, saisie];
    const gagne = ev.every((e) => e === "bien");
    const termine = gagne || essais.length >= MOTUS_ESSAIS_MAX;
    const maintenant = Date.now();
    const suivante = {
      ...partie,
      essais,
      gagne,
      termine,
      debut: partie.debut || maintenant,
      fin: termine ? maintenant : null,
    };
    const ligne = partie.essais.length;
    setPartie(suivante);
    setRevelation(ligne);
    setSaisie(solution[0]);
    premiereLettreSautee.current = false;

    // Sons lettre par lettre, au rythme du retournement.
    ev.forEach((etat, i) => {
      const t = setTimeout(
        () => bip(etat === "bien" ? 880 : etat === "mal" ? 660 : 392, 140, volume),
        i * DUREE_LETTRE_MS + DUREE_LETTRE_MS
      );
      minuteurs.current.push(t);
    });

    // Sauvegarde Firebase : 1 écriture par essai (+ stats en fin de partie).
    const champs = { partie: suivante };
    if (ligne === 0) champs.motsJoues = motsJoues;
    let nouvellesStats = null;
    if (termine) {
      nouvellesStats = statsApresPartie(stats, suivante);
      champs.stats = nouvellesStats;
    }
    sauver(champs);

    const finAnimation = n * DUREE_LETTRE_MS + 350;
    const t = setTimeout(() => {
      setRevelation(null);
      const nbBien = ev.filter((e) => e === "bien").length;
      const nbMal = ev.filter((e) => e === "mal").length;
      setAnnonce(
        `Essai ${essais.length} : ${saisie}. ${nbBien} bien placée${nbBien > 1 ? "s" : ""}, ${nbMal} mal placée${nbMal > 1 ? "s" : ""}.` +
          (termine ? (gagne ? " Gagné !" : ` Perdu, le mot était ${solution}.`) : "")
      );
      if (termine) {
        setStats(nouvellesStats);
        if (gagne) {
          vibrer(parametres.haptique, [60, 40, 60]);
          [523, 659, 784, 1047].forEach((f, i) => {
            const tt = setTimeout(() => bip(f, 220, volume), i * 130);
            minuteurs.current.push(tt);
          });
        } else {
          [330, 247].forEach((f, i) => {
            const tt = setTimeout(() => bip(f, 300, volume), i * 220);
            minuteurs.current.push(tt);
          });
        }
        const t2 = setTimeout(() => setPanneau("fin"), 600);
        minuteurs.current.push(t2);
      }
    }, finAnimation);
    minuteurs.current.push(t);
  }, [enJeu, saisie, solution, parametres, partie, refuser, volume, motsJoues, stats, sauver, n]);

  const rejouer = () => {
    const nv = nouvellePartie(motsJoues, solution);
    setMotsJoues(nv.motsJoues);
    setPartie(nv.partie);
    setSaisie(nv.partie.mot[0]);
    premiereLettreSautee.current = false;
    setPanneau(null);
    setAnnonce(`Nouvelle partie : mot de ${nv.partie.mot.length} lettres commençant par ${nv.partie.mot[0]}.`);
  };

  const fermerPanneau = () => {
    if (panneau === "regles" && premiereVisite) {
      setPremiereVisite(false);
      sauver({ vuRegles: true });
    }
    setPanneau(null);
  };

  const partager = async (texte) => {
    try {
      if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        await navigator.share({ text: texte });
        return;
      }
      await navigator.clipboard.writeText(texte);
      afficherMessage("Copié dans le presse-papiers !");
    } catch (e) {
      if (e?.name !== "AbortError") afficherMessage("Partage impossible");
    }
  };

  // ── ÉVÉNEMENTS : clavier physique ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (panneau) fermerPanneau();
        else onClose();
        return;
      }
      if (panneau) return;
      if (e.key === "Enter") {
        e.preventDefault();
        valider();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        effacer();
      } else if (e.key.length === 1) {
        const l = e.key
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toUpperCase();
        if (/^[A-Z]$/.test(l)) taperLettre(l);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panneau, valider, effacer, taperLettre, onClose]);

  // ── RENDU ──
  const tailleCase = n
    ? `min(3.1rem, calc((100vw - 1.25rem) / ${n} - 3px), calc((100dvh - 22rem) / 6 - 3px))`
    : "3rem";

  const lignesGrille = [];
  if (partie) {
    for (let r = 0; r < MOTUS_ESSAIS_MAX; r++) {
      const essai = partie.essais[r];
      const enCours = !partie.termine && r === partie.essais.length && revelation == null;
      const cases = [];
      for (let i = 0; i < n; i++) {
        if (essai) {
          const ev = evaluer(essai, solution);
          cases.push(
            <Case
              key={i}
              lettre={essai[i]}
              etat={ev[i]}
              taille={tailleCase}
              theme={theme}
              coul={coul}
              anime={revelation === r}
              delai={i * DUREE_LETTRE_MS}
            />
          );
        } else if (enCours) {
          const tapee = i < saisie.length ? saisie[i] : null;
          cases.push(
            <Case
              key={i}
              lettre={tapee || connues[i] || ""}
              fantome={!tapee && !!connues[i]}
              taille={tailleCase}
              theme={theme}
              coul={coul}
            />
          );
        } else {
          cases.push(<Case key={i} lettre="" taille={tailleCase} theme={theme} coul={coul} />);
        }
      }
      lignesGrille.push(
        <div
          key={r}
          className={`flex gap-[3px] justify-center ${enCours && secousse ? "motus-shake" : ""}`}
          aria-label={`Ligne ${r + 1}`}
        >
          {cases}
        </div>
      );
    }
  }

  const touche = (l) => {
    const etat = clavierEtats[l];
    let style = {
      background: theme.touche,
      color: theme.toucheTexte,
      boxShadow: `inset 0 0 0 1.5px ${theme.toucheContour}`,
    };
    if (etat === "bien") style = { background: coul.bien, color: coul.texteBien };
    else if (etat === "mal") style = { background: coul.mal, color: coul.texteMal };
    else if (etat === "absent")
      style = { background: theme.touche, color: theme.toucheTexte, opacity: 0.3 };
    return (
      <button
        key={l}
        type="button"
        onClick={() => taperLettre(l)}
        className="flex-1 max-w-[2.6rem] h-[3.1rem] rounded-md font-bold text-base active:scale-95 transition-transform"
        style={style}
        aria-label={`${l}${etat ? `, ${LIBELLE_ETAT[etat]}` : ""}`}
      >
        {l}
      </button>
    );
  };

  const toucheSpeciale = (contenu, onClick, label) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex-[1.5] max-w-[3.6rem] h-[3.1rem] rounded-md font-bold text-lg active:scale-95 transition-transform"
      style={{ background: theme.toucheSpeciale, color: theme.toucheTexte }}
    >
      {contenu}
    </button>
  );

  const rangees = CLAVIERS[parametres.clavier] || CLAVIERS.azerty;
  const boutonEntete =
    "w-9 h-9 rounded-full flex items-center justify-center text-base font-bold shrink-0";
  const fondBoutonEntete = { background: "rgba(127,127,127,0.2)", color: theme.texte };

  const contenu = (
    <div
      className="fixed inset-0 z-[70] flex flex-col"
      style={{
        background: theme.fond,
        color: theme.texte,
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <style>{`
        .motus-flip { animation: motus-flip 500ms ease both; }
        @keyframes motus-flip { 0% { transform: rotateX(0) } 50% { transform: rotateX(90deg) } 100% { transform: rotateX(0) } }
        .motus-show { animation: motus-show 1ms linear both; }
        @keyframes motus-show { from { opacity: 0 } to { opacity: 1 } }
        .motus-shake { animation: motus-shake 400ms ease; }
        @keyframes motus-shake { 0%,100% { transform: translateX(0) } 20%,60% { transform: translateX(-7px) } 40%,80% { transform: translateX(7px) } }
        .motus-fade { animation: motus-fade 180ms ease both; }
        @keyframes motus-fade { from { opacity: 0 } to { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .motus-flip, .motus-shake { animation: none; } }
      `}</style>

      {/* En-tête : règles, stats | titre | son, paramètres, fermer */}
      <header
        className="flex items-center gap-1.5 px-3 py-2 border-b"
        style={{ borderColor: "rgba(127,127,127,0.3)" }}
      >
        <button type="button" className={boutonEntete} style={fondBoutonEntete} onClick={() => setPanneau("regles")} aria-label="Comment jouer">
          ?
        </button>
        <button type="button" className={boutonEntete} style={fondBoutonEntete} onClick={() => setPanneau("stats")} aria-label="Statistiques">
          📊
        </button>
        <h2
          className="flex-1 min-w-0 text-center font-black text-xl tracking-[0.08em] whitespace-nowrap"
          style={{ color: ACCENT }}
        >
          🎾 MOTUS
        </h2>
        <button
          type="button"
          className={boutonEntete}
          style={fondBoutonEntete}
          onClick={() => changerParametre("volume", parametres.volume === "coupe" ? "normal" : "coupe")}
          aria-label={parametres.volume === "coupe" ? "Activer le son" : "Couper le son"}
        >
          {parametres.volume === "coupe" ? "🔇" : "🔊"}
        </button>
        <button type="button" className={boutonEntete} style={fondBoutonEntete} onClick={() => setPanneau("parametres")} aria-label="Paramètres">
          ⚙️
        </button>
        <button type="button" className={boutonEntete} style={fondBoutonEntete} onClick={onClose} aria-label="Quitter le jeu">
          ✕
        </button>
      </header>

      <div className="sr-only" aria-live="polite">
        {annonce}
      </div>

      {!charge ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          {erreurChargement ? (
            <div className="space-y-3">
              <div>⚠️ {erreurChargement}</div>
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-full font-bold" style={{ background: ACCENT, color: "#0d2236" }}>
                Fermer
              </button>
            </div>
          ) : (
            <div style={{ color: theme.texteDoux }}>Chargement…</div>
          )}
        </div>
      ) : (
        <>
          {/* Catégorie du mot + grille */}
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 px-2 py-2">
            {entree && (
              <div
                className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: "rgba(127,127,127,0.2)" }}
              >
                {MOTUS_CATEGORIES[entree.categorie]} · {n} lettres
              </div>
            )}
            <div className="relative flex flex-col gap-[3px]" role="grid" aria-label="Grille de jeu">
              {lignesGrille}
              {message && (
                <div
                  className="absolute z-10 left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+6px)] px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap shadow-lg motus-fade"
                  style={{ background: "#ffffff", color: "#0d2236" }}
                  role="status"
                >
                  {message}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 min-h-[2.5rem]">
              {partie.termine && (
                <>
                  <button type="button" onClick={rejouer} className="px-4 py-2 rounded-full text-sm font-bold" style={{ background: ACCENT, color: "#0d2236" }}>
                    Nouvelle partie
                  </button>
                  <button type="button" onClick={() => setPanneau("fin")} className="px-4 py-2 rounded-full text-sm font-semibold" style={{ background: "rgba(127,127,127,0.22)" }}>
                    Résultats
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Clavier virtuel */}
          <div className="px-1.5 pb-2 pt-1 space-y-1.5 w-full max-w-lg mx-auto">
            <div className="flex justify-center gap-1">{[...rangees[0]].map(touche)}</div>
            <div className="flex justify-center gap-1">{[...rangees[1]].map(touche)}</div>
            <div className="flex justify-center gap-1">
              {[...rangees[2]].map(touche)}
              {toucheSpeciale("⌫", effacer, "Effacer")}
              {toucheSpeciale("↲", valider, "Valider")}
            </div>
          </div>
        </>
      )}

      {/* ── Panneaux ── */}
      {panneau === "regles" && (
        <Panneau titre="Comment jouer" onClose={fermerPanneau} theme={theme}>
          <p>
            Trouve le <b>mot de padel</b> en <b>6 essais</b>. La première lettre est donnée et chaque
            proposition doit commencer par elle et être un mot qui existe (dictionnaire français ou
            vocabulaire du padel), sinon elle est refusée sans te coûter d'essai. Les mots font de 5 à 12 lettres, sans accents, et
            peuvent être des termes espagnols (VIBORA, BANDEJA…).
          </p>
          <p>Exemple : le mot à trouver est VIBORA, tu proposes VOLEAA :</p>
          <div className="flex gap-[3px] justify-center">
            {["VOLEAA"].flatMap((p) =>
              evaluer(p, "VIBORA").map((etat, i) => (
                <Case key={i} lettre={p[i]} etat={etat} taille="2.4rem" theme={theme} coul={coul} />
              ))
            )}
          </div>
          <ul className="space-y-1.5">
            <li>
              <span className="inline-block w-3 h-3 rounded-full align-middle mr-1.5" style={{ background: coul.bien }} />
              <b>V</b> et le dernier <b>A</b> sont bien placés.
            </li>
            <li>
              <span className="inline-block w-3 h-3 rounded-full align-middle mr-1.5" style={{ background: coul.mal }} />
              <b>O</b> est dans le mot, mais ailleurs.
            </li>
            <li>
              <span className="inline-block w-3 h-3 align-middle mr-1.5" style={{ background: theme.case }} />
              <b>L</b> et <b>E</b> ne sont pas dans le mot. Le 1er <b>A</b> reste bleu : VIBORA n'a qu'un seul A, déjà trouvé.
            </li>
          </ul>
          <p>
            Sous la grille, la catégorie du mot t'aide. À la fin, tu découvres la définition du mot. Joue autant de parties que tu veux :
            toutes comptent dans tes statistiques.
          </p>
          <button type="button" onClick={fermerPanneau} className="w-full py-2.5 rounded-full font-bold" style={{ background: ACCENT, color: "#0d2236" }}>
            C'est parti !
          </button>
        </Panneau>
      )}

      {panneau === "stats" && (
        <Panneau titre="Statistiques" onClose={fermerPanneau} theme={theme}>
          <BlocStats stats={stats} coul={coul} theme={theme} />
          <button type="button" onClick={() => partager(textePartageStats(stats))} className="w-full py-2.5 rounded-full font-bold" style={{ background: ACCENT, color: "#0d2236" }}>
            Partager mes stats
          </button>
        </Panneau>
      )}

      {panneau === "parametres" && (
        <Panneau titre="Paramètres" onClose={fermerPanneau} theme={theme}>
          <Choix label="Volume du son" valeur={parametres.volume} theme={theme} onChange={(v) => changerParametre("volume", v)} options={[["coupe", "Coupé"], ["faible", "Faible"], ["normal", "Normal"]]} />
          <Choix label="Disposition du clavier" valeur={parametres.clavier} theme={theme} onChange={(v) => changerParametre("clavier", v)} options={[["azerty", "AZERTY"], ["qwerty", "QWERTY"]]} />
          <Choix label="Thème" valeur={parametres.theme} theme={theme} onChange={(v) => changerParametre("theme", v)} options={[["sombre", "Sombre"], ["clair", "Clair"]]} />
          {typeof navigator !== "undefined" && navigator.vibrate && (
            <Choix label="Retour haptique" valeur={parametres.haptique} theme={theme} onChange={(v) => changerParametre("haptique", v)} options={[[true, "Oui"], [false, "Non"]]} />
          )}
          <Choix label="Afficher le temps dans le résumé" valeur={parametres.afficherTemps} theme={theme} onChange={(v) => changerParametre("afficherTemps", v)} options={[[true, "Oui"], [false, "Non"]]} />
          <Choix label="Mode daltonien (vert → orange, jaune → bleu clair, ✓)" valeur={parametres.daltonien} theme={theme} onChange={(v) => changerParametre("daltonien", v)} options={[[true, "Oui"], [false, "Non"]]} />
          <p className="text-[11px]" style={{ color: theme.texteDoux }}>
            Tes réglages et tes statistiques sont enregistrés sur ton profil : tu les retrouves sur
            tous tes appareils.
          </p>
        </Panneau>
      )}

      {panneau === "fin" && partie?.termine && (
        <Panneau titre={partie.gagne ? "Bravo, tu as gagné ! 🎉" : "Raté !"} onClose={fermerPanneau} theme={theme}>
          <div className="text-center space-y-2">
            {!partie.gagne && <div style={{ color: theme.texteDoux }}>Le mot était…</div>}
            <div className="font-black text-3xl tracking-[0.15em]" style={{ color: ACCENT }}>
              {solution}
            </div>
            {entree && (
              <>
                <div className="inline-block px-3 py-0.5 rounded-full text-xs font-semibold" style={{ background: "rgba(127,127,127,0.2)" }}>
                  {MOTUS_CATEGORIES[entree.categorie]}
                </div>
                <p className="leading-snug">{entree.definition}</p>
              </>
            )}
            {parametres.afficherTemps && partie.debut && partie.fin && (
              <div className="text-xs" style={{ color: theme.texteDoux }}>
                ⏱️ Temps : {formaterDuree(partie.fin - partie.debut)}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="font-bold">Résumé de la partie</div>
              <button type="button" onClick={() => partager(textePartagePartie(partie, stats.jouees, parametres))} className="text-xs font-bold underline" style={{ color: ACCENT }}>
                Partager
              </button>
            </div>
            <pre className="text-sm leading-tight p-2 rounded-lg whitespace-pre-wrap" style={{ background: "rgba(127,127,127,0.14)", fontFamily: "ui-monospace, monospace" }}>
              {textePartagePartie(partie, stats.jouees, parametres)}
            </pre>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="font-bold">Statistiques</div>
              <button type="button" onClick={() => partager(textePartageStats(stats))} className="text-xs font-bold underline" style={{ color: ACCENT }}>
                Partager
              </button>
            </div>
            <BlocStats stats={stats} coul={coul} theme={theme} essaisPartie={partie.gagne ? partie.essais.length : "X"} />
          </div>

          <button type="button" onClick={rejouer} className="w-full py-2.5 rounded-full font-bold" style={{ background: ACCENT, color: "#0d2236" }}>
            Nouvelle partie
          </button>
        </Panneau>
      )}
    </div>
  );

  return createPortal(contenu, document.body);
}

export default MotusGame;
