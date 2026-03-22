import type { LapicTraceEvent } from '@genshin-optimizer/lapic/runtime'

export function compareLapicTraceEvents(
  left: LapicTraceEvent,
  right: LapicTraceEvent
): number {
  const eventDigestComparison = left.eventDigest.localeCompare(
    right.eventDigest
  )
  if (eventDigestComparison !== 0) return eventDigestComparison

  const tagComparison = left.tag.localeCompare(right.tag)
  if (tagComparison !== 0) return tagComparison

  return left.sessionId.localeCompare(right.sessionId)
}
