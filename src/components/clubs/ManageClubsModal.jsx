// ─────────────────────────────────────────────────────────────────────────
// Gestion des clubs (admin) — liste + ajout + édition (nom, adresse, logo).
// Les clubs sont ensuite sélectionnables depuis "Créer un abonnement"
// (voir CreateSeasonModal.jsx), qui peut aussi en créer un à la volée.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { collection, addDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { useAppData } from "../../context/AppContext";
import Icon from "../icons/Icon";
import { Modal, Field, Button, inputClass, EmptyState } from "../ui";

function ClubForm({ club, onSaved, onCancel }) {
  const [name, setName] = useState(club?.name || "");
  const [address, setAddress] = useState(club?.address || "");
  const [logoUrl, setLogoUrl] = useState(club?.logoUrl || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        address: address.trim() || null,
        logoUrl: logoUrl.trim() || null,
      };
      if (club) {
        await updateDoc(doc(db, "clubs", club.id), payload);
      } else {
        await addDoc(collection(db, "clubs"), { ...payload, createdAt: serverTimestamp() });
      }
      onSaved();
    } catch (error) {
      alert("Erreur Firestore : " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)] mb-3">
      <Field label="Nom du club">
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. Padel Club Bruxelles"
        />
      </Field>
      <Field label="Adresse (optionnel)">
        <input
          className={inputClass}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Ex. Rue du Padel 12, 1000 Bruxelles"
        />
      </Field>
      <Field label="Logo — URL (optionnel)">
        <input
          className={inputClass}
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://..."
        />
      </Field>
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" className="!py-2 !px-3" onClick={onCancel} disabled={saving}>
          Annuler
        </Button>
        <Button className="!py-2 !px-3" onClick={submit} disabled={saving || !name.trim()}>
          {saving ? "Enregistrement..." : club ? "Enregistrer" : "Ajouter le club"}
        </Button>
      </div>
    </div>
  );
}

export function ManageClubsModal({ onClose }) {
  const { clubs } = useAppData();
  const [editingClub, setEditingClub] = useState(null); // club | null
  const [showAddForm, setShowAddForm] = useState(false);
  const list = clubs || [];

  return (
    <Modal title="Gérer les clubs" onClose={onClose} wide>
      {!showAddForm && !editingClub && (
        <Button className="w-full mb-3" onClick={() => setShowAddForm(true)}>
          <span className="flex items-center justify-center gap-1.5">
            <Icon.Plus className="w-4 h-4" /> Ajouter un club
          </span>
        </Button>
      )}

      {showAddForm && (
        <ClubForm onSaved={() => setShowAddForm(false)} onCancel={() => setShowAddForm(false)} />
      )}

      {list.length === 0 && !showAddForm ? (
        <EmptyState
          icon={<Icon.Shield className="w-6 h-6" />}
          title="Aucun club enregistré"
          subtitle="Ajoutez un club pour pouvoir le choisir lors de la génération d'un abonnement."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((c) =>
            editingClub?.id === c.id ? (
              <ClubForm
                key={c.id}
                club={c}
                onSaved={() => setEditingClub(null)}
                onCancel={() => setEditingClub(null)}
              />
            ) : (
              <div
                key={c.id}
                className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)]"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate">{c.name}</span>
                  {c.address && (
                    <span className="block text-[11px] text-[var(--color-text-faint)] truncate">
                      {c.address}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingClub(c)}
                  className="p-1.5 -m-1.5 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-lime)] transition-colors"
                  title="Modifier ce club"
                >
                  <Icon.Settings className="w-4 h-4" />
                </button>
              </div>
            )
          )}
        </div>
      )}
    </Modal>
  );
}
