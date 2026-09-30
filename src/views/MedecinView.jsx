import { useMemo, useState } from 'react'
import { Plus, Stethoscope } from 'lucide-react'
import { useMedecinEntries, useMedecinTypes } from '../hooks/useMedecin.js'
import Card from '../components/ui/Card.jsx'
import Button from '../components/ui/Button.jsx'
import Modal from '../components/ui/Modal.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import MedecinForm from '../components/medecin/MedecinForm.jsx'
import MedecinListItem from '../components/medecin/MedecinListItem.jsx'
import { moisKeyFromDate } from '../utils/dates.js'
import { formatEuros, formatMoisLabel } from '../utils/format.js'

export default function MedecinView() {
  const { types, ajouterType } = useMedecinTypes()
  const { entries, loading, addSoin, togglePaye, removeSoin } = useMedecinEntries()
  const [modalOpen, setModalOpen] = useState(false)

  const groupes = useMemo(() => {
    const map = new Map()
    for (const s of entries) {
      const key = moisKeyFromDate(s.date)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(s)
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [entries])

  async function handleAdd(values) {
    await addSoin(values)
    setModalOpen(false)
  }

  function handleDelete(id) {
    if (confirm('Supprimer ce soin ?')) removeSoin(id)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Médecin</h1>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={16} />
          Ajouter
        </Button>
      </div>

      {!loading && entries.length === 0 && (
        <Card>
          <EmptyState
            icon={Stethoscope}
            title="Aucun soin enregistré"
            description="Ajoute un soin reçu (kiné, dentiste…) avec le bouton ci-dessus."
          />
        </Card>
      )}

      <div className="flex flex-col gap-5">
        {groupes.map(([moisKey, items]) => {
          const totalPaye = items.reduce((sum, s) => sum + s.montantPaye, 0)
          const totalMutuelle = items.reduce((sum, s) => sum + s.montantMutuelle, 0)
          const coutReel = totalPaye - totalMutuelle
          return (
            <Card key={moisKey}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-slate-800 capitalize">
                  {formatMoisLabel(moisKey)}
                </h3>
                <p className="text-sm text-slate-500">
                  Payé {formatEuros(totalPaye)} · Mutuelle {formatEuros(totalMutuelle)}
                </p>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                Coût réel total :{' '}
                <span className="font-semibold text-slate-800">{formatEuros(coutReel)}</span>
              </p>
              <div>
                {items.map((s) => (
                  <MedecinListItem
                    key={s.id}
                    soin={s}
                    onTogglePaye={togglePaye}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </Card>
          )
        })}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouveau soin">
        <MedecinForm
          types={types}
          onSubmit={handleAdd}
          onAjouterType={ajouterType}
          onCancel={() => setModalOpen(false)}
        />
      </Modal>
    </div>
  )
}
