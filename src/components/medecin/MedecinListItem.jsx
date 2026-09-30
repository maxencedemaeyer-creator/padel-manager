import { Trash2, Check } from 'lucide-react'
import { formatDate, formatEuros } from '../../utils/format.js'

export default function MedecinListItem({ soin, onTogglePaye, onDelete }) {
  const coutReel = soin.montantPaye - soin.montantMutuelle

  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900 truncate">{soin.type}</p>
        <p className="text-xs text-slate-500">
          {formatDate(soin.date)} · payé {formatEuros(soin.montantPaye)}
          {soin.montantMutuelle > 0 && ` · mutuelle ${formatEuros(soin.montantMutuelle)}`}
        </p>
      </div>
      <p className="font-semibold text-slate-900 tabular-nums">{formatEuros(coutReel)}</p>
      <button
        onClick={() => onTogglePaye(soin.id, soin.paye)}
        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
          soin.paye
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-red-50 text-red-600 hover:bg-red-100'
        }`}
      >
        <Check size={14} />
        {soin.paye ? 'Remboursé' : 'Non remboursé'}
      </button>
      <button
        onClick={() => onDelete(soin.id)}
        className="p-1.5 text-slate-300 hover:text-red-500"
        aria-label="Supprimer"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}
