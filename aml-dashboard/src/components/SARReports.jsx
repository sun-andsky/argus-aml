import { useState, useEffect } from 'react'
import StatusBadge from './StatusBadge'
import { fetchCases } from '../lib/api'

function formatDate(iso) {
  return new Date(iso).toISOString().slice(0, 10)
}

/**
 * Lists cases marked confirmed_sar (Filed) plus escalated cases pending
 * confirmation (shown as "Pending Review" so the queue reflects reports
 * in progress, not just already-filed ones — matches the screenshot
 * showing mixed Filed/Pending Review/Draft statuses).
 */
export default function SARReports() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [filed, escalated] = await Promise.all([
          fetchCases('confirmed_sar'),
          fetchCases('escalated'),
        ])
        const combined = [
          ...filed.map((c) => ({ ...c, sar_status: 'filed' })),
          ...escalated.map((c) => ({ ...c, sar_status: 'pending' })),
        ].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        if (!cancelled) { setCases(combined); setError(null) }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function handleDownload(caseId) {
    setDownloadingId(caseId)
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
      setDownloadingId(null)
    }
  }

  return (
    <div className="px-8 py-8">

      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display font-semibold text-3xl text-ink">SAR Reports</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center px-4 py-2 border border-line rounded-full">
            <span className="text-sm font-mono text-ink-soft">{cases.length} Reports on Record</span>
          </div>
        </div>
      </div>

      <div className="border border-line bg-surface rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-line">
          <div>
            <h2 className="font-display font-semibold text-lg text-ink">Filed &amp; Draft Reports</h2>
            <p className="text-xs font-sans text-ink-faint mt-0.5">Retained for 5 years per FinCEN policy</p>
          </div>
          <span className="text-xs font-mono text-ink-faint">{cases.length} records</span>
        </div>

        {loading && (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-sans text-ink-soft">Loading reports…</p>
          </div>
        )}

        {error && !loading && (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-sans text-tier-critical mb-1">Could not load reports.</p>
            <p className="text-xs font-mono text-ink-faint">{error}</p>
          </div>
        )}

        {!loading && !error && cases.length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-sans text-ink-soft">
              No SAR activity yet. Reports appear here once a case is escalated or confirmed.
            </p>
          </div>
        )}

        {!loading && !error && cases.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase">Case ID</th>
                <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase">Account</th>
                <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase">Confirmation Date</th>
                <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase">Report Status</th>
                <th className="px-6 py-3 font-sans font-medium text-ink-faint text-xs tracking-wide uppercase text-right">Download</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="border-t border-line transition-colors duration-200 ease-smooth hover:bg-surface-hover">
                  <td className="px-6 py-4 font-mono text-ink">CS-{String(c.id).padStart(5, '0')}</td>
                  <td className="px-6 py-4 font-mono text-ink-soft">{c.account_id}</td>
                  <td className="px-6 py-4 font-mono text-xs text-ink-faint">{formatDate(c.updated_at)}</td>
                  <td className="px-6 py-4"><StatusBadge status={c.sar_status} /></td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDownload(c.id)}
                      disabled={downloadingId === c.id}
                      className="inline-flex items-center gap-1.5 text-xs font-sans font-medium px-3 py-1.5 border border-line hover:border-navy text-ink-soft hover:text-navy-soft rounded-lg transition-all duration-200 ease-smooth disabled:opacity-50"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                      {downloadingId === c.id ? 'Generating…' : 'PDF'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
