// The live-clock badge, shared by every view so in-progress matches look the
// same everywhere. Shows ESPN's real clock (incl. stoppage like "45'+3'") and
// announces itself to screen readers. Renders nothing unless the match is live.
// Spoiler-free mode (hideScores) shows only LIVE: a minute like "90+3'" says the
// match went to stoppage time, and a badge that later reads "ET 105'" says it
// went to extra time, so no minute, period, or ESPN detail may appear.
export default function LiveBadge({ match, className = 'badge-live', hideScores = false }) {
  if (!match.live) return null
  const { clock, detail, delayed, label } = match.live
  // A paused match (delayed/weather or suspended) isn't playing — show it in
  // amber, not the red running clock, so it doesn't read as "in progress".
  if (delayed) {
    const word = label || 'Delayed'
    return (
      <span className="badge-delayed" role="status" aria-label={word} title={detail || word}>
        ⏸ {word}
      </span>
    )
  }
  if (hideScores) {
    return (
      <span className={className} role="status" aria-label="Live" title="Live">
        ● LIVE
      </span>
    )
  }
  return (
    <span className={className} role="status" aria-label={`Live${detail ? `, ${detail}` : ''}`} title={detail || 'Live'}>
      ● {clock || 'LIVE'}
    </span>
  )
}
