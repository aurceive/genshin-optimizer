import type { LapicDangerZoneDetectionResult } from './danger-zone'

// ---------------------------------------------------------------------------
// Prune observer
// ---------------------------------------------------------------------------

/** Context provided to prune observers when a subtree is pruned. */
export interface LapicPruneEvent {
  readonly boundValue: string
  readonly boundEvidenceDigest: string
  readonly thresholdValue: string
  readonly domainIndex: number
  readonly dangerZoneDetection?: LapicDangerZoneDetectionResult | undefined
}

/**
 * Observer notified when a subtree is pruned by bound-and-bound.
 *
 * Production mode uses the null observer (zero overhead).
 * Audit mode uses a certifying observer that creates BoundPruneCerts.
 */
export interface LapicPruneObserver {
  onPrune(event: LapicPruneEvent): void
}

// ---------------------------------------------------------------------------
// Dominance observer
// ---------------------------------------------------------------------------

/** Context provided to dominance observers when a candidate is evicted. */
export interface LapicDominanceEvent {
  readonly dominatingStateId: string
  readonly dominatedStateId: string
  readonly dominatingEvidenceDigest: string
  readonly dominatedEvidenceDigest: string
  readonly signatureGroupKey: string
}

/**
 * Observer notified when a candidate is evicted from the top-N tracker
 * by a strictly better candidate (dominance).
 *
 * Production mode uses the null observer (zero overhead).
 * Audit mode uses a certifying observer that creates DominanceCerts.
 */
export interface LapicDominanceObserver {
  onEviction(event: LapicDominanceEvent): void
}

// ---------------------------------------------------------------------------
// Completion strategy
// ---------------------------------------------------------------------------

/** Collected certificate ID arrays from observers (audit mode only). */
export interface LapicObserverCertificateIds {
  readonly pruneCertificateIds: readonly string[]
  readonly branchReachabilityCertificateIds: readonly string[]
  readonly dominanceCertificateIds: readonly string[]
}

/**
 * Accessor for retrieving collected certificate IDs and flushing
 * any deferred persistence from observers.
 *
 * Production mode returns empty arrays and no-op flush.
 * Audit mode returns populated arrays and flushes pending persistence.
 */
export interface LapicObserverState {
  getCertificateIds(): LapicObserverCertificateIds
  flush(): Promise<void>
}

// ---------------------------------------------------------------------------
// Null (production) implementations — zero overhead
// ---------------------------------------------------------------------------

/** @internal */
const _nullPruneObserver: LapicPruneObserver = {
  onPrune() {},
}

/** @internal */
const _nullDominanceObserver: LapicDominanceObserver = {
  onEviction() {},
}

/** @internal */
const _emptyCertificateIds: LapicObserverCertificateIds = {
  pruneCertificateIds: [],
  branchReachabilityCertificateIds: [],
  dominanceCertificateIds: [],
}

/** @internal */
const _nullObserverState: LapicObserverState = {
  getCertificateIds: () => _emptyCertificateIds,
  flush: () => Promise.resolve(),
}

/**
 * Create a set of null (no-op) observers for production mode.
 * Zero allocation, zero branching in the hot loop.
 */
export function createNullObservers(): {
  pruneObserver: LapicPruneObserver
  dominanceObserver: LapicDominanceObserver
  observerState: LapicObserverState
} {
  return {
    pruneObserver: _nullPruneObserver,
    dominanceObserver: _nullDominanceObserver,
    observerState: _nullObserverState,
  }
}
