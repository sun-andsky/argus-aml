const STATUS_STYLES = {
  open: { label: 'Open', text: 'text-navy-soft', bg: 'bg-tier-medium-bg', border: 'border-tier-medium-border' },
  under_review: { label: 'Under Review', text: 'text-tier-high', bg: 'bg-tier-high-bg', border: 'border-tier-high-border' },
  escalated: { label: 'Escalated', text: 'text-tier-critical', bg: 'bg-tier-critical-bg', border: 'border-tier-critical-border' },
  cleared: { label: 'Closed', text: 'text-tier-low', bg: 'bg-tier-low-bg', border: 'border-tier-low-border' },
  closed: { label: 'Closed', text: 'text-tier-low', bg: 'bg-tier-low-bg', border: 'border-tier-low-border' },
  confirmed_sar: { label: 'Filed', text: 'text-tier-low', bg: 'bg-tier-low-bg', border: 'border-tier-low-border' },
  filed: { label: 'Filed', text: 'text-tier-low', bg: 'bg-tier-low-bg', border: 'border-tier-low-border' },
  pending: { label: 'Pending Review', text: 'text-tier-high', bg: 'bg-tier-high-bg', border: 'border-tier-high-border' },
  draft: { label: 'Draft', text: 'text-navy-soft', bg: 'bg-tier-medium-bg', border: 'border-tier-medium-border' },
}

/**
 * Reusable status pill — every table in the app routes through this so
 * status colors/hover behavior stay identical everywhere. Falls back to
 * a neutral style for any status string not in the map, rather than
 * silently rendering nothing.
 */
export default function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || {
    label: status, text: 'text-ink-soft', bg: 'bg-surface-raised', border: 'border-line',
  }

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-sans font-medium border ${style.bg} ${style.text} ${style.border} transition-all duration-200 ease-smooth hover:brightness-110 hover:scale-[1.03]`}
    >
      {style.label}
    </span>
  )
}
