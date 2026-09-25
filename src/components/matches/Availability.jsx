// ─────────────────────────────────────────────────────────────────────────
// Présences pour les matchs "Reste de la saison" : les 3 boutons Présent /
// Absent / Je ne sais pas encore, remplacés une fois qu'on a répondu par un
// rectangle plein (angles droits, couleur pleine, sans contour) affichant
// clairement la réponse du joueur — cliquable pour rouvrir une petite
// fenêtre de changement de réponse, tant que le match n'a pas commencé ET
// (si le joueur est présent/réserve) qu'on n'est pas entré dans le gel avant
// match (voir isLocked dans AvailabilityButtons, qui combine ces deux
// verrous : passé l'un ou l'autre, le rectangle devient un simple affichage,
// non cliquable, avec une petite explication — jamais pour l'admin, qui
// garde toujours la main via ManagePresenceModal) — accompagné de 3
// mini-compteurs (pastille de couleur + chiffre) poussés à droite, avec
// pop-up listant les joueurs par statut. Côté admin : le panneau "qui a
// répondu" à côté de la date (aperçu, non cliquable), ainsi qu'une modale
// "Gérer les présences" permettant à l'admin de modifier sa propre présence
// ou celle de n'importe quel autre joueur (même s'il n'a pas encore répondu,
// et même après le match), avec possibilité de réinitialiser une réponse.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { cn, formatDateFR, formatTimeFR, clubNameOnly, getFirstName } from "../../lib/utils";
import { useNow, getMatchTiming } from "../../lib/matchLogic";
import {
  AVAILABILITY_STATUSES,
  RESERVE_STATUS,
  getAvailabilityGroups,
  setSessionAvailability,
  resetSessionAvailability,
  autoPlacePresentPlayer,
  isPresenceFrozen,
  getFreeSlotCount,
} from "../../lib/availability";
import {
  getConvocationOverride,
  getAutoOpenDate,
  isConvocationOpen,
} from "../../lib/convocation";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal } from "../ui";

const STATUS_META = {
  present: { label: "Présent", dot: "bg-emerald-500" },
  absent: { label: "Absent", dot: "bg-rose-500" },
  unknown: { label: "Je ne sais pas encore", dot: "bg-amber-500" },
  // Statut admin uniquement (voir ManagePresenceModal) — un joueur mis
  // volontairement en réserve par l'admin, même si la session n'est pas
  // complète. Violet pour rester bien distinct des 3 statuts que le joueur
  // choisit lui-même.
  [RESERVE_STATUS]: { label: "Présent (réserve)", dot: "bg-violet-500" },
};

// En-têtes de colonne teintés (fond + texte + icône) utilisés dans le
// mini-tableau "Réponses des joueurs" — une colonne par statut, très
// compacte, plus lisible qu'un simple point de couleur.
const STATUS_COLUMN_CLASS = {
  present: "bg-emerald-50 text-emerald-800",
  absent: "bg-rose-50 text-rose-700",
  unknown: "bg-amber-50 text-amber-800",
};
const STATUS_PILL_ICON = {
  present: Icon.Check,
  absent: Icon.X,
  unknown: Icon.Question,
};

// Couleurs pleines (non pastel) utilisées pour le rectangle "ma réponse" —
// mêmes teintes -500 que les états actifs de ManagePresenceModal, pour
// rester cohérent avec le reste de l'app.
const STATUS_SOLID_CLASS = {
  present: "bg-emerald-500 text-white",
  absent: "bg-rose-500 text-white",
  unknown: "bg-amber-500 text-white",
  [RESERVE_STATUS]: "bg-violet-500 text-white",
};

// `reservePlayers` (optionnel, uniquement pour la liste "Présents") : les
// présents au-delà de la capacité de la session (voir getSessionCapacity /
// presentReserve dans lib/availability.js) — affichés à part, tout en bas de
// la liste, sous un sous-titre "Réserve", pour que tout le monde voie
// d'emblée qu'il y a plus de présents que de places, et qui est en attente
// d'un désistement.
//
// Juste sous le titre, un rappel date · heure · club de la session
// (`sessionInfo`) pour savoir d'un coup d'œil de quel match il s'agit.
function PlayerListModal({ title, players, reservePlayers, capacity, sessionInfo, onClose }) {
  const hasReserve = Boolean(reservePlayers && reservePlayers.length > 0);
  const isEmpty = players.length === 0 && !hasReserve;

  return (
    <Modal title={title} onClose={onClose}>
      {sessionInfo && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-50 border border-sky-200 text-sky-900">
          <Icon.Calendar className="w-4 h-4 shrink-0 text-sky-600" />
          <p className="text-xs font-semibold leading-snug min-w-0">
            {sessionInfo}
          </p>
        </div>
      )}
      {hasReserve && (
        <p className="text-xs text-[var(--color-text-dim)] mb-3">
          Cette session compte <strong>{capacity}</strong> place
          {capacity > 1 ? "s" : ""} — au-delà, les présents sont mis en
          réserve en cas de désistement.
        </p>
      )}
      {isEmpty ? (
        <p className="text-sm text-[var(--color-text-faint)] italic py-2">
          Personne pour l'instant.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {players.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[var(--color-surface-2)] text-sm font-medium"
            >
              <span>{p.emoji}</span>
              <span className="truncate">{p.name}</span>
            </div>
          ))}
          {hasReserve && (
            <>
              <p className="mt-2 mb-0.5 px-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                Réserve
              </p>
              {reservePlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-sm font-medium"
                >
                  <span>{p.emoji}</span>
                  <span className="truncate">{p.name}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

// Petite fenêtre ouverte en cliquant sur le rectangle "ma réponse" — permet
// de choisir directement un nouveau statut (Présent/Absent/Je ne sais pas)
// sans repasser par un état "non répondu" intermédiaire.
function ChangeMyResponseModal({ myStatus, saving, onChoose, onClose }) {
  const statusIcon = {
    present: Icon.Check,
    absent: Icon.X,
    unknown: Icon.Question,
  };

  return (
    <Modal title="Modifier ma présence" onClose={onClose}>
      <p className="text-xs text-[var(--color-text-dim)] mb-3">
        Réponse actuelle : <strong>{STATUS_META[myStatus]?.label || myStatus}</strong>
      </p>
      {myStatus === RESERVE_STATUS && (
        <p className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-2 mb-3">
          L'administrateur vous a placé en réserve pour cette session. Vous
          pouvez tout de même changer votre réponse ci-dessous.
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {AVAILABILITY_STATUSES.map((s) => {
          const StatusIcon = statusIcon[s];
          const active = myStatus === s;
          return (
            <button
              key={s}
              type="button"
              disabled={saving}
              onClick={() => onChoose(s)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-3 rounded-xl border transition-all disabled:opacity-50",
                active
                  ? cn(STATUS_SOLID_CLASS[s], "border-transparent")
                  : "bg-[var(--color-surface-2)] border-[var(--color-border)] hover:border-sky-300"
              )}
            >
              <StatusIcon className="w-4 h-4" />
              <span className="text-[11px] font-bold text-center leading-tight">
                {STATUS_META[s].label}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// Petite fenêtre de confirmation du bouton "Je prends la place" — affichée à
// un joueur en réserve (présent mais sans place) quand une place se libère
// dans la session (désistement). Prendre la place le fait passer titulaire :
// il sera compté comme participant du match (donc dans la compta), d'où la
// confirmation explicite plutôt qu'un placement automatique.
function ClaimSlotModal({ saving, onConfirm, onClose }) {
  return (
    <Modal title="Prendre la place libre" onClose={onClose}>
      <p className="text-sm text-[var(--color-text-dim)] mb-4 leading-snug">
        Une place s'est libérée pour cette session. En la prenant, vous quittez
        la réserve et passez <strong>titulaire</strong> : vous serez compté
        comme participant du match (et donc dans les frais du terrain).
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          className="py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] text-sm font-bold text-[var(--color-text-dim)] hover:border-slate-400 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onConfirm}
          className="py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {saving ? "Placement…" : "Confirmer"}
        </button>
      </div>
    </Modal>
  );
}

// Bouton/compteur RSVP pour le joueur connecté (admin ou non). Avant réponse :
// 3 boutons de choix. Après réponse : un rectangle plein affichant la
// réponse du joueur (cliquable → petite fenêtre de changement) + 3
// mini-compteurs cliquables ouvrant la liste des joueurs correspondants.
//
// Le changement de réponse écrit directement le nouveau statut dans
// Firestore via setSessionAvailability (et non plus un reset complet) : ça
// reste cohérent avec ManagePresenceModal, et — via setSessionAvailability —
// le joueur est aussi retiré de sa place sur le terrain s'il s'y était
// auto-inscrit lui-même (jamais une place attribuée par un admin, toujours
// conservée).
export function AvailabilityButtons({ sessionMatches }) {
  const { players, connectedPlayer, isAdmin, matches, presenceWindowDays, presenceLockHours } =
    useAppData();
  const now = useNow();
  const [saving, setSaving] = useState(false);
  const [openList, setOpenList] = useState(null); // "present" | "absent" | "pending" | null
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  // Convocation (voir lib/convocation.js) : tant qu'elle n'est pas ouverte
  // pour cette session (fenêtre automatique pas encore atteinte, ou
  // fermeture forcée par l'admin), un joueur qui n'a pas encore répondu ne
  // voit pas les 3 boutons — voir plus bas. L'admin, lui, garde toujours la
  // main sur sa propre réponse (il contrôle la convocation, il n'a pas à en
  // subir la fermeture) ; un joueur ayant déjà répondu garde sa réponse
  // modifiable quel que soit l'état de la convocation, mais seulement tant
  // que le match n'a pas commencé et, s'il est présent/réserve, tant qu'on
  // n'est pas entré dans le gel avant match — voir isLocked ci-dessous.
  const convocationOpen = isConvocationOpen(sessionMatches, now, presenceWindowDays);

  // Les comptes test (isTest) sont exclus des compteurs/listes Présent·Absent·
  // En attente pour tout le monde SAUF l'admin — même logique que l'écran de
  // connexion (AuthGate) et l'onglet Joueurs (PlayersView).
  const visiblePlayers = isAdmin ? players : players.filter((p) => !p.isTest);

  const {
    availability,
    present,
    presentTitulaires,
    presentReserve,
    capacity,
    absent,
    pending,
  } = getAvailabilityGroups(sessionMatches, visiblePlayers);
  const myStatus = availability[connectedPlayer.id];
  const hasAnswered = Boolean(myStatus);
  const isSelfPlaced = (sessionMatches || []).some((m) =>
    (m.participants || []).some(
      (p) => p.playerId === connectedPlayer.id && p.selfJoined === true
    )
  );

  // Verrouillage post-match (hors admin) : une fois le match commencé, un
  // joueur ne peut plus changer sa réponse — sinon il pourrait, par ex.,
  // basculer sur "absent" après avoir joué et se retirer ainsi de
  // `participants` (voir dropSelfJoinedSlot dans lib/availability.js), ce
  // qui fausserait la compta (qui se base sur les participants du match) et
  // les stats. Un match reporté "à une date inconnue" (statut "tbd") n'est
  // jamais verrouillé ici puisqu'on ne sait pas s'il a eu lieu.
  const sessionTiming = getMatchTiming(sessionMatches?.[0] || {}, now);
  const isPostMatchLocked =
    !isAdmin && (sessionTiming === "ongoing" || sessionTiming === "finished");

  // Gel de présence avant match (ajouté le 19/09/2026, voir constants.js →
  // DEFAULT_PRESENCE_LOCK_HOURS, réglable depuis Administration) : à moins de
  // `presenceLockHours` heures du match, un joueur déclaré "présent" ou
  // "réserve" (RESERVE_STATUS) ne peut plus revenir en arrière lui-même —
  // objectif : empêcher les désistements "faciles" de dernière minute qui
  // dissuadaient les joueurs de se déclarer présents dès qu'ils risquaient de
  // finir en réserve. Ne s'applique volontairement PAS à un joueur
  // absent/incertain qui changerait d'avis pour devenir présent — arriver
  // tardivement ne pose de problème à personne. L'admin garde, lui, un accès
  // total et immédiat via ManagePresenceModal, à tout moment.
  const isPreMatchFrozen =
    !isAdmin &&
    (myStatus === "present" || myStatus === RESERVE_STATUS) &&
    isPresenceFrozen(sessionMatches?.[0], now, presenceLockHours);

  const isLocked = isPostMatchLocked || isPreMatchFrozen;

  // Rappel "date · heure · club" affiché sous le titre des listes de joueurs
  // (Présents / Absents / En attente). Plusieurs clubs possibles si les
  // terrains de la session sont répartis sur plusieurs sites.
  const firstMatch = sessionMatches?.[0] || {};
  const sessionClubs = [
    ...new Set((sessionMatches || []).map((m) => clubNameOnly(m.location)).filter(Boolean)),
  ];
  const sessionInfo = [
    formatDateFR(firstMatch.date),
    formatTimeFR(firstMatch.time),
    sessionClubs.join(" / "),
  ]
    .filter(Boolean)
    .join(" · ");
  const lockMessage = isPostMatchLocked
    ? "Le match a commencé — votre présence n'est plus modifiable. Contactez l'administrateur si besoin."
    : isPreMatchFrozen
    ? `Trop proche du match (moins de ${presenceLockHours}h) pour changer seul votre présence — prévenez l'équipe sur WhatsApp, ou contactez l'administrateur.`
    : "";

  // Bouton "Je prends la place" (ajouté le 20/09/2026) : un joueur en réserve
  // "automatique" — déclaré présent ("present") mais sans place sur un terrain
  // parce que la session était complète — voit un bandeau dès qu'une place se
  // libère (désistement d'un titulaire), et peut la prendre lui-même.
  // Conditions, toutes requises :
  // - statut "present" uniquement : la réserve mise volontairement par
  //   l'admin (RESERVE_STATUS) reste une décision de l'admin, pas de bouton ;
  // - pas déjà placé sur un terrain de la session, ni engagé ailleurs le
  //   même jour (même garde que autoPlacePresentPlayer) ;
  // - au moins une place réellement libre dans la session ;
  // - match pas encore commencé ("upcoming") ; le gel de présence avant match
  //   ne s'applique volontairement pas ici : il empêche de se DÉSISTER tard,
  //   pas de combler une place libre à la dernière minute ;
  // - pas un joueur occasionnel (c'est l'admin qui gère sa présence).
  // Premier arrivé, premier servi : si deux joueurs cliquent en même temps
  // pour une seule place, la transaction de autoPlacePresentPlayer n'en
  // place qu'un — l'autre reçoit un message "place déjà prise".
  const firstSessionMatch = sessionMatches?.[0];
  const isPlacedInSession = (sessionMatches || []).some((m) =>
    (m.participants || []).some((p) => p.playerId === connectedPlayer.id)
  );
  const sessionIdSet = new Set((sessionMatches || []).map((m) => m.id));
  const isEngagedElsewhereToday =
    Boolean(firstSessionMatch) &&
    (matches || []).some(
      (m) =>
        !sessionIdSet.has(m.id) &&
        m.date === firstSessionMatch.date &&
        (m.participants || []).some((p) => p.playerId === connectedPlayer.id)
    );
  const canClaimSlot =
    myStatus === "present" &&
    !connectedPlayer.isOccasional &&
    sessionTiming === "upcoming" &&
    !isPlacedInSession &&
    !isEngagedElsewhereToday &&
    getFreeSlotCount(sessionMatches) > 0;

  const claimSlot = async () => {
    setSaving(true);
    try {
      const result = await autoPlacePresentPlayer(sessionMatches, matches, connectedPlayer);
      setShowClaimModal(false);
      if (result === "full") {
        alert("Trop tard : la place vient d'être prise par un autre joueur. Vous restez en réserve.");
      } else if (result === "elsewhere") {
        alert("Vous êtes déjà inscrit sur un autre match le même jour, impossible de prendre cette place.");
      } else if (result === "error") {
        alert("Impossible de vous placer pour l'instant. Réessayez dans un instant ou contactez l'administrateur.");
      }
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const respond = async (status) => {
    setSaving(true);
    try {
      await setSessionAvailability(sessionMatches, connectedPlayer.id, status);
      if (status === "present") {
        await autoPlacePresentPlayer(sessionMatches, matches, connectedPlayer);
      }
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const chooseNewStatus = async (status) => {
    if (status === myStatus) {
      setShowChangeModal(false);
      return;
    }
    if (
      status !== "present" &&
      isSelfPlaced &&
      !window.confirm(
        "Vous êtes actuellement placé sur le terrain — changer votre réponse vous en retirera. Continuer ?"
      )
    ) {
      return;
    }
    await respond(status);
    setShowChangeModal(false);
  };

  if (hasAnswered) {
    const myMeta = STATUS_META[myStatus];
    return (
      <div>
        <div className="flex items-stretch gap-2">
          {isLocked ? (
            <div
              title={lockMessage}
              className={cn(
                "flex-1 flex items-center justify-center px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide cursor-default",
                STATUS_SOLID_CLASS[myStatus]
              )}
            >
              {myMeta?.label || myStatus}
            </div>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => setShowChangeModal(true)}
              className={cn(
                "flex-1 flex items-center justify-center px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide active:scale-[0.98] transition-transform disabled:opacity-50",
                STATUS_SOLID_CLASS[myStatus]
              )}
            >
              {myMeta?.label || myStatus}
            </button>
          )}

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setOpenList("present")}
              className="flex flex-col items-center justify-center gap-0 px-2 py-1.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 hover:bg-emerald-200 transition-colors"
            >
              <span className="text-[11px] font-extrabold pm-mono leading-none">
                {present.length}
              </span>
              <span className="text-[7px] font-semibold uppercase tracking-wide leading-none mt-0.5">
                Prés.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setOpenList("absent")}
              className="flex flex-col items-center justify-center gap-0 px-2 py-1.5 rounded-lg bg-rose-100 border border-rose-300 text-rose-700 hover:bg-rose-200 transition-colors"
            >
              <span className="text-[11px] font-extrabold pm-mono leading-none">
                {absent.length}
              </span>
              <span className="text-[7px] font-semibold uppercase tracking-wide leading-none mt-0.5">
                Abs.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setOpenList("pending")}
              className="flex flex-col items-center justify-center gap-0 px-2 py-1.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 transition-colors"
            >
              <span className="text-[11px] font-extrabold pm-mono leading-none">
                {pending.length}
              </span>
              <span className="text-[7px] font-semibold uppercase tracking-wide leading-none mt-0.5">
                Att.
              </span>
            </button>
          </div>
        </div>

        {canClaimSlot && (
          <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5">
            <p className="flex-1 text-xs font-semibold text-emerald-900 leading-snug">
              Une place est libre — vous êtes en réserve, elle est pour vous si
              vous êtes dispo !
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={() => setShowClaimModal(true)}
              className="shrink-0 px-3 py-2 rounded-lg bg-emerald-500 text-white text-xs font-extrabold uppercase tracking-wide hover:bg-emerald-600 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              Je prends la place
            </button>
          </div>
        )}

        {isLocked && (
          <p className="text-[10px] text-[var(--color-text-faint)] mt-1.5 leading-snug">
            {lockMessage}
          </p>
        )}

        {openList && (
          <PlayerListModal
            title={
              openList === "present"
                ? "Joueurs présents"
                : openList === "absent"
                ? "Joueurs absents"
                : "En attente de réponse"
            }
            players={
              openList === "present"
                ? presentTitulaires
                : openList === "absent"
                ? absent
                : pending
            }
            reservePlayers={openList === "present" ? presentReserve : undefined}
            capacity={capacity}
            sessionInfo={sessionInfo}
            onClose={() => setOpenList(null)}
          />
        )}

        {showClaimModal && canClaimSlot && (
          <ClaimSlotModal
            saving={saving}
            onConfirm={claimSlot}
            onClose={() => setShowClaimModal(false)}
          />
        )}

        {showChangeModal && !isLocked && (
          <ChangeMyResponseModal
            myStatus={myStatus}
            saving={saving}
            onChoose={chooseNewStatus}
            onClose={() => setShowChangeModal(false)}
          />
        )}
      </div>
    );
  }

  // Joueur occasionnel pas encore "activé" pour CETTE session (aucune
  // réponse — présent/absent/incertain — n'a jamais été donnée pour lui) :
  // pas de boutons, c'est l'admin qui répond à sa place (voir
  // ManagePresenceModal). Dès que l'admin répond une fois pour lui sur
  // cette session, `hasAnswered` devient vrai et il retrouve exactement le
  // même bloc (rectangle + compteurs, cliquable) que n'importe quel joueur —
  // rien d'autre à faire ici.
  if (connectedPlayer.isOccasional) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3 text-center">
        <p className="text-[11px] font-semibold text-[var(--color-text-dim)]">
          En tant que joueur occasionnel, c'est l'administrateur qui indique
          votre présence pour ce match.
        </p>
      </div>
    );
  }

  // Convocation pas encore ouverte pour cette session (voir
  // lib/convocation.js) : pas de boutons pour un joueur qui n'a pas encore
  // répondu — seul l'admin garde la main (via "Gérer les présences") pour
  // répondre à sa place si besoin avant l'ouverture.
  if (!isAdmin && !convocationOpen) {
    const forcedClosed = getConvocationOverride(sessionMatches) === "closed";
    const autoOpenDate = forcedClosed
      ? null
      : getAutoOpenDate(sessionMatches, presenceWindowDays);
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3 text-center">
        <Icon.Calendar className="w-4 h-4 mx-auto mb-1 text-[var(--color-text-faint)]" />
        <p className="text-[11px] font-semibold text-[var(--color-text-dim)]">
          {forcedClosed || !autoOpenDate
            ? "La convocation pour ce match n'est pas encore ouverte."
            : `La convocation ouvrira automatiquement le ${formatDateFR(autoOpenDate)}.`}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <button
        type="button"
        disabled={saving}
        onClick={() => respond("present")}
        className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 hover:bg-emerald-200 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        <Icon.Check className="w-4 h-4" />
        <span className="text-[11px] font-bold">Présent</span>
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => respond("absent")}
        className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-rose-100 border border-rose-300 text-rose-700 hover:bg-rose-200 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        <Icon.X className="w-4 h-4" />
        <span className="text-[11px] font-bold">Absent</span>
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => respond("unknown")}
        className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        <Icon.Question className="w-4 h-4" />
        <span className="text-[11px] font-bold text-center leading-tight">Je ne sais pas</span>
      </button>
    </div>
  );
}

// Panneau admin "qui a répondu" — mini-tableau (non cliquable) à 3 colonnes
// Présents / Incertains / Absents, chaque en-tête teinté avec sa petite
// icône de statut (✓ / ? / ✕), pour rester lisible d'un coup d'œil tout en
// restant très compact. Le nom d'un joueur déjà placé sur une place de
// terrain (voir CourtPanel → PickPlayerModal) est mis en gras, pour repérer
// immédiatement qui, parmi les présents, reste encore à placer. Le
// placement lui-même se fait uniquement en touchant une place.
const RESPONSE_COLUMNS = [
  { key: "present", label: "Présents" },
  { key: "unknown", label: "Incertains" },
  { key: "absent", label: "Absents" },
];

export function RespondedPlayersPanel({ sessionMatches }) {
  const { players } = useAppData();
  const { responded } = getAvailabilityGroups(sessionMatches, players);

  if (responded.length === 0) {
    return (
      <p className="text-xs text-[var(--color-text-faint)] italic mb-3">
        Aucune réponse de présence pour l'instant.
      </p>
    );
  }

  // Joueurs déjà assignés à une place sur l'un des terrains de la session
  // (peu importe le terrain ou l'équipe) — pour les distinguer en gras.
  const placedPlayerIds = new Set();
  (sessionMatches || []).forEach((m) => {
    (m.participants || []).forEach((p) => placedPlayerIds.add(p.playerId));
  });

  // Un tableau par colonne de statut, joueurs triés alphabétiquement dans
  // chacune. Le statut admin "reserve" (voir RESERVE_STATUS) rejoint la
  // colonne Présents — on garde juste un marqueur `isReserve` pour l'afficher
  // en violet, distinct des présents "normaux".
  const byStatus = { present: [], unknown: [], absent: [] };
  responded
    .slice()
    .sort((a, b) => a.player.name.localeCompare(b.player.name))
    .forEach(({ player, status }) => {
      const isReserve = status === RESERVE_STATUS;
      const column = isReserve ? "present" : status;
      (byStatus[column] || byStatus.unknown).push({ player, isReserve });
    });

  return (
    <div className="mb-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
        Réponses des joueurs
      </p>
      <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              {RESPONSE_COLUMNS.map(({ key, label }) => {
                const StatusIcon = STATUS_PILL_ICON[key];
                return (
                  <th
                    key={key}
                    className={cn(
                      "w-1/3 px-1.5 py-1 text-left border-b border-[var(--color-border)]",
                      STATUS_COLUMN_CLASS[key]
                    )}
                  >
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
                      <StatusIcon className="w-3 h-3 shrink-0" />
                      <span className="truncate">{label}</span>
                      <span className="font-normal normal-case opacity-70 shrink-0">
                        {byStatus[key].length}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              {RESPONSE_COLUMNS.map(({ key }, i) => (
                <td
                  key={key}
                  className={cn(
                    "w-1/3 align-top px-1.5 py-1.5",
                    i < RESPONSE_COLUMNS.length - 1 && "border-r border-[var(--color-border)]"
                  )}
                >
                  {byStatus[key].length === 0 ? (
                    <span className="text-[10px] text-[var(--color-text-faint)] italic">—</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {byStatus[key].map(({ player, isReserve }) => {
                        const isPlaced = placedPlayerIds.has(player.id);
                        return (
                          <span
                            key={player.id}
                            title={
                              isReserve
                                ? "Mis en réserve par l'admin"
                                : isPlaced
                                ? "Déjà placé sur le terrain"
                                : undefined
                            }
                            className={cn(
                              "text-xs truncate",
                              isReserve
                                ? "font-semibold text-violet-700"
                                : isPlaced
                                ? "font-bold"
                                : "font-normal"
                            )}
                          >
                            {getFirstName(player.name)}
                            {isReserve && " (rés.)"}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Boutons de statut proposés à l'admin dans ManagePresenceModal — les 3
// statuts normaux (AVAILABILITY_STATUSES) plus, en 4e position, le statut
// "reserve" admin uniquement (voir RESERVE_STATUS dans lib/availability.js) :
// marque le joueur présent mais volontairement mis en réserve, même si la
// session n'est pas complète. Jamais proposé au joueur lui-même — ni dans
// AvailabilityButtons, ni dans ChangeMyResponseModal, qui utilisent tous les
// deux AVAILABILITY_STATUSES directement.
const ADMIN_STATUS_BUTTONS = [...AVAILABILITY_STATUSES, RESERVE_STATUS];

// Modale admin "Gérer les présences" — TOUS les joueurs du club pour cette
// session (qu'ils aient déjà répondu ou non), chacun avec ses 3 boutons
// Présent / Absent / Je ne sais pas encore, un 4e bouton "Réserve" (présent
// mais volontairement non placé, voir ADMIN_STATUS_BUTTONS ci-dessus), plus
// un 5e bouton pour réinitialiser sa réponse. Permet à l'administrateur de
// modifier sa propre présence ou celle de n'importe quel autre joueur.
export function ManagePresenceModal({ sessionMatches, onClose }) {
  const { players, matches } = useAppData();
  const [savingId, setSavingId] = useState(null);

  const { availability } = getAvailabilityGroups(sessionMatches, players);

  const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));

  // Le placement automatique (autoPlacePresentPlayer) ne se déclenche que
  // pour le statut "present" — jamais pour "reserve" : c'est précisément ce
  // qui permet à l'admin de mettre quelqu'un en réserve alors qu'il reste
  // des places libres, sans qu'il se retrouve auto-placé dans la foulée.
  const setStatus = async (playerId, status) => {
    setSavingId(playerId);
    try {
      await setSessionAvailability(sessionMatches, playerId, status);
      if (status === "present") {
        const player = players.find((p) => p.id === playerId);
        if (player) await autoPlacePresentPlayer(sessionMatches, matches, player);
      }
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSavingId(null);
    }
  };

  // Réinitialise la réponse d'un joueur — il redevient "en attente" et devra
  // rechoisir lui-même (utile si un joueur s'est trompé de bouton).
  const resetStatus = async (playerId) => {
    setSavingId(playerId);
    try {
      await resetSessionAvailability(sessionMatches, playerId);
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSavingId(null);
    }
  };

  const statusIcon = {
    present: Icon.Check,
    absent: Icon.X,
    unknown: Icon.Question,
    [RESERVE_STATUS]: Icon.Users,
  };
  const statusActiveClass = {
    present: "bg-emerald-500 border-emerald-500 text-white",
    absent: "bg-rose-500 border-rose-500 text-white",
    unknown: "bg-amber-500 border-amber-500 text-white",
    [RESERVE_STATUS]: "bg-violet-500 border-violet-500 text-white",
  };

  return (
    <Modal title="Gérer les présences" onClose={onClose}>
      <p className="text-xs text-[var(--color-text-dim)] mb-3">
        Modifiez la présence de n'importe quel joueur pour cette date — y
        compris la vôtre. Le bouton{" "}
        <Icon.Users className="inline w-3 h-3 -mt-0.5" /> met un joueur
        présent volontairement en réserve, même si la session n'est pas
        encore complète.
      </p>

      <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pm-scroll-visible pr-1">
        {sortedPlayers.length === 0 ? (
          <p className="text-xs text-[var(--color-text-faint)] italic py-2">
            Aucun joueur.
          </p>
        ) : (
          sortedPlayers.map((p) => {
            const status = availability[p.id];
            const busy = savingId === p.id;
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 p-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]"
              >
                <span className="flex-1 min-w-0 truncate text-sm font-medium flex items-center gap-1.5">
                  <span className="truncate">
                    {p.emoji} {p.name}
                  </span>
                  {p.isOccasional && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-orange-700 bg-orange-100 border border-orange-200 rounded-full px-1.5 py-0.5">
                      Occasionnel
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {ADMIN_STATUS_BUTTONS.map((s) => {
                    const StatusIcon = statusIcon[s];
                    const active = status === s;
                    const label =
                      s === RESERVE_STATUS
                        ? "Mettre en réserve (présent, sans place)"
                        : STATUS_META[s].label;
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={busy}
                        onClick={() => setStatus(p.id, s)}
                        aria-label={label}
                        title={label}
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center border transition-all disabled:opacity-40",
                          s === RESERVE_STATUS && "ml-1",
                          active
                            ? statusActiveClass[s]
                            : "bg-white border-[var(--color-border)] text-[var(--color-text-faint)] hover:border-sky-300"
                        )}
                      >
                        <StatusIcon className="w-3.5 h-3.5" />
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    disabled={busy || !status}
                    onClick={() => resetStatus(p.id)}
                    aria-label="Réinitialiser sa réponse"
                    title="Réinitialiser — il devra rechoisir lui-même"
                    className="w-8 h-8 ml-1 rounded-full flex items-center justify-center border border-[var(--color-border)] bg-white text-[var(--color-text-faint)] hover:border-slate-400 hover:text-slate-600 disabled:opacity-30 transition-all"
                  >
                    <Icon.Refresh className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
