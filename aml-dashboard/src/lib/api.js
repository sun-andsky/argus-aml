const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'

// Simple in-memory cache — avoids re-fetching the same data on every
// tab switch. TTL of 30 seconds keeps data fresh without hammering the API.
const cache = new Map()
const CACHE_TTL = 30_000

function getCached(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null }
  return entry.data
}

function setCached(key, data) {
  cache.set(key, { data, ts: Date.now() })
  return data
}

export function clearCache() {
  cache.clear()
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export async function fetchBatchScores(accountIds) {
  const key = `batch:${accountIds.sort().join(',')}`
  return getCached(key) ?? setCached(key, await fetchJSON(`${API_BASE}/score/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_ids: accountIds }),
  }))
}

export async function fetchCases(status = null) {
  const key = `cases:${status ?? 'all'}`
  return getCached(key) ?? setCached(key, await fetchJSON(
    `${API_BASE}/cases${status ? `?status=${status}` : ''}`
  ))
}

export async function updateCaseStatus(caseId, status, notes) {
  clearCache() // invalidate after any mutation
  return fetchJSON(`${API_BASE}/cases/${caseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, notes }),
  })
}

export async function createCase(accountId, riskScore = null, riskTier = null) {
  clearCache()
  return fetchJSON(`${API_BASE}/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId, risk_score: riskScore, risk_tier: riskTier }),
  })
}

export async function fetchAccountScore(accountId) {
  const key = `score:${accountId}`
  return getCached(key) ?? setCached(key, await fetchJSON(`${API_BASE}/score/${accountId}`))
}

export async function fetchFundFlowTrace(accountId, direction = 'out', hops = 3) {
  const key = `trace:${accountId}:${direction}:${hops}`
  if (getCached(key)) return getCached(key)
  const url = new URL(`${API_BASE}/graph/${accountId}/trace`)
  url.searchParams.set('direction', direction)
  url.searchParams.set('hops', hops)
  const res = await fetch(url)
  if (res.status === 404) {
    const empty = { paths_found: 0, paths: [], hops_requested: hops }
    return setCached(key, empty)
  }
  if (!res.ok) throw new Error(`${res.status}`)
  return setCached(key, await res.json())
}

export async function fetchAccountNeighbors(accountId) {
  const key = `neighbors:${accountId}`
  if (getCached(key)) return getCached(key)
  const res = await fetch(`${API_BASE}/graph/${accountId}/neighbors`)
  if (res.status === 404) return { outgoing: [], incoming: [] }
  if (!res.ok) throw new Error(`${res.status}`)
  return setCached(key, await res.json())
}

export async function fetchCase(caseId) {
  const key = `case:${caseId}`
  return getCached(key) ?? setCached(key, await fetchJSON(`${API_BASE}/cases/${caseId}`))
}

export function exportRowsToCsv(rows, columns, filename) {
  const header = columns.map((c) => c.label).join(',')
  const body = rows.map((r) => columns.map((c) => JSON.stringify(c.value(r) ?? '')).join(',')).join('\n')
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  window.URL.revokeObjectURL(url)
}