import { useState } from 'react'
import { createCase, fetchAccountScore } from '../lib/api'

/**
 * Shared modal for opening a new case, used by both the Alerts page
 * ("New investigation") and My Cases ("New Case"). Scores the account
 * live before creating the case so it doesn't sit blank in the queue.
 */
export default function NewCaseModal({ open, onClose, onCreated }) {
  const [accountId, setAccountId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = accountId.trim()
    if (!trimmed) return

    setSubmitting(true)
    setError(null)
    try {
      let riskScore = null
      let riskTier = null
      try {
        const scored = await fetchAccountScore(trimmed)
        riskScore = scored.risk_score
        riskTier = scored.risk_tier
      } catch {
        // Account may not be in the feature table yet — still allow
        // opening the case, just without a live score attached
      }

      const newCase = await createCase(trimmed, riskScore, riskTier)
      setAccountId('')
      onCreated && onCreated(newCase)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity duration-200 ease-smooth"
      onClick={onClose}
    >
      <div
        className="bg-surface-raised border border-line-strong rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display font-semibold text-lg text-ink mb-1">New Investigation</h2>
        <p className="text-sm font-sans text-ink-soft mb-5">
          Open a case for an account — it will be scored live before the case is created.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-sans font-medium text-ink-soft mb-1.5">
            Account ID
          </label>
          <input
            autoFocus
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="e.g. 70_100428660"
            className="w-full border border-line bg-paper px-3 py-2.5 text-sm font-mono text-ink focus:border-navy outline-none rounded-lg transition-colors duration-200 ease-smooth mb-4"
          />

          {error && (
            <p className="text-xs font-sans text-tier-critical mb-4">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-sans font-medium px-4 py-2 text-ink-soft hover:text-ink rounded-lg transition-colors duration-200 ease-smooth"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !accountId.trim()}
              className="text-sm font-sans font-medium px-4 py-2 bg-navy text-white hover:bg-navy-soft rounded-lg transition-all duration-200 ease-smooth disabled:opacity-50 hover:shadow-lg hover:shadow-navy/20"
            >
              {submitting ? 'Creating…' : 'Create Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
