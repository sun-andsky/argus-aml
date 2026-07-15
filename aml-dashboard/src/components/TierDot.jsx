const TIER_COLORS = {
  CRITICAL: 'bg-tier-critical',
  HIGH: 'bg-tier-high',
  MEDIUM: 'bg-tier-medium',
  LOW: 'bg-tier-low',
}

const TIER_LABELS = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
}

/** Colored dot + text label — used where a risk TIER (not a numeric bar) is shown, e.g. My Cases. */
export default function TierDot({ tier }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-sans text-ink">
      <span className={`w-2 h-2 rounded-full ${TIER_COLORS[tier] || 'bg-ink-faint'}`} />
      {TIER_LABELS[tier] || tier}
    </span>
  )
}
