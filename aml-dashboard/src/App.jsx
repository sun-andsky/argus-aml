import { useState } from 'react'
import AlertQueue from './components/AlertQueue'
import CaseDetail from './components/CaseDetail'
import GraphExplorer from './components/GraphExplorer'
import MyCases from './components/MyCases'
import SARReports from './components/SARReports'

const NAV_ITEMS = [
  { key: 'queue', label: 'Alerts' },
  { key: 'graph', label: 'Investigation Graph' },
  { key: 'cases', label: 'My Cases' },
  { key: 'reports', label: 'SAR Reports' },
]

export default function App() {
  const [active, setActive] = useState('queue')
  const [selectedCaseId, setSelectedCaseId] = useState(null)

  function openCase(id) {
    setSelectedCaseId(id)
    setActive('queue')
  }

  function backToQueue() {
    setSelectedCaseId(null)
  }

  return (
    <div className="min-h-screen bg-paper">

      {/* ── Top nav ─────────────────────────────────────────── */}
      <header className="border-b border-line bg-surface/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1440px] mx-auto px-8 flex items-center justify-between h-[76px]">

          <div className="flex items-center gap-10">
            {/* Logo — reserved slot for the real ARGUS mark */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-navy/15 border border-navy/25 flex items-center justify-center overflow-hidden shrink-0">
                <img src="/logo.png" alt="ARGUS Logo" className="w-8 h-8 object-contain" />
              </div>
              <div>
                <p className="font-display font-semibold text-lg text-ink leading-none tracking-tight">
                  ARGUS
                </p>
                <p className="text-[10px] font-sans text-ink-faint mt-1 tracking-[0.12em] uppercase">
                  Anti Money Laundering System
                </p>
              </div>
            </div>

            <nav className="flex items-center gap-1 bg-surface-raised/50 border border-line rounded-xl p-1">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    setActive(item.key)
                    setSelectedCaseId(null)
                  }}
                  className={`text-sm font-sans font-medium px-4 py-2 rounded-lg transition-all duration-200 ease-smooth ${
                    active === item.key
                      ? 'text-navy-soft bg-navy/15 border border-navy/25 shadow-sm'
                      : 'text-ink-soft hover:text-ink hover:bg-surface-hover border border-transparent'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 border border-line rounded-full transition-colors duration-200 ease-smooth hover:border-line-strong">
              <span className="w-1.5 h-1.5 rounded-full bg-tier-low animate-pulse" />
              <span className="text-xs font-mono text-ink-soft">Session Active</span>
            </div>
            <div className="w-9 h-9 rounded-full bg-surface-raised border border-line flex items-center justify-center text-xs font-sans font-semibold text-ink-soft transition-colors duration-200 ease-smooth hover:border-line-strong hover:text-ink cursor-pointer">
              EM
            </div>
          </div>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────── */}
      <main className="max-w-[1440px] mx-auto">
        {active === 'queue' && selectedCaseId === null && (
          <AlertQueue onOpenCase={openCase} />
        )}
        {active === 'queue' && selectedCaseId !== null && (
          <CaseDetail caseId={selectedCaseId} onBack={backToQueue} />
        )}
        {active === 'cases' && <MyCases onOpenCase={openCase} />}
        {active === 'graph' && <GraphExplorer />}
        {active === 'reports' && <SARReports />}
      </main>
    </div>
  )
}
