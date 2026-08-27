// ─────────────────────────────────────────────────────────────────────────
// Authentification — sélection joueur + clavier PIN tactile + création du
// premier compte admin + le Provider racine (AuthGate).
// ─────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, SESSION_KEY, ADMIN_MASTER_CODE } from "../../firebase";
import { cn, isPlayerAdmin } from "../../lib/utils";
import { AVATAR_COLOR_CHOICES } from "../../lib/constants";
import { usePlayers } from "../../hooks/useFirestoreData";
import { AppDataContext } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Field, Button, Spinner, inputClass } from "../ui";

export function PlayerTile({ player, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-lime)]/60 active:scale-[0.97] transition-all"
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
        style={{ backgroundColor: player.avatarColor || AVATAR_COLOR_CHOICES[0] }}
      >
        {player.emoji || "🎾"}
      </div>
      <span className="text-xs font-semibold text-center leading-tight">
        {player.name}
      </span>
    </button>
  );
}

export function PinKeypad({ player, players, onBack, onSuccess }) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState(false);

  const press = (d) => {
    if (digits.length >= 4 || error) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === 4) {
      setTimeout(() => {
        if (next === player.accessCode) {
          onSuccess(player);
          return;
        }
        // Code PIN secondaire : connecte discrètement sur un autre profil
        // (ex. un compte test), sans qu'aucune nouvelle carte n'apparaisse
        // jamais sur cet écran de connexion.
        if (player.secondaryTestCode && next === player.secondaryTestCode) {
          const linked = players.find((p) => p.id === player.secondaryTestPlayerId);
          if (linked) {
            onSuccess(linked);
            return;
          }
        }
        setError(true);
        setTimeout(() => {
          setError(false);
          setDigits("");
        }, 550);
      }, 120);
    }
  };
  const backspace = () => setDigits((d) => d.slice(0, -1));

  return (
    <div className="flex flex-col items-center pm-rise">
      <button
        onClick={onBack}
        className="self-start flex items-center gap-1 text-sm text-white mb-4"
      >
        <Icon.Chevron className="w-4 h-4 rotate-180" /> Retour
      </button>

      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-3"
        style={{ backgroundColor: player.avatarColor || AVATAR_COLOR_CHOICES[0] }}
      >
        {player.emoji || "🎾"}
      </div>
      <p className="pm-display font-bold text-lg mb-1">{player.name}</p>
      <p className="text-xs text-white mb-6">
        Entrez votre code à 4 chiffres
      </p>

      <div
        className={cn(
          "flex gap-4 mb-8",
          error && "pm-shake"
        )}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "w-4 h-4 rounded-full border-2 transition-colors",
              error
                ? "border-[var(--color-danger)] bg-[var(--color-danger)]"
                : i < digits.length
                ? "border-[var(--color-lime)] bg-[var(--color-lime)]"
                : "border-[var(--color-border)] bg-transparent"
            )}
          />
        ))}
      </div>
      {error && (
        <p className="text-[var(--color-danger)] text-xs font-semibold -mt-5 mb-5">
          Code incorrect, réessayez
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            className="pm-mono aspect-square rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] text-xl font-bold hover:border-[var(--color-lime)]/50 active:scale-95 transition-all"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          onClick={() => press("0")}
          className="pm-mono aspect-square rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] text-xl font-bold hover:border-[var(--color-lime)]/50 active:scale-95 transition-all"
        >
          0
        </button>
        <button
          onClick={backspace}
          className="aspect-square rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-dim)] active:scale-95 transition-all"
        >
          <Icon.Backspace className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export function BootstrapAdmin() {
  const [name, setName] = useState("Maxence");
  const [code, setCode] = useState(ADMIN_MASTER_CODE);
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim() || code.length !== 4) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "players"), {
        name: name.trim(),
        email: "",
        accessCode: code,
        isAdmin: true,
        isCreditor: true,
        creditBalance: 0,
        level: "Pas de niveau",
        levelSortValue: 0,
        emoji: "🎾",
        dominantHand: "Droitier",
        preferredSide: "Polyvalent",
        federation: "Aucune",
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-sm pm-rise">
      <div className="w-14 h-14 rounded-2xl bg-[var(--color-lime)]/15 border border-[var(--color-lime)]/40 flex items-center justify-center mb-4 text-[var(--color-lime)]">
        <Icon.Shield className="w-7 h-7" />
      </div>
      <h2 className="pm-display font-bold text-2xl mb-1">Bienvenue 👋</h2>
      <p className="text-sm text-[var(--color-text-dim)] mb-6">
        Aucun joueur n'existe encore. Créez le premier compte, administrateur
        du club, pour démarrer.
      </p>
      <Field label="Nom de l'administrateur">
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. Maxence"
        />
      </Field>
      <Field label="Code PIN (4 chiffres)">
        <input
          className={cn(inputClass, "pm-mono tracking-[0.3em] text-center")}
          value={code}
          maxLength={4}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
        />
      </Field>
      <Button
        className="w-full mt-2"
        onClick={create}
        disabled={saving || !name.trim() || code.length !== 4}
      >
        {saving ? "Création..." : "Créer le compte administrateur"}
      </Button>
    </div>
  );
}

// Bandeau "Padel Manager" affiché en haut de l'écran de sélection du profil
// (avant connexion) — même style que l'en-tête de l'app une fois connecté,
// mais sans la pastille joueur ni le bouton de déconnexion (inexistants
// tant que personne n'est identifié). Sert uniquement la cohérence visuelle.
function AuthBrandHeader() {
  return (
    <header className="sticky top-0 z-30 flex items-center px-5 py-4 bg-[var(--color-nav)]/90 backdrop-blur-md border-b border-[var(--color-border)]">
      <div className="flex items-center gap-2">
        <Icon.Ball className="w-5 h-5 text-[var(--color-lime)]" />
        <span className="pm-display font-extrabold text-base">Padel Manager</span>
      </div>
    </header>
  );
}

export function AuthGate({ children }) {
  const { players: allPlayers, loading } = usePlayers();
  // Un joueur "supprimé" par l'admin n'est jamais vraiment effacé de Firebase :
  // il est simplement marqué `archived: true` (voir EditPlayerModal). On le
  // garde donc en mémoire (archivedPlayers, pour la suggestion de
  // réactivation dans "Ajouter un joueur") mais il disparaît de partout
  // ailleurs dans l'app — écran de connexion, onglet Équipe, assignation aux
  // matchs, etc. — puisque `players` (celui distribué à toute l'app via le
  // contexte) ne contient plus que les joueurs actifs.
  const players = useMemo(() => allPlayers.filter((p) => !p.archived), [allPlayers]);
  const archivedPlayers = useMemo(() => allPlayers.filter((p) => p.archived), [allPlayers]);
  const [connectedPlayer, setConnectedPlayer] = useState(null);
  const [selectedForPin, setSelectedForPin] = useState(null);
  const [restoring, setRestoring] = useState(true);

  // Restauration de session (localStorage)
  useEffect(() => {
    if (loading) return;
    try {
      const savedId = localStorage.getItem(SESSION_KEY);
      if (savedId) {
        const found = players.find((p) => p.id === savedId);
        if (found) setConnectedPlayer(found);
      }
    } catch (e) {
      // localStorage indisponible : on ignore silencieusement
    }
    setRestoring(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Garder le joueur connecté synchronisé avec les mises à jour temps réel —
  // et le déconnecter immédiatement si un admin vient de le supprimer.
  useEffect(() => {
    if (connectedPlayer) {
      const fresh = players.find((p) => p.id === connectedPlayer.id);
      if (!fresh) {
        logout();
        return;
      }
      if (JSON.stringify(fresh) !== JSON.stringify(connectedPlayer)) {
        setConnectedPlayer(fresh);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players]);

  const login = (player) => {
    setConnectedPlayer(player);
    try {
      localStorage.setItem(SESSION_KEY, player.id);
    } catch (e) {}
  };

  const logout = () => {
    setConnectedPlayer(null);
    setSelectedForPin(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  };

  if (loading || restoring) {
    return (
      <div className="pm-root flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  if (connectedPlayer) {
    return (
      <AppDataContext.Provider
        value={{
          connectedPlayer,
          isAdmin: isPlayerAdmin(connectedPlayer),
          logout,
          players,
          archivedPlayers,
        }}
      >
        {children}
      </AppDataContext.Provider>
    );
  }

  // Le bandeau "Padel Manager" n'apparaît que sur l'écran de sélection du
  // profil (clic sur son nom) — pas sur la création du 1er compte admin, ni
  // sur le clavier PIN, qui gardent leur mise en page centrée d'origine.
  const showBrandHeader = players.length > 0 && !selectedForPin;

  return (
    <div className="pm-root min-h-screen flex flex-col">
      {showBrandHeader && <AuthBrandHeader />}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        {players.length === 0 ? (
          <BootstrapAdmin />
        ) : selectedForPin ? (
          <PinKeypad
            player={selectedForPin}
            players={players}
            onBack={() => setSelectedForPin(null)}
            onSuccess={login}
          />
        ) : (
          <div className="w-full max-w-sm pm-rise">
            <p className="text-sm text-white mb-7">
              Sélectionnez votre profil pour vous connecter
            </p>
            <div className="grid grid-cols-3 gap-3">
              {players
                .filter((p) => !p.isTest)
                .map((p) => (
                  <PlayerTile key={p.id} player={p} onClick={() => setSelectedForPin(p)} />
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
