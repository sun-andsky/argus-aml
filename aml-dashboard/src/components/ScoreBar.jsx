const TIER_COLORS = {
  CRITICAL: 'bg-tier-critical',
  HIGH: 'bg-tier-high',
  MEDIUM: 'bg-tier-medium',
  LOW: 'bg-tier-low',
}

/**
 * Thin track-and-fill risk bar with the numeric score beside it — matches
 * the Alert Queue table and Case Detail "Model Basis" bars. Distinct from
 * TierDot (used where a text label like "Critical" is shown instead of a
 * bar, e.g. My Cases risk column).
 */
export default function ScoreBar({ value, tier, colorClass, max = 1, width = 'w-32' }) {
  const pct = Math.round((value / max) * 100)
  const fillClass = colorClass || TIER_COLORS[tier] || 'bg-ink-faint'

  return (
    <div className="flex items-center gap-3">
      <div className={`h-1.5 ${width} bg-surface-raised rounded-full overflow-hidden`}>
        <div
          className={`h-full ${fillClass} rounded-full transition-[width] duration-500 ease-smooth`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-sm text-ink tabular-nums">
        {max === 1 ? value.toFixed(2) : Math.round(value)}
      </span>
    </div>
  )
}
