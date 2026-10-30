// ─────────────────────────────────────────────────────────────────────────
// Carte "Sauvegarde des données" du centre Administration (25/10/2026).
//
// Télécharge sur l'appareil de l'admin un fichier JSON contenant une copie
// complète des données de l'app : joueurs (archivés compris), matchs (avec
// tous les paiements et créanciers de chaque place), abonnements (avec les
// créances de départ), clubs et réglages globaux. Filet de sécurité à
// utiliser AVANT chaque mise à jour importante (chantier des rôles).
//
// Coût Firebase : ZÉRO lecture. Toutes ces données sont déjà chargées en
// mémoire par l'app (écoutes temps réel existantes) ; ce bouton se contente
// de les rassembler dans un fichier. Rien n'est écrit dans Firebase.
//
// Non inclus (volontairement) : les codes PIN et les confidences de "Liens
// entre joueurs", qui ne sont jamais lisibles depuis un navigateur ; les
// votes "Homme du match" et les données du Game Center (pas de compta).
//
// Le fichier contient aussi un petit "résumé compta" (total perçu par chaque
// créancier) : il permet de vérifier après une mise à jour que les soldes
// affichés sont restés identiques au centime.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useAppData } from "../../context/AppContext";
import { getCreditorAccounting, getAllCreditorPlayerIds } from "../../lib/stats";
import { Card, Button } from "../ui";
import Icon from "../icons/Icon";

function pad(n) {
  return String(n).padStart(2, "0");
}

export function BackupCard() {
  const {
    connectedPlayer,
    players,
    archivedPlayers,
    matches,
    abonnements,
    clubs,
    gameCenterEnabled,
    maintenanceEnabled,
    presenceWindowDays,
    rankingEnabled,
    presenceLockHours,
  } = useAppData();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");

  const download = () => {
    setError("");
    try {
      const allPlayers = [...(players || []), ...(archivedPlayers || [])];
      const creditorIds = getAllCreditorPlayerIds(allPlayers, abonnements || []);
      const resumeCompta = allPlayers
        .filter((p) => creditorIds.has(p.id))
        .map((p) => ({
          creancier: p.name,
          id: p.id,
          totalPercu: getCreditorAccounting(p.id, matches || [], allPlayers).totalPaidAllTime,
        }));

      const now = new Date();
      const backup = {
        app: "Padel Manager",
        exporteLe: now.toISOString(),
        exportePar: connectedPlayer?.name || null,
        compteurs: {
          joueurs: allPlayers.length,
          matchs: (matches || []).length,
          abonnements: (abonnements || []).length,
          clubs: (clubs || []).length,
        },
        resumeCompta,
        donnees: {
          players: allPlayers,
          matches: matches || [],
          abonnements: abonnements || [],
          clubs: clubs || [],
          settings: {
            appConfig: {
              gameCenterEnabled,
              maintenanceEnabled,
              presenceWindowDays,
              rankingEnabled,
              presenceLockHours,
            },
          },
        },
      };

      const fileName =
        "padel-manager-sauvegarde-" +
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
        `-${pad(now.getHours())}h${pad(now.getMinutes())}.json`;
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setDone({ fileName, ...backup.compteurs });
    } catch (e) {
      console.error(e);
      setError("La sauvegarde n'a pas pu être créée : " + e.message);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 text-left"
        aria-expanded={open}
      >
        <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-emerald-500/15 text-emerald-600">
          <Icon.Shield className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-sm">Sauvegarde des données</span>
          <span className="block text-[11px] text-[var(--color-text-dim)] mt-0.5">
            Télécharger une copie complète de l'app
          </span>
        </span>
        <Icon.Chevron
          className={
            "w-4 h-4 text-[var(--color-text-faint)] transition-transform shrink-0" +
            (open ? " rotate-90" : "")
          }
        />
      </button>
      {open && (
        <div className="mt-4">
      <p className="text-[11px] text-[var(--color-text-dim)]">
        Copie complète (joueurs, matchs, paiements, abonnements) dans un fichier, sur cet
        appareil. À faire avant chaque mise à jour importante.
      </p>
      <Button className="w-full mt-3" onClick={download}>
        Télécharger la sauvegarde
      </Button>
      {done && (
        <p className="text-[11px] text-emerald-700 mt-2">
          ✓ Sauvegarde créée : {done.joueurs} joueurs, {done.matchs} matchs, {done.abonnements}{" "}
          abonnements, {done.clubs} clubs. Fichier « {done.fileName} » à garder en lieu sûr (il
          contient les noms et emails des joueurs).
        </p>
      )}
      {error && <p className="text-[11px] text-rose-600 mt-2">{error}</p>}
        </div>
      )}
    </Card>
  );
}
