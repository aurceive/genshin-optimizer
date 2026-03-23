/**
 * Source Snapshot Packaging
 *
 * Per source-snapshot-packaging.md, every governed canonical problem
 * export must reference a SourceSnapshotPackageV1. This module defines
 * the canonical packaging model for adapter source snapshots.
 */

import type { LapicDigest } from '../identity'

// ---------------------------------------------------------------------------
// Payload entry classifications
// ---------------------------------------------------------------------------

/**
 * Per §4, each payload entry must be classified. Only the first five
 * classes may participate in canonical reconstruction.
 */
export type LapicSnapshotPayloadEntryClass =
  | 'inventorySnapshot'
  | 'entityStateSnapshot'
  | 'formulaDataSnapshot'
  | 'statTableSnapshot'
  | 'auxiliaryAdapterMetadata'
  | 'nonCanonicalDiagnosticAttachment'

/** A single entry in a snapshot package payload set. */
export interface LapicSnapshotPayloadEntry {
  readonly entryId: string
  readonly entryClass: LapicSnapshotPayloadEntryClass
  readonly contentDigest: LapicDigest
  readonly description?: string
}

/** Canonical payload entry classes (eligible for reconstruction). */
export const LAPIC_CANONICAL_PAYLOAD_CLASSES: readonly LapicSnapshotPayloadEntryClass[] =
  [
    'inventorySnapshot',
    'entityStateSnapshot',
    'formulaDataSnapshot',
    'statTableSnapshot',
    'auxiliaryAdapterMetadata',
  ]

export function isCanonicalPayloadEntry(
  entry: LapicSnapshotPayloadEntry
): boolean {
  return (LAPIC_CANONICAL_PAYLOAD_CLASSES as readonly string[]).includes(
    entry.entryClass
  )
}

// ---------------------------------------------------------------------------
// Package model (§3)
// ---------------------------------------------------------------------------

/**
 * The normative packaging unit per source-snapshot-packaging.md §3.
 * Every governed canonical problem export MUST reference one of these.
 */
export interface LapicSourceSnapshotPackageV1 {
  readonly packageKind: 'source-snapshot-package-v1'
  readonly packageVersion: string
  readonly adapterKind: string
  readonly adapterVersion: string
  readonly sourceSnapshotDigestSet: readonly LapicDigest[]
  readonly manifestDigest: LapicDigest
  readonly payloadEntrySet: readonly LapicSnapshotPayloadEntry[]
  readonly reconstructionHints: readonly string[]
  readonly packagingPolicyId: string
}

// ---------------------------------------------------------------------------
// Validation (§10 compliance checklist)
// ---------------------------------------------------------------------------

export interface LapicSnapshotPackageValidationResult {
  readonly valid: boolean
  readonly violations: readonly string[]
}

/**
 * Validate that a snapshot package conforms to the packaging policy.
 * Checks: required fields, canonical separation, digest coverage.
 */
export function validateSourceSnapshotPackage(
  pkg: LapicSourceSnapshotPackageV1
): LapicSnapshotPackageValidationResult {
  const violations: string[] = []

  if (pkg.packageKind !== 'source-snapshot-package-v1')
    violations.push(
      `packageKind must be 'source-snapshot-package-v1', got '${pkg.packageKind}'`
    )

  if (!pkg.packageVersion) violations.push('packageVersion must be non-empty')

  if (!pkg.adapterKind) violations.push('adapterKind must be non-empty')

  if (!pkg.adapterVersion) violations.push('adapterVersion must be non-empty')

  if (!pkg.manifestDigest) violations.push('manifestDigest must be non-empty')

  if (!pkg.packagingPolicyId)
    violations.push('packagingPolicyId must be non-empty')

  if (pkg.sourceSnapshotDigestSet.length === 0)
    violations.push('sourceSnapshotDigestSet must not be empty')

  if (pkg.payloadEntrySet.length === 0)
    violations.push('payloadEntrySet must not be empty')

  // §4: Verify every entry has a valid classification
  const validClasses: readonly string[] = [
    'inventorySnapshot',
    'entityStateSnapshot',
    'formulaDataSnapshot',
    'statTableSnapshot',
    'auxiliaryAdapterMetadata',
    'nonCanonicalDiagnosticAttachment',
  ]
  for (const entry of pkg.payloadEntrySet) {
    if (!validClasses.includes(entry.entryClass))
      violations.push(
        `Entry '${entry.entryId}' has invalid class '${entry.entryClass}'`
      )
  }

  // §2: Snapshot packaging MUST separate canonical from non-canonical
  const hasCanonical = pkg.payloadEntrySet.some((e) =>
    isCanonicalPayloadEntry(e)
  )
  if (!hasCanonical)
    violations.push('Package must contain at least one canonical payload entry')

  return { valid: violations.length === 0, violations }
}
