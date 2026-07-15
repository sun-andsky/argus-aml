import { useState, useEffect, useMemo } from 'react'
import ScoreBar from './ScoreBar'
import StatusBadge from './StatusBadge'
import NewCaseModal from './NewCaseModal'
import { fetchCases, fetchBatchScores, exportRowsToCsv } from '../lib/api'

const TIER_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
const TIER_META = [
  { key: 'CRITICAL', label: 'Critical', dot: 'bg-tier-critical', bar: 'bg-tier-critical' },
  { key: 'HIGH', label: 'High', dot: 'bg-tier-high', bar: 'bg-tier-high' },
  { key: 'MEDIUM', label: 'Medium', dot: 'bg-tier-medium', bar: 'bg-tier-medium' },
  { key: 'LOW', label: 'Low', dot: 'bg-tier-low', bar: 'bg-tier-low' },
]

function formatDate(iso) {
  const d = new Date(iso)
  return d.toISOString().slice(0, 10)
}

function statusKey(status) {
  // Normalizes backend status strings to the StatusBadge/UI vocabulary
  if (status === 'confirmed_sar') return 'confirmed_sar'
  return status
}

export default function AlertQueue({ onOpenCase }) {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  async function loadCases() {
    setLoading(true)
    try {
      const data = await fetchCases()
      let scoreMap = {}
      if (data.length > 0) {
        try {
          const batch = await fetchBatchScores(data.map((c) => c.account_id))
          batch.scored.forEach((s) => { scoreMap[String(s.account_id)] = s })
        } catch {
          // fall back to stored values below
        }
      }
      const enriched = data.map((c) => {
        const live = scoreMap[String(c.account_id)]
        return {
          ...c,
          risk_score: live?.risk_score ?? c.risk_score ?? 0,
          risk_tier: live?.risk_tier ?? c.risk_tier ?? 'LOW',
        }
      })
      setCases(enriched)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCases() }, [])

  const tierCounts = useMemo(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
    cases.forEach((c) => { if (counts[c.risk_tier] !== undefined) counts[c.risk_tier]++ })
    return counts
  }, [cases])

  const total = cases.length || 1

  const visibleCases = useMemo(() => {
    let list = cases
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((c) =>
        String(c.id).includes(q) || c.account_id.toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) =>
      (TIER_ORDER[a.risk_tier] ?? 9) - (TIER_ORDER[b.risk_tier] ?? 9) ||
      (b.risk_score ?? 0) - (a.risk_score ?? 0)
    )
  }, [cases, search])

  // Real, derived SLA figures — not fabricated. Avg triage time is the
  // mean gap between created_at and updated_at for resolved cases;
  // Open>48h and SAR filed(7d) are direct counts over real timestamps.
  const slaStats = useMemo(() => {
    const resolved = cases.filter((c) => ['cleared', 'confirmed_sar'].includes(c.status))
    const triageMs = resolved.map((c) => new Date(c.updated_at) - new Date(c.created_at))
    const avgMs = triageMs.length ? triageMs.reduce((a, b) => a + b, 0) / triageMs.length : 0
    const avgMin = Math.floor(avgMs / 60000)
    const avgSec = Math.floor((avgMs % 60000) / 1000)

    const now = Date.now()
    const open48h = cases.filter(
      (c) => c.status === 'open' && (now - new Date(c.created_at)) > 48 * 3600 * 1000
    ).length

    const sevenDaysAgo = now - 7 * 24 * 3600 * 1000
    const sarFiled7d = cases.filter(
      (c) => c.status === 'confirmed_sar' && new Date(c.updated_at) >= sevenDaysAgo
    ).length

    return {
      avgTriage: resolved.length ? `${avgMin}m ${avgSec}s` : '—',
      open48h,
      sarFiled7d,
    }
  }, [cases])

  function handleExport() {
    exportRowsToCsv(
      visibleCases,
      [
        { label: 'Case ID', value: (r) => `#${String(r.id).padStart(4, '0')}` },
        { label: 'Account', value: (r) => r.account_id },
        { label: 'Risk Score', value: (r) => r.risk_score },
        { label: 'Risk Tier', value: (r) => r.risk_tier },
        { label: 'Status', value: (r) => r.status },
        { label: 'Opened', value: (r) => formatDate(r.created_at) },
      ],
      'alert_queue_export.csv'
    )
  }

  return (
    <div className="px-8 py-8">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display font-semibold text-3xl text-ink">Alerts</h1>
          <span className="text-sm font-mono text-ink-faint">{cases.length} active</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 text-sm font-sans font-medium px-4 py-2.5 border border-line hover:border-line-strong text-ink-soft hover:text-ink rounded-lg transition-all duration-200 ease-smooth"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Export
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="text-sm font-sans font-medium px-4 py-2.5 bg-navy text-white hover:bg-navy-soft rounded-lg transition-all duration-200 ease-smooth hover:shadow-lg hover:shadow-navy/20"
          >
            New investigation
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[340px_1fr] gap-6 items-start">

        {/* ── Left column ───────────────────────────────────── */}
        <div className="flex flex-col gap-6">

          {/* Risk Summary */}
          <div className="border border-line bg-surface rounded-xl p-6 transition-colors duration-200 ease-smooth hover:border-line-strong">
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs font-sans font-semibold tracking-wider uppercase text-ink-faint">
                Risk Summary
              </p>
              <span className="text-[10px] font-mono text-ink-faint">24H</span>
            </div>

            <p className="font-display font-semibold text-4xl text-ink mb-1">{cases.length}</p>
            <p className="text-sm font-sans text-ink-soft mb-5">Active alerts across the desk</p>

            {/* Segmented bar */}
            <div className="h-1.5 w-full rounded-full overflow-hidden flex mb-5 bg-surface-raised">
              {TIER_META.map((t) => (
                <div
                  key={t.key}
                  className={`h-full ${t.bar} transition-all duration-500 ease-smooth`}
                  style={{ width: `${(tierCounts[t.key] / total) * 100}%` }}
                />
              ))}
            </div>

            <div className="space-y-3.5">
              {TIER_META.map((t) => (
                <div key={t.key} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-sans text-ink">
                    <span className={`w-2 h-2 rounded-full ${t.dot}`} />
                    {t.label}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="font-mono text-sm text-ink">{tierCounts[t.key]}</span>
                    <span className="font-mono text-xs text-ink-faint">
                      {Math.round((tierCounts[t.key] / total) * 100)}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance SLA */}
          <div className="border border-line bg-surface rounded-xl p-6 transition-colors duration-200 ease-smooth hover:border-line-strong">
            <p className="text-xs font-sans font-semibold tracking-wider uppercase text-ink-faint mb-5">
              Compliance SLA
            </p>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-sans text-ink-soft">Avg. triage time</span>
                <span className="font-mono text-sm text-ink">{slaStats.avgTriage}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-sans text-ink-soft">Open &gt; 48h</span>
                <span className="font-mono text-sm text-ink">{slaStats.open48h}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-sans text-ink-soft">SAR filed (7d)</span>
                <span className="font-mono text-sm text-ink">{slaStats.sarFiled7d}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column: Alert Queue table ───────────────── */}
        <div className="border border-line bg-surface rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-line">
            <div>
              <h2 className="font-display font-semibold text-lg text-ink">Alert Queue</h2>
              <p className="text-xs font-sans text-ink-faint mt-0.5">Sorted by risk score, descending</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search case, account…"
                  className="pl-9 pr-4 py-2 text-sm font-sans bg-paper border border-line rounded-lg text-ink placeholder:text-ink-faint focus:border-navy outline-none transition-colors duration-200 ease-smooth w-64"
                />
              </div>
              <button className="flex items-center gap-1.5 text-sm font-sans font-medium px-3.5 py-2 border border-line hover:border-line-strong text-ink-soft hover:text-ink rounded-lg transition-all duration-200 ease-smooth">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
                Filters
              </button>
            </div>
          </div>

          {loading && (
            <div className="px-6 py-16 text-center">
              <p className="text-sm font-sans text-ink-soft">Loading alert queue…</p>
            </div>
          )}

          {error && !loading && (
            <div className="px-6 py-16 text-center">
              <p className="text-sm font-sans text-tier-critical mb-1">Could not load the queue.</p>
              <p className="text-xs font-mono text-ink-faint">{error}</p>
            </div>
          )}

          {!loading && !error && visibleCases.length === 0 && (
            <div className="px-6 py-16 text-center">
              <p className="text-sm font-sans text-ink-soft">No matching alerts.</p>
            </div>
          )}

          {!loading && !error && visibleCases.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase">Case ID</th>
                  <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase">Account</th>
                  <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase">Risk Score</th>
                  <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase">Status</th>
                  <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase">Opened</th>
                  <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase text-right">Action</th>
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
                    <td className="px-6 py-4">
                      <ScoreBar value={c.risk_score * 100} tier={c.risk_tier} max={100} width="w-24" />
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={statusKey(c.status)} /></td>
                    <td className="px-6 py-4 font-mono text-xs text-ink-faint">{formatDate(c.created_at)}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => onOpenCase && onOpenCase(c.id)}
                        className="inline-flex items-center gap-1 text-sm font-sans font-medium text-navy-soft hover:text-navy transition-colors duration-200 ease-smooth"
                      >
                        Investigate
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 17 17 7M7 7h10v10"/></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <NewCaseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={loadCases}
      />
    </div>
  )
}
