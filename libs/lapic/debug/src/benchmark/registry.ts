/**
 * Benchmark Corpus Registry
 *
 * Per benchmark-fixture-layout.md, every benchmark case is tracked
 * in a governed corpus registry with deterministic fixture mappings.
 * This module defines the registry record types, versioning policy,
 * and validation for corpus entries.
 */

import type { LapicDiagnostic } from '@genshin-optimizer/lapic/core'

// ---------------------------------------------------------------------------
// Registry record
// ---------------------------------------------------------------------------

/**
 * A single case in the benchmark corpus registry.
 * Each case pins: suite membership, fixture digests, adapter version,
 * and gating classification.
 */
export interface LapicBenchmarkCorpusRecord {
  readonly caseId: string
  readonly suiteId: string
  readonly corpusVersion: string
  readonly ownerRole: LapicBenchmarkOwnerRole
  readonly gameScope: LapicBenchmarkGameScope
  readonly fixtureDigestSet: readonly string[]
  readonly problemDigest: string
  readonly adapterVersion: string
  readonly runtimeProfileClass: LapicBenchmarkProfileClass
  readonly arithmeticPolicyId: string
  readonly validationClass: LapicBenchmarkValidationClass
  readonly caseStatus: LapicBenchmarkCaseStatus
  readonly introducedInVersion: string
  readonly deprecatedInVersion?: string
  readonly provenanceNote?: string
}

export type LapicBenchmarkOwnerRole =
  | 'benchmarkGovernanceOwner'
  | 'fixtureMaintainer'
  | 'reportPublisher'
  | 'regressionTriageOwner'

export type LapicBenchmarkGameScope =
  | 'gi'
  | 'sr'
  | 'zzz'
  | 'synthetic'
  | 'adversarial'

export type LapicBenchmarkProfileClass =
  | 'public'
  | 'internalGating'
  | 'exploratory'

export type LapicBenchmarkValidationClass =
  | 'goldenEnumeration'
  | 'differentialEngine'
  | 'schemaValidation'
  | 'propertyBased'
  | 'replayReconstruction'

export type LapicBenchmarkCaseStatus = 'active' | 'deprecated' | 'suspended'

// ---------------------------------------------------------------------------
// Corpus versioning
// ---------------------------------------------------------------------------

export type LapicCorpusChangeClass =
  | 'appendOnlyMinor'
  | 'governancePatch'
  | 'breakingMajor'

export interface LapicCorpusVersionDescriptor {
  readonly version: string
  readonly changeClass: LapicCorpusChangeClass
  readonly previousVersion?: string
  readonly description: string
  readonly addedCases: readonly string[]
  readonly removedCases: readonly string[]
  readonly modifiedCases: readonly string[]
}

/**
 * Determine the change class for a corpus version transition.
 * - appendOnlyMinor: only additions, no removals or modifications
 * - governancePatch: only metadata corrections, same fixtures
 * - breakingMajor: removals, replacements, or redefinitions
 */
export function classifyCorpusChange(
  descriptor: LapicCorpusVersionDescriptor
): LapicCorpusChangeClass {
  if (descriptor.removedCases.length > 0) return 'breakingMajor'
  if (descriptor.modifiedCases.length > 0) return 'breakingMajor'
  if (descriptor.addedCases.length > 0) return 'appendOnlyMinor'
  return 'governancePatch'
}

// ---------------------------------------------------------------------------
// Fixture manifest
// ---------------------------------------------------------------------------

/** Tracks a single fixture's identity and integrity digest. */
export interface LapicFixtureManifestEntry {
  readonly fixtureId: string
  readonly gameScope: LapicBenchmarkGameScope
  readonly suiteClass: LapicBenchmarkProfileClass
  readonly contentDigest: string
  readonly generatorVersion?: string
  readonly generatorSeed?: string
}

/** Top-level fixture manifest for a benchmark directory. */
export interface LapicFixtureManifest {
  readonly corpusVersion: string
  readonly entries: readonly LapicFixtureManifestEntry[]
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateLapicBenchmarkCorpusRecord(
  record: unknown
):
  | { ok: true; value: LapicBenchmarkCorpusRecord }
  | { ok: false; diagnostics: LapicDiagnostic[] } {
  if (typeof record !== 'object' || record === null)
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'InvalidInput',
          message: 'Corpus record must be an object',
        },
      ],
    }

  const r = record as Record<string, unknown>
  const diagnostics: LapicDiagnostic[] = []

  if (typeof r['caseId'] !== 'string' || r['caseId'].length === 0)
    diagnostics.push({
      severity: 'error',
      code: 'InvalidInput',
      message: 'caseId must be a non-empty string',
      path: ['caseId'],
    })

  if (typeof r['suiteId'] !== 'string' || r['suiteId'].length === 0)
    diagnostics.push({
      severity: 'error',
      code: 'InvalidInput',
      message: 'suiteId must be a non-empty string',
      path: ['suiteId'],
    })

  if (typeof r['corpusVersion'] !== 'string')
    diagnostics.push({
      severity: 'error',
      code: 'InvalidInput',
      message: 'corpusVersion must be a string',
      path: ['corpusVersion'],
    })

  if (typeof r['problemDigest'] !== 'string')
    diagnostics.push({
      severity: 'error',
      code: 'InvalidInput',
      message: 'problemDigest must be a string',
      path: ['problemDigest'],
    })

  const validStatuses: LapicBenchmarkCaseStatus[] = [
    'active',
    'deprecated',
    'suspended',
  ]
  if (!validStatuses.includes(r['caseStatus'] as LapicBenchmarkCaseStatus))
    diagnostics.push({
      severity: 'error',
      code: 'InvalidInput',
      message: `caseStatus must be one of: ${validStatuses.join(', ')}`,
      path: ['caseStatus'],
    })

  if (diagnostics.length > 0) return { ok: false, diagnostics }
  return { ok: true, value: r as unknown as LapicBenchmarkCorpusRecord }
}
