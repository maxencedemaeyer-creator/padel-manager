import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase/config.js'
import { useFirestoreCollection } from './useFirestoreCollection.js'
import { usePin } from '../context/PinContext.jsx'

const CONFIG_REF = 'config/medecin'
const ENTRIES_COLLECTION = 'medecinEntries'

export const TYPES_SOINS_PAR_DEFAUT = [
  'Médecin généraliste',
  'Kiné',
  'Ostéo',
  'Dentiste',
  'Psychologue',
]

// Types de soins : les 5 par défaut + ceux que Max a ajoutés (stockés dans config/medecin).
export function useMedecinTypes() {
  const { authReady } = usePin()
  const [typesPersonnalises, setTypesPersonnalises] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authReady) return
    const ref = doc(db, CONFIG_REF)
    const unsubscribe = onSnapshot(ref, (snap) => {
      setTypesPersonnalises(snap.exists() ? snap.data().typesPersonnalises || [] : [])
      setLoading(false)
    })
    return unsubscribe
  }, [authReady])

  async function ajouterType(nouveauType) {
    const nom = nouveauType.trim()
    if (!nom) return
    const dejaPresent = [...TYPES_SOINS_PAR_DEFAUT, ...typesPersonnalises].some(
      (t) => t.toLowerCase() === nom.toLowerCase()
    )
    if (dejaPresent) return
    await setDoc(
      doc(db, CONFIG_REF),
      { typesPersonnalises: [...typesPersonnalises, nom], updatedAt: serverTimestamp() },
      { merge: true }
    )
  }

  const types = [...TYPES_SOINS_PAR_DEFAUT, ...typesPersonnalises]

  return { types, typesPersonnalises, loading, ajouterType }
}

// Soins reçus : une entrée par soin (comme les cours), pas d'agrégation mensuelle en base.
export function useMedecinEntries() {
  const { data, loading, error } = useFirestoreCollection(ENTRIES_COLLECTION, 'date', 'desc')

  async function addSoin({ type, date, montantPaye, montantMutuelle }) {
    await addDoc(collection(db, ENTRIES_COLLECTION), {
      type,
      date: Timestamp.fromDate(new Date(date)),
      montantPaye: Number(montantPaye),
      montantMutuelle: Number(montantMutuelle) || 0,
      paye: false,
      createdAt: serverTimestamp(),
    })
  }

  // "paye" ici veut dire "remboursé par la mutuelle" (le soin lui-même est déjà payé à la création).
  async function togglePaye(id, currentPaye) {
    await updateDoc(doc(db, ENTRIES_COLLECTION, id), { paye: !currentPaye })
  }

  async function removeSoin(id) {
    await deleteDoc(doc(db, ENTRIES_COLLECTION, id))
  }

  return { entries: data, loading, error, addSoin, togglePaye, removeSoin }
}
