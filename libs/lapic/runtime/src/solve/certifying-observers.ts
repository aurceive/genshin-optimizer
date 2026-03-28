import {
  analyzeLapicFirGraph,
  inferForcedBranches,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicDominanceEvent,
  LapicDominanceObserver,
  LapicObserverCertificateIds,
  LapicObserverState,
  LapicPruneEvent,
  LapicPruneObserver,
} from './observers'
import {
  createBoundPruneCertificate,
  createBranchReachabilityCertificate,
  createDominanceCertificate,
} from './certificate'
import { buildDangerZoneRecord } from './danger-zone'
import { persistArtifact } from './persistence'
import type { LapicBoundedExactSolveOptions } from './types'

// ---------------------------------------------------------------------------
// Certifying prune observer
// ---------------------------------------------------------------------------

export function createCertifyingPruneObserver(
  options: LapicBoundedExactSolveOptions,
  frontierBlockIds: readonly string[],
  restoredIds: readonly string[] = []
): LapicPruneObserver & {
  getCertificateIds(): readonly string[]
  drainPendingPersistence(): Array<() => Promise<void>>
} {
  let stepCounter = restoredIds.length
  const certificateIds: string[] = [...restoredIds]
  let pendingPersistence: Array<() => Promise<void>> = []

  return {
    onPrune(event: LapicPruneEvent): void {
      stepCounter += 1
      const dangerZoneRecord = event.dangerZoneDetection
        ? buildDangerZoneRecord(event.dangerZoneDetection, false)
        : undefined
      const cert = createBoundPruneCertificate(options, {
        boundValue: event.boundValue,
        boundEvidenceDigest: event.boundEvidenceDigest,
        thresholdValue: event.thresholdValue,
        domainIndex: event.domainIndex,
        stepIndex: stepCounter,
        frontierBlockIds,
        ...(dangerZoneRecord !== undefined ? { dangerZoneRecord } : {}),
      })
      pendingPersistence.push(async () => {
        await persistArtifact(
          options,
          'certificate',
          cert.certId,
          cert.evidenceDigest,
          cert,
          frontierBlockIds
        )
      })
      options.controller.emitCertificate(cert)
      certificateIds.push(cert.certId)
    },
    getCertificateIds: () => certificateIds,
    drainPendingPersistence(): Array<() => Promise<void>> {
      const drained = pendingPersistence
      pendingPersistence = []
      return drained
    },
  }
}

// ---------------------------------------------------------------------------
// Certifying dominance observer
// ---------------------------------------------------------------------------

export function createCertifyingDominanceObserver(
  options: LapicBoundedExactSolveOptions,
  frontierBlockIds: readonly string[],
  restoredIds: readonly string[] = []
): LapicDominanceObserver & {
  getCertificateIds(): readonly string[]
  drainPendingPersistence(): Array<() => Promise<void>>
} {
  let stepCounter = restoredIds.length
  const certificateIds: string[] = [...restoredIds]
  let pendingPersistence: Array<() => Promise<void>> = []

  return {
    onEviction(event: LapicDominanceEvent): void {
      stepCounter += 1
      const cert = createDominanceCertificate(options, {
        dominatingStateId: event.dominatingStateId,
        dominatedStateId: event.dominatedStateId,
        dominatingEvidenceDigest: event.dominatingEvidenceDigest,
        dominatedEvidenceDigest: event.dominatedEvidenceDigest,
        signatureGroupKey: event.signatureGroupKey,
        stepIndex: stepCounter,
        frontierBlockIds,
      })
      pendingPersistence.push(async () => {
        await persistArtifact(
          options,
          'certificate',
          cert.certId,
          cert.evidenceDigest,
          cert,
          frontierBlockIds
        )
      })
      options.controller.emitCertificate(cert)
      certificateIds.push(cert.certId)
    },
    getCertificateIds: () => certificateIds,
    drainPendingPersistence(): Array<() => Promise<void>> {
      const drained = pendingPersistence
      pendingPersistence = []
      return drained
    },
  }
}

// ---------------------------------------------------------------------------
// Branch reachability (pre-solve static analysis)
// ---------------------------------------------------------------------------

export interface LapicBranchReachabilityResult {
  readonly branchReachabilityCertificateIds: readonly string[]
}

/**
 * Run A-IR branch reachability analysis and emit BranchReachabilityCerts.
 * Only meaningful in audit mode; production mode skips this entirely.
 */
export async function emitBranchReachabilityCertificates(
  options: LapicBoundedExactSolveOptions,
  frontierBlockIds: readonly string[]
): Promise<LapicBranchReachabilityResult> {
  const airGraph = analyzeLapicFirGraph(options.firGraph!)
  const forcedBranches = inferForcedBranches(airGraph)
  const certificateIds: string[] = []

  for (let i = 0; i < forcedBranches.length; i++) {
    const evidence = forcedBranches[i]!
    const branchCert = createBranchReachabilityCertificate(options, {
      branchNodeId: evidence.branchNodeId,
      guardNodeId: evidence.guardNodeId,
      forcedArm: evidence.forcedArm,
      ...(evidence.guardLower !== undefined
        ? { guardLower: evidence.guardLower }
        : {}),
      ...(evidence.guardUpper !== undefined
        ? { guardUpper: evidence.guardUpper }
        : {}),
      validityRegionId: evidence.parentRegionId,
      stepIndex: i + 1,
    })
    await persistArtifact(
      options,
      'certificate',
      branchCert.certId,
      branchCert.evidenceDigest,
      branchCert,
      frontierBlockIds
    )
    options.controller.emitCertificate(branchCert)
    certificateIds.push(branchCert.certId)
  }

  return { branchReachabilityCertificateIds: certificateIds }
}

// ---------------------------------------------------------------------------
// Composite observer state (audit mode)
// ---------------------------------------------------------------------------

/**
 * Observer with persistence access (used internally by certifying state).
 * `drainPendingPersistence()` returns and clears the pending queue,
 * so flush can be called incrementally without re-processing.
 */
interface CertifyingObserverWithPersistence {
  getCertificateIds(): readonly string[]
  drainPendingPersistence(): Array<() => Promise<void>>
}

/** Max concurrent persistence writes per flush chunk. */
const PERSISTENCE_CHUNK_SIZE = 256

/**
 * Create a composite observer state from certifying prune and dominance
 * observers plus optional branch reachability results.
 *
 * Persistence is flushed in chunks of {@link PERSISTENCE_CHUNK_SIZE} to
 * avoid overwhelming the I/O subsystem when thousands of certificates
 * are emitted in audit mode.
 */
export function createCertifyingObserverState(
  pruneObserver: CertifyingObserverWithPersistence,
  dominanceObserver: CertifyingObserverWithPersistence,
  branchReachabilityIds: readonly string[] = []
): LapicObserverState {
  return {
    getCertificateIds(): LapicObserverCertificateIds {
      return {
        pruneCertificateIds: pruneObserver.getCertificateIds(),
        branchReachabilityCertificateIds: branchReachabilityIds,
        dominanceCertificateIds: dominanceObserver.getCertificateIds(),
      }
    },
    async flush(): Promise<void> {
      const pending = [
        ...pruneObserver.drainPendingPersistence(),
        ...dominanceObserver.drainPendingPersistence(),
      ]
      for (let i = 0; i < pending.length; i += PERSISTENCE_CHUNK_SIZE) {
        const chunk = pending.slice(i, i + PERSISTENCE_CHUNK_SIZE)
        await Promise.all(chunk.map((fn) => fn()))
      }
    },
  }
}
