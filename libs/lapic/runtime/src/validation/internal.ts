import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import {
  hasUniqueValues,
  isBoolean,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
} from '@genshin-optimizer/lapic/core/validation'
import { createLapicArtifactRefKey } from '@genshin-optimizer/lapic/storage'
import type { LapicArtifactRef } from '@genshin-optimizer/lapic/storage'
import type {
  LapicActivePhase,
  LapicDeterminismClass,
  LapicFailureClass,
  LapicInternalSolveState,
  LapicSolveState,
  LapicWorkUnitKind,
  LapicWorkerBackendKind,
  LapicWorkerProtocolMessageTag,
} from '../types'

export const lapicInternalSolveStates = [
  'created',
  'initializing',
  'frontier-building',
  'search-running',
  'pausing',
  'paused',
  'checkpointing',
  'resuming',
  'finalizing',
  'completed',
  'cancelled',
  'failed',
] as const satisfies readonly LapicInternalSolveState[]

export const lapicSolveStates = [
  'created',
  'active',
  'pausing',
  'paused',
  'checkpointing',
  'resuming',
  'finalizing',
  'completed',
  'cancelled',
  'failed',
] as const satisfies readonly LapicSolveState[]

export const lapicActivePhases = [
  'analyze',
  'frontier-build',
  'join',
  'resolve-residual',
  'validate-certificate',
  'persist',
] as const satisfies readonly LapicActivePhase[]

export const lapicWorkUnitKinds = [
  'AnalyzeRegion',
  'BuildFrontierBlock',
  'CompactFrontierBlock',
  'JoinFrontierBlocks',
  'ResolveResidualExact',
  'ValidateCertificate',
  'PersistArtifact',
  'ReloadArtifact',
  'SolvePartition',
] as const satisfies readonly LapicWorkUnitKind[]

export const lapicDeterminismClasses = [
  'pure-deterministic',
  'provider-verified',
] as const satisfies readonly LapicDeterminismClass[]

export const lapicWorkerBackendKinds = [
  'browser-worker',
  'node-worker',
  'in-process',
] as const satisfies readonly LapicWorkerBackendKind[]

export const lapicWorkerProtocolMessageTags = [
  'InitSession',
  'LoadArtifacts',
  'StartWork',
  'PauseAtSafePoint',
  'PublishArtifacts',
  'EmitCertificate',
  'ReportFailure',
  'AcknowledgeCheckpoint',
  'Shutdown',
] as const satisfies readonly LapicWorkerProtocolMessageTag[]

export const lapicFailureClasses = [
  'protocolFailure',
  'storageIntegrityFailure',
  'arithmeticVerificationFailure',
  'providerFailure',
  'workerFailure',
  'schemaCompatibilityFailure',
  'checkpointClosureFailure',
] as const satisfies readonly LapicFailureClass[]

export {
  hasUniqueValues,
  isBoolean,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
}

export function createRuntimeFailure<T>(
  message: string,
  path?: readonly string[],
  details?: Readonly<Record<string, string | number | boolean | null>>
): LapicValidationResult<T> {
  return createLapicFailureResult([
    createLapicDiagnostic('error', 'SchemaViolation', message, path, details),
  ])
}

export function validateArtifactRefs(
  artifactRefs: readonly LapicArtifactRef[],
  path: readonly string[]
): LapicValidationResult<readonly LapicArtifactRef[]> {
  if (!Array.isArray(artifactRefs))
    return createRuntimeFailure('Artifact refs must be an array.', path)

  const keys = artifactRefs.map(createLapicArtifactRefKey)
  if (!hasUniqueValues(keys))
    return createRuntimeFailure('Artifact refs must be unique.', path)

  if (
    artifactRefs.some(
      (artifactRef) =>
        !isNonEmptyString(artifactRef.artifactId) ||
        !isNonEmptyString(artifactRef.contentHash)
    )
  )
    return createRuntimeFailure(
      'Artifact refs must contain non-empty ids and content hashes.',
      path
    )

  return createLapicSuccessResult(artifactRefs)
}
