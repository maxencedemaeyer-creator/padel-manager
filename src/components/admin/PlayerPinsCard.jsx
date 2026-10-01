// ─────────────────────────────────────────────────────────────────────────
// Volet "Codes PIN" du centre Administration (replié par défaut).
// Permet à l'administrateur de retrouver le code PIN d'un joueur qui l'a
// oublié ou changé. Les codes restent stockés dans la collection verrouillée
// player_credentials : ils ne sont lus qu'à l'ouverture du volet, via la
// fonction serveur api/manage-pin.js (action "list") qui revérifie que
// l'utilisateur est bien administrateur. Chaque code est masqué par défaut
// (●●●●) et s'affiche seulement en appuyant sur l'œil.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { useAppData } from "../../context/AppContext";
import { Card, Button } from "../ui";
import Icon from "../icons/Icon";

export function PlayerPinsCard({ players }) {
  const { sessionToken } = useAppData();
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState({});
  const [search, setSearch] = useState("");
  const [resetting, setResetting] = useState(null); // id du joueur en cours de réinitialisation
  const [justReset, setJustReset] = useState({}); // joueurs dont le code vient d'être réinitialisé

  const callPinApi = async (payload) => {
    const response = await fetch("/api/manage-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, actingToken: sessionToken }),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Erreur serveur.");
    return data;
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/manage-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list", actingToken: sessionToken }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Impossible de charger les codes.");
      setCodes(data.codes || {});
    } catch (e) {
      setError(e.message || "Impossible de charger les codes.");
    } finally {
      setLoading(false);
    }
  };

  // Chargement unique à la première ouverture ; à la fermeture on efface
  // tout (codes + yeux ouverts) pour ne rien laisser affiché.
  useEffect(() => {
    if (open && codes === null && !loading) load();
    if (!open) {
      setCodes(null);
      setRevealed({});
      setSearch("");
      setError("");
      setJustReset({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (players || [])
      .filter((p) => !q || (p.name || "").toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [players, search]);

  const toggle = (id) => setRevealed((prev) => ({ ...prev, [id]: !prev[id] }));

  // Réinitialisation : le serveur tire un nouveau code libre (jamais déjà
  // utilisé par un autre joueur), puis l'enregistre pour ce joueur. L'ancien
  // code cesse de fonctionner immédiatement. Le nouveau est affiché dans la
  // ligne pour pouvoir l'envoyer ensuite par WhatsApp.
  const resetPin = async (player) => {
    const ok = window.confirm(
      `Générer un nouveau code PIN pour ${player.name} ?\nL'ancien code ne fonctionnera plus.`
    );
    if (!ok) return;
    setResetting(player.id);
    setError("");
    try {
      const { code } = await callPinApi({ action: "generate", excludePlayerId: player.id });
      await callPinApi({ action: "set", playerId: player.id, accessCode: code });
      setCodes((prev) => ({ ...(prev || {}), [player.id]: code }));
      setRevealed((prev) => ({ ...prev, [player.id]: true }));
      setJustReset((prev) => ({ ...prev, [player.id]: true }));
    } catch (e) {
      alert("Réinitialisation impossible : " + (e.message || "erreur"));
    } finally {
      setResetting(null);
    }
  };

  // Ouvre WhatsApp avec le message déjà rédigé (lien wa.me). Aucun numéro
  // n'est stocké dans l'app : l'admin choisit le contact dans WhatsApp, puis
  // appuie sur "Envoyer". Le texte ne dit jamais que l'admin peut voir les
  // codes : après une réinitialisation, il parle d'un "nouveau code".
  const sendOnWhatsApp = (player, code) => {
    const firstName = (player.name || "").trim().split(" ")[0];
    const intro = justReset[player.id]
      ? `Voici un nouveau code PIN pour Padel Manager : ${code}`
      : `Voici ton code PIN pour Padel Manager : ${code}`;
    const text =
      `Salut ${firstName} ! 👋\n` +
      `${intro}\n` +
      `N'hésite pas à le changer toi-même dans l'onglet « Mon profil ».\n` +
      `Connexion : ${window.location.origin}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <Card className="p-4 sm:p-5 mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 text-left"
        aria-expanded={open}
      >
        <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-amber-100 text-amber-700">
          <Icon.Key className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-sm">Codes PIN des joueurs</span>
          <span className="block text-[11px] text-[var(--color-text-dim)] mt-0.5">
            Retrouver un code oublié — réservé à l'administrateur
          </span>
        </span>
        <Icon.Chevron
          className={cn(
            "w-4 h-4 text-[var(--color-text-faint)] transition-transform shrink-0",
            open && "rotate-90"
          )}
        />
      </button>

      {open && (
        <div className="mt-4">
          {loading && <p className="text-xs text-[var(--color-text-dim)]">Chargement…</p>}

          {error && (
            <div className="text-xs">
              <p className="text-red-600 mb-2">{error}</p>
              <Button variant="secondary" onClick={load}>
                Réessayer
              </Button>
            </div>
          )}

          {codes && (
            <>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un joueur…"
                className="w-full mb-3 px-3 py-2 rounded-xl border border-black/10 text-sm bg-white"
              />
              <ul className="divide-y divide-black/5">
                {rows.map((p) => {
                  const code = codes[p.id];
                  const shown = !!revealed[p.id];
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-2 py-2.5">
                      <span className="flex-1 min-w-[7rem] text-sm font-medium truncate">{p.name}</span>
                      <span className="font-mono text-base tracking-widest tabular-nums w-16 text-right">
                        {code ? (shown ? code : "••••") : "—"}
                      </span>
                      {code && (
                        <button
                          type="button"
                          onClick={() => toggle(p.id)}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-full bg-black/5 active:scale-95 transition"
                        >
                          {shown ? "Masquer" : "Afficher"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => resetPin(p)}
                        disabled={resetting === p.id}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-full bg-amber-100 text-amber-800 active:scale-95 transition disabled:opacity-50"
                        title="Générer un nouveau code PIN"
                      >
                        {resetting === p.id ? "…" : "Réinitialiser"}
                      </button>
                      {code && (
                        <button
                          type="button"
                          onClick={() => sendOnWhatsApp(p, code)}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-full bg-green-100 text-green-700 active:scale-95 transition"
                          title="Envoyer le code par WhatsApp"
                        >
                          WhatsApp
                        </button>
                      )}
                    </li>
                  );
                })}
                {rows.length === 0 && (
                  <li className="py-3 text-xs text-[var(--color-text-dim)]">Aucun joueur trouvé.</li>
                )}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
