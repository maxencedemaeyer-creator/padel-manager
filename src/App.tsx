import { Routes, Route } from 'react-router-dom'
import { usePin } from './context/PinContext.jsx'
import PinLock from './components/PinLock.jsx'
import AppShell from './components/layout/AppShell.jsx'
import AccueilView from './views/AccueilView.jsx'
import CoursParticuliersView from './views/CoursParticuliersView.jsx'
import VeloView from './views/VeloView.jsx'
import EtudesView from './views/EtudesView.jsx'
import MedecinView from './views/MedecinView.jsx'

export default function App() {
  const { unlocked, authReady } = usePin()

  if (!unlocked) {
    return <PinLock />
  }

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Connexion à la base de données…
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<AccueilView />} />
        <Route path="/cours" element={<CoursParticuliersView />} />
        <Route path="/velo" element={<VeloView />} />
        <Route path="/etudes" element={<EtudesView />} />
        <Route path="/medecin" element={<MedecinView />} />
      </Route>
    </Routes>
  )
}
