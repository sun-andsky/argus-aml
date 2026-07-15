/**
 * Legacy RiskBar — kept for backward compatibility. New code should use
 * ScoreBar (for numeric bars) or TierDot (for text tier labels) directly.
 * This wrapper delegates to ScoreBar so any older import still resolves.
 */
import ScoreBar from './ScoreBar'

export default function RiskBar({ score, tier }) {
  return <ScoreBar value={score} tier={tier} max={1} width="w-28" />
}
