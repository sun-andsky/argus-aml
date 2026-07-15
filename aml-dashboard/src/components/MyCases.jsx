import { useState, useEffect, useMemo } from 'react'
import TierDot from './TierDot'
import StatusBadge from './StatusBadge'
import NewCaseModal from './NewCaseModal'
import { fetchCases, fetchBatchScores } from '../lib/api'

function formatDateTime(iso) {
  const d = new Date(iso)
  const date = d.toISOString().slice(0, 10)
  const time = d.toTimeString().slice(0, 5)
  return `${date} ${time}`
}

const STAT_CARDS = [
  { key: 'open', label: 'Open', dot: 'bg-navy' },
  { key: 'under_review', label: 'Under Review', dot: 'bg-tier-high' },
  { key: 'escalated', label: 'Escalated', dot: 'bg-tier-critical' },
  { key: 'closed7d', label: 'Closed (7D)', dot: 'bg-tier-low' },
]

export default function MyCases({ onOpenCase }) {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await fetchCases()
      let scoreMap = {}
      if (data.length > 0) {
        try {
          const batch = await fetchBatchScores(data.map((c) => c.account_id))
          batch.scored.forEach((s) => { scoreMap[String(s.account_id)] = s })
        } catch {}
      }
      const enriched = data
        .map((c) => {
          const live = scoreMap[String(c.account_id)]
          return {
            ...c,
            risk_score: live?.risk_score ?? c.risk_score ?? 0,
            risk_tier: live?.risk_tier ?? c.risk_tier ?? 'LOW',
          }
        })
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      setCases(enriched)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const stats = useMemo(() => {
    const now = Date.now()
    const sevenDaysAgo = now - 7 * 24 * 3600 * 1000
    return {
      open: cases.filter((c) => c.status === 'open').length,
      under_review: cases.filter((c) => c.status === 'under_review').length,
      escalated: cases.filter((c) => c.status === 'escalated').length,
      closed7d: cases.filter((c) => c.status === 'cleared' && new Date(c.updated_at) >= sevenDaysAgo).length,
    }
  }, [cases])

  const visibleCases = useMemo(() => {
    if (!search.trim()) return cases
    const q = search.trim().toLowerCase()
    return cases.filter((c) => String(c.id).includes(q) || c.account_id.toLowerCase().includes(q))
  }, [cases, search])

  const activeCount = stats.open + stats.under_review + stats.escalated

  return (
    <div className="px-8 py-8">

      <div className="flex items-center justify-between mb-8">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display font-semibold text-3xl text-ink">My Cases</h1>
          <span className="text-sm font-mono text-ink-faint">{activeCount} active</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter cases…"
              className="pl-9 pr-4 py-2.5 text-sm font-sans bg-surface border border-line rounded-lg text-ink placeholder:text-ink-faint focus:border-navy outline-none transition-colors duration-200 ease-smooth w-56"
            />
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 text-sm font-sans font-medium px-4 py-2.5 bg-navy text-white hover:bg-navy-soft rounded-lg transition-all duration-200 ease-smooth hover:shadow-lg hover:shadow-navy/20"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            New Case
          </button>
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map((s) => (
          <div
            key={s.key}
            className="border border-line bg-surface rounded-xl p-5 transition-all duration-200 ease-smooth hover:border-line-strong hover:-translate-y-0.5"
          >
            <span className="flex items-center gap-2 text-xs font-sans font-semibold tracking-wider uppercase text-ink-faint mb-3">
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              {s.label}
            </span>
            <p className="font-display font-semibold text-3xl text-ink">{stats[s.key]}</p>
          </div>
        ))}
      </div>

      {/* ── Table ──────────────────────────────────────────── */}
      <div className="border border-line bg-surface rounded-xl overflow-hidden">
        {loading && (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-sans text-ink-soft">Loading cases…</p>
          </div>
        )}

        {error && !loading && (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-sans text-tier-critical mb-1">Could not load cases.</p>
            <p className="text-xs font-mono text-ink-faint">{error}</p>
          </div>
        )}

        {!loading && !error && visibleCases.length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-sans text-ink-soft">No cases found.</p>
          </div>
        )}

        {!loading && !error && visibleCases.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase">Case ID</th>
                <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase">Account</th>
                <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase">Risk</th>
                <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase">Status</th>
                <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase">Last Updated</th>
                <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase text-right">Open</th>
              </tr>
            </thead>
            <tbody>
              {visibleCases.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-line transition-colors duration-200 ease-smooth hover:bg-surface-hover"
                >
                  <td className="px-6 py-4 font-mono text-ink">CS-{String(c.id).padStart(5, '0')}</td>
                  <td className="px-6 py-4 font-mono text-ink-soft">{c.account_id}</td>
                  <td className="px-6 py-4"><TierDot tier={c.risk_tier} /></td>
                  <td className="px-6 py-4"><StatusBadge status={c.status} /></td>
                  <td className="px-6 py-4 font-mono text-xs text-ink-faint">{formatDateTime(c.updated_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => onOpenCase && onOpenCase(c.id)}
                      className="inline-flex items-center gap-1.5 text-sm font-sans font-medium px-3 py-1.5 border border-line hover:border-navy text-ink-soft hover:text-navy-soft rounded-lg transition-all duration-200 ease-smooth"
                    >
                      Open
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 17 17 7M7 7h10v10"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NewCaseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={load}
      />
    </div>
  )
}
