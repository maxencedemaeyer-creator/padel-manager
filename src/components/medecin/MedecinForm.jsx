import { useState } from 'react'
import Field, { inputClass } from '../ui/Field.jsx'
import Button from '../ui/Button.jsx'

const today = () => new Date().toISOString().slice(0, 10)

export default function MedecinForm({ types, onSubmit, onAjouterType, onCancel }) {
  const [type, setType] = useState(types[0] || '')
  const [nouveauType, setNouveauType] = useState('')
  const [modeNouveauType, setModeNouveauType] = useState(false)
  const [date, setDate] = useState(today())
  const [montantPaye, setMontantPaye] = useState('')
  const [montantMutuelle, setMontantMutuelle] = useState('')
  const [saving, setSaving] = useState(false)

  function annulerNouveauType() {
    setModeNouveauType(false)
    setType(types[0] || '')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const typeFinal = modeNouveauType ? nouveauType.trim() : type
    if (!typeFinal || !date || !montantPaye) return
    setSaving(true)
    try {
      if (modeNouveauType) {
        await onAjouterType(typeFinal)
      }
      await onSubmit({
        type: typeFinal,
        date,
        montantPaye,
        montantMutuelle: montantMutuelle || 0,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field label="Type de soin">
        {!modeNouveauType ? (
          <select
            className={inputClass}
            value={type}
            onChange={(e) => {
              if (e.target.value === '__nouveau__') {
                setModeNouveauType(true)
                setNouveauType('')
              } else {
                setType(e.target.value)
              }
            }}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value="__nouveau__">+ Ajouter un nouveau type…</option>
          </select>
        ) : (
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={nouveauType}
              onChange={(e) => setNouveauType(e.target.value)}
              placeholder="Ex. Dermatologue"
              autoFocus
              required
            />
            <Button type="button" variant="secondary" onClick={annulerNouveauType}>
              Annuler
            </Button>
          </div>
        )}
      </Field>
      <Field label="Date">
        <input
          type="date"
          className={inputClass}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Montant payé (€)">
          <input
            type="number"
            step="0.01"
            min="0"
            className={inputClass}
            value={montantPaye}
            onChange={(e) => setMontantPaye(e.target.value)}
            placeholder="45"
            required
          />
        </Field>
        <Field label="Remboursement mutuelle (€)">
          <input
            type="number"
            step="0.01"
            min="0"
            className={inputClass}
            value={montantMutuelle}
            onChange={(e) => setMontantMutuelle(e.target.value)}
            placeholder="30"
          />
        </Field>
      </div>
      <div className="flex gap-3 mt-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving ? 'Ajout…' : 'Ajouter le soin'}
        </Button>
      </div>
    </form>
  )
}
