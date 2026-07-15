import { useState, useEffect, useMemo } from 'react'
import StatusBadge from './StatusBadge'
import {
  fetchCase,
  fetchAccountScore,
  fetchFundFlowTrace,
  updateCaseStatus,
} from '../lib/api'

const TIER_TEXT = {
  CRITICAL: 'text-tier-critical', HIGH: 'text-tier-high',
  MEDIUM: 'text-tier-medium', LOW: 'text-tier-low',
}
const TIER_BADGE_BG = {
  CRITICAL: 'bg-tier-critical-bg border-tier-critical-border text-tier-critical',
  HIGH: 'bg-tier-high-bg border-tier-high-border text-tier-high',
  MEDIUM: 'bg-tier-medium-bg border-tier-medium-border text-tier-medium',
  LOW: 'bg-tier-low-bg border-tier-low-border text-tier-low',
}

function formatVolume(amount) {
  if (!amount) return '$0'
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`
  return `$${amount.toFixed(0)}`
}

function traceStats(trace) {
  const paths = trace?.paths || []
  const totalVolume = paths.reduce(
    (sum, p) => sum + (p.amounts || []).reduce((s, a) => s + (a || 0), 0), 0
  )
  const accounts = new Set()
  paths.forEach((p) => (p.path_accounts || []).forEach((a) => accounts.add(a)))
  const maxHops = paths.reduce((max, p) => Math.max(max, p.hop_count || 0), 0)
  return { chains: paths.length, accounts: accounts.size, maxHops, totalVolume }
}

function ModelBar({ label, value, colorClass }) {
  const pct = Math.round(value * 100)
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-sans text-ink-soft">{label}</span>
        <span className="font-mono text-sm text-ink">{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 w-full bg-surface-raised rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClass} rounded-full transition-[width] duration-700 ease-smooth`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

const STATUS_ACTIONS = [
  { status: 'under_review', label: 'Start Review', icon: 'eye' },
  { status: 'escalated', label: 'Escalate', icon: 'alert' },
  { status: 'cleared', label: 'Clear', icon: 'x' },
  { status: 'confirmed_sar', label: 'Confirm SAR', icon: 'check' },
]

const ICONS = {
  eye: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  alert: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>,
  x: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10-3-3"/></svg>,
}

export default function CaseDetail({ caseId, onBack }) {
  const [caseData, setCaseData] = useState(null)
  const [score, setScore] = useState(null)
  const [outboundTrace, setOutboundTrace] = useState(null)
  const [inboundTrace, setInboundTrace] = useState(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionPending, setActionPending] = useState(false)
  const [sarPending, setSarPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const c = await fetchCase(caseId)
        if (cancelled) return
        setCaseData(c)
        setNotes(c.notes || '')

        const s = await fetchAccountScore(c.account_id)
        if (cancelled) return
        setScore(s)

        const [out, inn] = await Promise.all([
          fetchFundFlowTrace(c.account_id, 'out', 3),
          fetchFundFlowTrace(c.account_id, 'in', 3),
        ])
        if (!cancelled) { setOutboundTrace(out); setInboundTrace(inn) }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [caseId])

  const outStats = useMemo(() => traceStats(outboundTrace), [outboundTrace])
  const inStats = useMemo(() => traceStats(inboundTrace), [inboundTrace])

  async function handleStatusChange(newStatus) {
    setActionPending(true)
    try {
      const updated = await updateCaseStatus(caseId, newStatus, notes)
      setCaseData(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setActionPending(false)
    }
  }

  async function handleGenerateSar() {
    setSarPending(true)
    try {
      const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'
      const res = await fetch(`${API_BASE}/sar/${caseId}/generate`, { method: 'POST' })
      if (!res.ok) throw new Error(`SAR generation failed: ${res.status}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `SAR_case_${caseId}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setSarPending(false)
    }
  }

  if (loading) {
    return <div className="px-8 py-10"><p className="text-sm font-sans text-ink-soft">Loading case…</p></div>
  }

  if (error && !caseData) {
    return (
      <div className="px-8 py-10">
        <p className="text-sm font-sans text-tier-critical">{error}</p>
        <button onClick={onBack} className="mt-4 text-sm font-sans text-navy-soft hover:text-navy transition-colors duration-200 ease-smooth">
          ← Back to queue
        </button>
      </div>
    )
  }

  const caseLabel = `CS-${String(caseData.id).padStart(5, '0')}`
  const tier = score?.risk_tier || caseData.risk_tier || 'LOW'

  return (
    <div className="px-8 py-8">

      {/* ── Breadcrumb ─────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm font-sans text-ink-faint">
          <button onClick={onBack} className="hover:text-ink transition-colors duration-200 ease-smooth">Alerts</button>
          <span className="mx-2">/</span>
          <span className="text-ink-soft font-mono">{caseLabel}</span>
        </p>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-sans font-medium px-4 py-2 border border-line hover:border-line-strong text-ink-soft hover:text-ink rounded-lg transition-all duration-200 ease-smooth"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to queue
        </button>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 border border-tier-critical bg-tier-critical-bg rounded-lg">
          <p className="text-sm font-sans text-tier-critical">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-[420px_1fr] gap-6 items-start">

        {/* ── Left column ───────────────────────────────────── */}
        <div className="flex flex-col gap-6">

          {/* Identity card */}
          <div className="border border-line bg-surface rounded-xl p-6 transition-colors duration-200 ease-smooth hover:border-line-strong">
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-xs font-sans font-semibold tracking-wider uppercase text-ink-faint mb-1">Case ID</p>
                <p className="font-mono text-sm text-ink">{caseLabel}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-sans font-semibold border ${TIER_BADGE_BG[tier]}`}>
                {tier === 'CRITICAL' && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>}
                {tier.charAt(0) + tier.slice(1).toLowerCase()}
              </span>
            </div>

            <p className="text-xs font-sans font-semibold tracking-wider uppercase text-ink-faint mb-1">Account</p>
            <p className="font-display font-semibold text-2xl text-ink mb-1 font-mono">{caseData.account_id}</p>

            <div className="flex items-baseline gap-2 mb-5">
              <span className={`font-mono text-lg font-semibold ${TIER_TEXT[tier]}`}>
                {score ? (score.risk_score * 100).toFixed(0) : '—'}
              </span>
              <span className="text-xs font-sans text-ink-faint uppercase tracking-wide">Risk Score</span>
            </div>

            <div className="border-t border-line pt-4 grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] font-sans font-medium tracking-wider uppercase text-ink-faint mb-1.5">Status</p>
                <StatusBadge status={caseData.status} />
              </div>
              <div>
                <p className="text-[10px] font-sans font-medium tracking-wider uppercase text-ink-faint mb-1.5">Opened</p>
                <p className="font-mono text-xs text-ink-soft">{new Date(caseData.created_at).toISOString().slice(0, 10)}</p>
              </div>
              <div>
                <p className="text-[10px] font-sans font-medium tracking-wider uppercase text-ink-faint mb-1.5">Analyst</p>
                <p className="font-mono text-xs text-ink-soft">{caseData.assigned_to || 'Unassigned'}</p>
              </div>
            </div>
          </div>

          {/* Outbound / Inbound */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-line bg-surface rounded-xl p-5 transition-all duration-200 ease-smooth hover:border-line-strong hover:-translate-y-0.5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-tier-critical-bg border border-tier-critical-border flex items-center justify-center text-tier-critical">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>
                </div>
                <div>
                  <p className="text-sm font-sans font-semibold text-ink">Outbound</p>
                  <p className="text-[11px] font-sans text-ink-faint">Where money went</p>
                </div>
              </div>
              <p className="font-display font-semibold text-2xl text-ink mb-0.5">{formatVolume(outStats.totalVolume)}</p>
              <p className="text-xs font-sans text-ink-faint mb-4">Total volume traced</p>
              <div className="border-t border-line pt-3 grid grid-cols-3 gap-2 text-center">
                <div><p className="font-mono text-sm text-ink">{outStats.chains}</p><p className="text-[9px] font-sans text-ink-faint uppercase tracking-wide">Chains</p></div>
                <div><p className="font-mono text-sm text-ink">{outStats.accounts}</p><p className="text-[9px] font-sans text-ink-faint uppercase tracking-wide">Accounts</p></div>
                <div><p className="font-mono text-sm text-ink">{outStats.maxHops}</p><p className="text-[9px] font-sans text-ink-faint uppercase tracking-wide">Max Hops</p></div>
              </div>
            </div>

            <div className="border border-line bg-surface rounded-xl p-5 transition-all duration-200 ease-smooth hover:border-line-strong hover:-translate-y-0.5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-tier-medium-bg border border-tier-medium-border flex items-center justify-center text-tier-medium">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 18l-9.5-9.5-5 5L1 6"/><path d="M17 18h6v-6"/></svg>
                </div>
                <div>
                  <p className="text-sm font-sans font-semibold text-ink">Inbound</p>
                  <p className="text-[11px] font-sans text-ink-faint">Where money came from</p>
                </div>
              </div>
              <p className="font-display font-semibold text-2xl text-ink mb-0.5">{formatVolume(inStats.totalVolume)}</p>
              <p className="text-xs font-sans text-ink-faint mb-4">Total volume traced</p>
              <div className="border-t border-line pt-3 grid grid-cols-3 gap-2 text-center">
                <div><p className="font-mono text-sm text-ink">{inStats.chains}</p><p className="text-[9px] font-sans text-ink-faint uppercase tracking-wide">Chains</p></div>
                <div><p className="font-mono text-sm text-ink">{inStats.accounts}</p><p className="text-[9px] font-sans text-ink-faint uppercase tracking-wide">Accounts</p></div>
                <div><p className="font-mono text-sm text-ink">{inStats.maxHops}</p><p className="text-[9px] font-sans text-ink-faint uppercase tracking-wide">Max Hops</p></div>
              </div>
            </div>
          </div>

          {/* Model Basis */}
          <div className="border border-line bg-surface rounded-xl p-6 transition-colors duration-200 ease-smooth hover:border-line-strong">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-sm font-sans font-semibold text-ink">Model Basis</p>
                <p className="text-xs font-sans text-ink-faint">Weighted ensemble scoring</p>
              </div>
              <span className="text-[10px] font-mono text-ink-faint">v1.0</span>
            </div>
            {score && (
              <>
                <ModelBar label="Random Forest" value={score.rf_score} colorClass="bg-navy" />
                <ModelBar label="GraphSAGE" value={score.graphsage_score} colorClass="bg-purple" />
                <div className="border-t border-line mt-4 pt-4">
                  <ModelBar label="Ensemble" value={score.risk_score} colorClass={
                    tier === 'CRITICAL' ? 'bg-tier-critical' : tier === 'HIGH' ? 'bg-tier-high' : tier === 'MEDIUM' ? 'bg-tier-medium' : 'bg-tier-low'
                  } />
                </div>
              </>
            )}
          </div>

          <button className="flex items-center justify-center gap-2 text-sm font-sans font-medium px-4 py-3 border border-line hover:border-navy text-ink-soft hover:text-navy-soft rounded-xl transition-all duration-200 ease-smooth">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.9 4M15.5 6.5l-6.9 4"/></svg>
            Open in Investigation Graph
          </button>
        </div>

        {/* ── Right column: notes + actions ─────────────────── */}
        <div className="flex flex-col gap-6">
          <div className="border border-line bg-surface rounded-xl p-6 min-h-[520px] flex flex-col transition-colors duration-200 ease-smooth hover:border-line-strong">
            <div className="flex items-center justify-between mb-1">
              <p className="font-display font-semibold text-lg text-ink">Investigator Notes</p>
              <span className="text-xs font-mono text-ink-faint">{notes.length} chars</span>
            </div>
            <p className="text-xs font-sans text-ink-faint mb-4">
              Document findings, rationale, and next steps. Saved to the case audit trail.
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add findings, rationale, or next steps…"
              className="flex-1 w-full bg-paper border border-line rounded-lg p-4 text-sm font-sans text-ink placeholder:text-ink-faint focus:border-navy outline-none resize-none transition-colors duration-200 ease-smooth"
            />
          </div>

          {/* Actions bar */}
          <div className="border border-line bg-surface rounded-xl p-5 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {STATUS_ACTIONS.map((action) => (
                <button
                  key={action.status}
                  disabled={actionPending || caseData.status === action.status}
                  onClick={() => handleStatusChange(action.status)}
                  className="flex items-center gap-1.5 text-sm font-sans font-medium px-4 py-2 border border-line hover:border-line-strong text-ink-soft hover:text-ink rounded-lg transition-all duration-200 ease-smooth disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {ICONS[action.icon]}
                  {action.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-ink-faint hidden lg:inline">Case {caseLabel}</span>
              <button
                onClick={handleGenerateSar}
                disabled={sarPending}
                className="flex items-center gap-2 text-sm font-sans font-medium px-4 py-2.5 bg-navy text-white hover:bg-navy-soft rounded-lg transition-all duration-200 ease-smooth disabled:opacity-50 hover:shadow-lg hover:shadow-navy/20"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                {sarPending ? 'Generating…' : 'Generate SAR Report'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
