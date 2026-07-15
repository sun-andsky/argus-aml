import { useEffect, useRef, useState } from 'react'
import cytoscape from 'cytoscape'
import { fetchFundFlowTrace, fetchCases, fetchAccountNeighbors } from '../lib/api'
import { buildGraphElements, formatAmount } from '../lib/graphTransform'

const HOP_OPTIONS = [1, 2, 3, 4, 5]

function buildStylesheet() {
  return [
    {
      selector: 'node',
      style: {
        'background-color': '#F59E0B',
        'label': 'data(label)',
        'font-family': 'IBM Plex Mono, monospace',
        'font-size': '10px',
        'color': '#9BA3AF',
        'text-valign': 'bottom',
        'text-margin-y': 8,
        'width': 26,
        'height': 26,
        'border-width': 3,
        'border-color': 'rgba(245,158,11,0.25)',
      },
    },
    {
      selector: 'node[direction = "in"]',
      style: {
        'background-color': '#3B82F6',
        'border-color': 'rgba(59,130,246,0.25)',
      },
    },
    {
      selector: 'node[?isRoot]',
      style: {
        'shape': 'ellipse',
        'background-color': '#FFFFFF',
        'width': 40,
        'height': 40,
        'border-width': 8,
        'border-color': 'rgba(255,255,255,0.15)',
        'font-weight': 600,
        'color': '#F2F3F5',
      },
    },
    {
      selector: 'node:selected',
      style: { 'border-width': 4, 'border-color': '#3B82F6' },
    },
    {
      selector: 'edge',
      style: {
        'width': 1.5,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.7,
        'curve-style': 'bezier',
        'opacity': 0.9,
      },
    },
    {
      selector: 'edge[direction = "out"]',
      style: { 'line-color': '#EF4444', 'target-arrow-color': '#EF4444' },
    },
    {
      selector: 'edge[direction = "in"]',
      style: {
        'line-color': '#3B82F6',
        'target-arrow-color': '#3B82F6',
        'line-style': 'dashed',
        'line-dash-pattern': [4, 4],
      },
    },
    {
      selector: 'edge:selected',
      style: { width: 3, opacity: 1 },
    },
  ]
}

export default function GraphExplorer() {
  const containerRef = useRef(null)
  const cyRef = useRef(null)

  const [accountId, setAccountId] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [hops, setHops] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)
  const [queueItems, setQueueItems] = useState([])
  const [selectedQueueId, setSelectedQueueId] = useState(null)

  useEffect(() => {
    fetchCases()
      .then((cases) => {
        const sorted = [...cases].sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
        setQueueItems(sorted.slice(0, 6))
      })
      .catch(() => setQueueItems([]))
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    cyRef.current = cytoscape({
      container: containerRef.current,
      style: buildStylesheet(),
      layout: { name: 'grid' },
      wheelSensitivity: 0.3,
    })
    return () => cyRef.current?.destroy()
  }, [])

  async function loadGraph(id, caseId = null) {
    if (!id) return
    setLoading(true)
    setError(null)
    setSelectedQueueId(caseId)

    try {
      const [outbound, inbound] = await Promise.all([
        fetchFundFlowTrace(id, 'out', hops),
        fetchFundFlowTrace(id, 'in', hops),
      ])

      let effOut = outbound
      let effIn = inbound
      const noPaths = (outbound?.paths_found ?? 0) === 0 && (inbound?.paths_found ?? 0) === 0

      if (noPaths) {
        try {
          const neighbors = await fetchAccountNeighbors(id)
          effOut = {
            paths_found: neighbors.outgoing.length,
            paths: neighbors.outgoing.map((tx) => ({ hop_count: 1, path_accounts: [id, tx.counterparty], amounts: [tx.amount] })),
          }
          effIn = {
            paths_found: neighbors.incoming.length,
            paths: neighbors.incoming.map((tx) => ({ hop_count: 1, path_accounts: [tx.counterparty, id], amounts: [tx.amount] })),
          }
        } catch {
          effOut = { paths_found: 0, paths: [] }
          effIn = { paths_found: 0, paths: [] }
        }
      }

      const elements = buildGraphElements(id, effOut, effIn)
      cyRef.current.elements().remove()
      cyRef.current.add(elements)
      cyRef.current.layout({
        name: 'concentric',
        concentric: (node) => (node.data('isRoot') ? 10 : 1),
        levelWidth: () => 2,
        minNodeSpacing: 55,
        animate: true,
        animationDuration: 350,
      }).run()

      setStats({
        nodeCount: elements.filter((el) => !el.data.source).length,
        edgeCount: elements.filter((el) => el.data.source).length,
        outboundPaths: effOut?.paths_found ?? 0,
        inboundPaths: effIn?.paths_found ?? 0,
      })
      setAccountId(id)
    } catch (err) {
      setError(err.message)
      setStats(null)
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    loadGraph(inputValue.trim())
  }

  function zoomBy(factor) {
    if (!cyRef.current) return
    cyRef.current.zoom(cyRef.current.zoom() * factor)
  }
  function fitView() { cyRef.current?.fit(undefined, 40) }
  function centerView() { cyRef.current?.center() }
  function exportPng() {
    if (!cyRef.current) return
    const png = cyRef.current.png({ full: true, scale: 2, bg: '#0A0D13' })
    const a = document.createElement('a')
    a.href = png
    a.download = `investigation_graph_${accountId || 'export'}.png`
    a.click()
  }

  const activeCase = queueItems.find((c) => c.id === selectedQueueId)

  return (
    <div className="px-8 py-8">

      <div className="mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display font-semibold text-3xl text-ink">Investigation Graph</h1>
          {activeCase && (
            <span className="text-sm font-mono text-ink-faint">
              CS-{String(activeCase.id).padStart(5, '0')} · {activeCase.account_id}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[340px_1fr] gap-6 items-start">

        {/* ── Left column ───────────────────────────────────── */}
        <div className="flex flex-col gap-6">

          <div className="border border-line bg-surface rounded-xl p-6 transition-colors duration-200 ease-smooth hover:border-line-strong">
            <p className="text-xs font-sans font-semibold tracking-wider uppercase text-ink-faint mb-5">
              Trace Summary
            </p>
            {stats ? (
              <div className="space-y-4">
                {[
                  ['Accounts involved', stats.nodeCount],
                  ['Connections', stats.edgeCount],
                  ['Outbound chains', stats.outboundPaths],
                  ['Inbound chains', stats.inboundPaths],
                ].map(([label, val], i) => (
                  <div key={label} className={`flex items-center justify-between ${i < 3 ? 'border-b border-line pb-4' : ''}`}>
                    <span className="text-sm font-sans text-ink-soft">{label}</span>
                    <span className="font-mono text-lg font-semibold text-ink">{val}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm font-sans text-ink-faint">Trace an account to see its network.</p>
            )}
          </div>

          <div className="border border-line bg-surface rounded-xl p-6 transition-colors duration-200 ease-smooth hover:border-line-strong">
            <p className="text-xs font-sans font-semibold tracking-wider uppercase text-ink-faint mb-4">
              Investigation Queue
            </p>
            <div className="flex flex-col gap-2">
              {queueItems.length === 0 && (
                <p className="text-sm font-sans text-ink-faint">No cases in the queue.</p>
              )}
              {queueItems.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setInputValue(c.account_id); loadGraph(c.account_id, c.id) }}
                  className={`text-left px-4 py-3 rounded-lg border transition-all duration-200 ease-smooth ${
                    selectedQueueId === c.id
                      ? 'bg-navy/10 border-navy/30'
                      : 'border-transparent hover:bg-surface-hover hover:border-line'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-ink">{c.account_id}</span>
                    <span className="font-mono text-sm font-semibold text-ink">
                      {Math.round((c.risk_score ?? 0) * 100)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right column: controls + canvas ───────────────── */}
        <div className="flex flex-col gap-4">

          <form onSubmit={handleSubmit} className="border border-line bg-surface rounded-xl p-4 flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-[10px] font-sans font-semibold tracking-wider uppercase text-ink-faint mb-1.5">
                Account ID
              </label>
              <input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Enter an account ID…"
                className="w-full border border-line bg-paper px-3 py-2.5 text-sm font-mono text-ink focus:border-navy outline-none rounded-lg transition-colors duration-200 ease-smooth"
              />
            </div>
            <div>
              <label className="block text-[10px] font-sans font-semibold tracking-wider uppercase text-ink-faint mb-1.5">
                Hops
              </label>
              <select
                value={hops}
                onChange={(e) => setHops(Number(e.target.value))}
                className="border border-line bg-paper px-3 py-2.5 text-sm font-mono text-ink focus:border-navy outline-none rounded-lg transition-colors duration-200 ease-smooth"
              >
                {HOP_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <button
              type="submit"
              disabled={loading || !inputValue.trim()}
              className="text-sm font-sans font-medium px-5 py-2.5 bg-navy text-white hover:bg-navy-soft rounded-lg transition-all duration-200 ease-smooth disabled:opacity-50 hover:shadow-lg hover:shadow-navy/20"
            >
              {loading ? 'Tracing…' : 'Trace'}
            </button>
          </form>

          {error && (
            <div className="px-4 py-3 border border-tier-critical bg-tier-critical-bg rounded-lg">
              <p className="text-sm font-sans text-tier-critical">{error}</p>
            </div>
          )}

          {/* Canvas */}
          <div className="relative border border-line bg-surface rounded-xl h-[600px] overflow-hidden">
            <div ref={containerRef} className="w-full h-full" />

            {/* Zoom controls */}
            <div className="absolute top-4 right-4 flex flex-col gap-1 bg-surface-raised/80 backdrop-blur-sm border border-line rounded-xl p-1">
              {[
                ['zoom-in', () => zoomBy(1.25), <path key="a" d="M12 5v14M5 12h14"/>],
                ['zoom-out', () => zoomBy(0.8), <path key="b" d="M5 12h14"/>],
                ['fit', fitView, <path key="c" d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>],
                ['center', centerView, <><circle key="d1" cx="12" cy="12" r="3"/><path key="d2" d="M12 2v3M12 19v3M2 12h3M19 12h3"/></>],
                ['export', exportPng, <><rect key="e1" x="3" y="3" width="18" height="18" rx="2"/><circle key="e2" cx="8.5" cy="8.5" r="1.5"/><path key="e3" d="m21 15-5-5L5 21"/></>],
              ].map(([key, fn, icon]) => (
                <button
                  key={key}
                  onClick={fn}
                  className="w-8 h-8 flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-hover rounded-lg transition-all duration-200 ease-smooth"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{icon}</svg>
                </button>
              ))}
            </div>

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-surface-raised/90 backdrop-blur-sm border border-line rounded-xl p-4">
              <p className="text-[10px] font-sans font-semibold tracking-wider uppercase text-ink-faint mb-3">Legend</p>
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-2 text-xs font-sans text-ink-soft">
                  <span className="w-2.5 h-2.5 rounded-full bg-tier-critical" /> Outbound flow
                </span>
                <span className="flex items-center gap-2 text-xs font-sans text-ink-soft">
                  <span className="w-2.5 h-2.5 rounded-full bg-navy" /> Inbound flow
                </span>
                <span className="flex items-center gap-2 text-xs font-sans text-ink-soft">
                  <span className="w-2.5 h-2.5 rounded-full bg-white" /> Traced account
                </span>
              </div>
            </div>

            {/* Stats footer */}
            {stats && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 lg:left-[220px] lg:translate-x-0 flex items-center gap-4 text-xs font-mono text-ink-faint">
                <span>Hops: {hops}</span>
                <span>·</span>
                <span>Nodes: {stats.nodeCount}</span>
                <span>·</span>
                <span>Edges: {stats.edgeCount}</span>
              </div>
            )}

            {/* Expand next hop */}
            {stats && (
              <button
                onClick={() => setHops((h) => Math.min(h + 1, 5))}
                className="absolute bottom-4 right-4 flex items-center gap-2 text-sm font-sans font-medium px-4 py-2.5 bg-navy text-white hover:bg-navy-soft rounded-lg transition-all duration-200 ease-smooth hover:shadow-lg hover:shadow-navy/20"
              >
                Expand next hop
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
