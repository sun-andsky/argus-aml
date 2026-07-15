const TIER_COLORS = {
  CRITICAL: '#EF4444',
  HIGH: '#F59E0B',
  MEDIUM: '#3B82F6',
  LOW: '#10B981',
}

export function buildGraphElements(rootAccountId, outboundTrace, inboundTrace) {
  const nodes = new Map()
  const edges = []
  let edgeCounter = 0

  nodes.set(rootAccountId, { data: { id: rootAccountId, label: rootAccountId, isRoot: true } })

  function addPath(pathRecord, direction) {
    const { path_accounts, amounts } = pathRecord
    if (!path_accounts || path_accounts.length < 2) return

    for (const acc of path_accounts) {
      if (!nodes.has(acc)) {
        nodes.set(acc, { data: { id: acc, label: acc, isRoot: acc === rootAccountId, direction } })
      }
    }

    for (let i = 0; i < path_accounts.length - 1; i++) {
      const source = direction === 'out' ? path_accounts[i] : path_accounts[i + 1]
      const target = direction === 'out' ? path_accounts[i + 1] : path_accounts[i]
      const amount = amounts && amounts[i] != null ? amounts[i] : null
      edgeCounter += 1
      edges.push({ data: { id: `e${edgeCounter}`, source, target, amount, direction } })
    }
  }

  ;(outboundTrace?.paths || []).forEach((p) => addPath(p, 'out'))
  ;(inboundTrace?.paths || []).forEach((p) => addPath(p, 'in'))

  return [...nodes.values(), ...edges]
}

export function tierColor(tier) {
  return TIER_COLORS[tier] || '#6B7280'
}

export function formatAmount(amount) {
  if (amount == null) return ''
  return `$${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}
