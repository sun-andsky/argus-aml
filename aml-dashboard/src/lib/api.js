const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'

export async function fetchBatchScores(accountIds) {
  const res = await fetch(`${API_BASE}/score/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_ids: accountIds }),
  })
  if (!res.ok) throw new Error(`Batch scoring failed: ${res.status}`)
  return res.json()
}

export async function fetchCases(status = null) {
  const url = new URL(`${API_BASE}/cases`)
  if (status) url.searchParams.set('status', status)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetching cases failed: ${res.status}`)
  return res.json()
}

export async function updateCaseStatus(caseId, status, notes) {
  const res = await fetch(`${API_BASE}/cases/${caseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, notes }),
  })
  if (!res.ok) throw new Error(`Updating case failed: ${res.status}`)
  return res.json()
}

/**
 * Opens a new case for an account — powers the "New Case" / "New
 * investigation" buttons. Optionally scores the account first if a score
 * isn't provided, so freshly-opened cases carry a real risk_score/tier
 * immediately rather than showing blank until the next enrichment pass.
 */
export async function createCase(accountId, riskScore = null, riskTier = null) {
  const res = await fetch(`${API_BASE}/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account_id: accountId,
      risk_score: riskScore,
      risk_tier: riskTier,
    }),
  })
  if (!res.ok) throw new Error(`Creating case failed: ${res.status}`)
  return res.json()
}

export async function fetchAccountScore(accountId) {
  const res = await fetch(`${API_BASE}/score/${accountId}`)
  if (!res.ok) throw new Error(`Fetching score failed: ${res.status}`)
  return res.json()
}

export async function fetchFundFlowTrace(accountId, direction = 'out', hops = 3) {
  const url = new URL(`${API_BASE}/graph/${accountId}/trace`)
  url.searchParams.set('direction', direction)
  url.searchParams.set('hops', hops)
  const res = await fetch(url)

  if (res.status === 404) {
    return { paths_found: 0, paths: [], hops_requested: hops, start_account: accountId }
  }
  if (!res.ok) throw new Error(`Fetching fund flow trace failed: ${res.status}`)
  return res.json()
}

export async function fetchAccountNeighbors(accountId) {
  const res = await fetch(`${API_BASE}/graph/${accountId}/neighbors`)
  if (res.status === 404) {
    return { outgoing: [], incoming: [], outgoing_count: 0, incoming_count: 0 }
  }
  if (!res.ok) throw new Error(`Fetching neighbors failed: ${res.status}`)
  return res.json()
}

export async function fetchCase(caseId) {
  const res = await fetch(`${API_BASE}/cases/${caseId}`)
  if (!res.ok) throw new Error(`Fetching case failed: ${res.status}`)
  return res.json()
}

/** Client-side CSV export of whatever rows are currently visible — powers the Alerts page "Export" button. */
export function exportRowsToCsv(rows, columns, filename) {
  const header = columns.map((c) => c.label).join(',')
  const body = rows
    .map((row) => columns.map((c) => JSON.stringify(c.value(row) ?? '')).join(','))
    .join('\n')
  const csv = `${header}\n${body}`

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.URL.revokeObjectURL(url)
}
