/**
 * GI Team-Level Canonical Problem Builder (§3–§8)
 *
 * Wires all team-level components — layout (§3), exclusivity (§4.3),
 * team context (§4.2/§4.4), composition (§7.1), and compatibility
 * rules (§5.2) — into a single `LapicCanonicalProblem` suitable for
 * multi-slot join-phase optimization.
 *
 * The top-level entry point is `buildGiTeamCanonicalProblem()`.
 */

import type {
  LapicAdapterMetadata,
  LapicArithmeticPolicyId,
  LapicAuxiliaryOutputDescriptor,
  LapicCanonicalConstraint,
  LapicCanonicalObjective,
  LapicCanonicalProblem,
  LapicCandidateDomain,
  LapicCompatibilitySignatureSchemaVersion,
  LapicDigest,
  LapicEngineVersion,
  LapicFrameDescriptor,
  LapicOrderingPolicy,
  LapicPotentialConfiguration,
  LapicProblemDigest,
  LapicProblemId,
  LapicSlotCandidateProvenance,
  LapicSlotId,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
  lapicCompatibilitySignatureSchemaVersion,
} from '@genshin-optimizer/lapic/core'
import { createGiExclusiveClaimsForSlot } from './exclusivity'
import type { GiSlotEquipmentInput } from './exclusivity'
import { createGiTeamCompatibilityRules } from './team-context'
import type { GiTeamLayoutInput, GiTeamSlotInput } from './team-layout'
import {
  GI_TEAM_SLOT_IDS,
  createGiSharedTeamContext,
  createGiSlotDescriptors,
  createGiTeamLayoutDescriptor,
} from './team-layout'

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Per-slot input combining layout + equipment information. */
export interface GiTeamSlotFullInput {
  /** Layout-level slot configuration. */
  readonly layout: GiTeamSlotInput
  /** Equipment for exclusivity claims (character, artifacts, weapon). */
  readonly equipment: GiSlotEquipmentInput
  /** Per-slot candidate domain (pre-projected). */
  readonly candidateDomain: LapicCandidateDomain
  /** Per-slot provenance. */
  readonly provenance: LapicSlotCandidateProvenance
}

/** Identity fields for the canonical problem. */
export interface GiTeamCanonicalIdentity {
  readonly problemId: LapicProblemId
  readonly problemDigest: LapicProblemDigest
  readonly engineVersion: LapicEngineVersion
  readonly arithmeticPolicyId: LapicArithmeticPolicyId
}

/** Full input for building a GI team canonical problem. */
export interface GiTeamCanonicalProblemInput {
  /** Canonical identity fields. */
  readonly identity: GiTeamCanonicalIdentity
  /** Per-slot full inputs (1–4 slots). */
  readonly slots: readonly GiTeamSlotFullInput[]
  /** Team-level layout configuration (environment, semantic mode, etc.). */
  readonly teamConfig: Omit<GiTeamLayoutInput, 'slots'>
  /** Team-level objective (produced by composition factories). */
  readonly objective: LapicCanonicalObjective
  /** Constraints to enforce. */
  readonly constraints: readonly LapicCanonicalConstraint[]
  /** Top-N results to keep. */
  readonly topN: number
  /** Result ordering policy. */
  readonly orderingPolicy: LapicOrderingPolicy
  /** Adapter metadata. */
  readonly adapterMetadata: LapicAdapterMetadata
  /** Frame axis descriptors (defaults to empty). */
  readonly frameAxis?: readonly LapicFrameDescriptor[]
  /** Potential configuration (optional). */
  readonly potentialConfiguration?: LapicPotentialConfiguration
  /** Auxiliary outputs (defaults to empty). */
  readonly auxiliaryOutputs?: readonly LapicAuxiliaryOutputDescriptor[]
  /** Team layout digest for provenance. */
  readonly teamLayoutDigest: LapicDigest
  /** Shared team context digest for provenance. */
  readonly sharedTeamContextDigest: LapicDigest
  /** Frame axis digest for provenance. */
  readonly frameAxisDigest?: LapicDigest
  /**
   * Cross-slot rule descriptor version for provenance.
   * @default 'gi:cross-slot-rules:v1'
   */
  readonly crossSlotRuleDescriptorVersion?: string
  /**
   * Compatibility signature schema version for provenance.
   * @default 'v1'
   */
  readonly compatibilitySignatureSchemaVersion?: LapicCompatibilitySignatureSchemaVersion
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateSlots(
  slots: readonly GiTeamSlotFullInput[]
): LapicValidationResult<void> {
  if (slots.length === 0 || slots.length > 4) {
    return createLapicFailureResult([
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        `GI team must have 1–4 slots, got ${slots.length}.`,
        ['slots']
      ),
    ])
  }

  const seenSlotIndices = new Set<number>()
  for (const slot of slots) {
    const idx = slot.layout.slotIndex
    if (idx < 0 || idx > 3) {
      return createLapicFailureResult([
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          `Slot index ${idx} is out of range (0–3).`,
          ['slots', String(idx)]
        ),
      ])
    }
    if (seenSlotIndices.has(idx)) {
      return createLapicFailureResult([
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          `Duplicate slot index ${idx}.`,
          ['slots', String(idx)]
        ),
      ])
    }
    seenSlotIndices.add(idx)
  }

  return createLapicSuccessResult(undefined)
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a complete `LapicCanonicalProblem` for a GI multi-character team.
 *
 * Wires together:
 * - Team layout descriptor (§3.1–3.6)
 * - Slot descriptors (§3.3)
 * - Shared team context (§3.5)
 * - Exclusive resource claims & actor uniqueness (§4.3, §5.2)
 * - Compatibility rules (§5.2)
 * - Provenance chain (§8.1)
 */
export function buildGiTeamCanonicalProblem(
  input: GiTeamCanonicalProblemInput
): LapicValidationResult<LapicCanonicalProblem> {
  // Validate slots
  const validation = validateSlots(input.slots)
  if (!validation.ok) return validation as LapicValidationResult<never>

  // Assemble layout input
  const layoutInput: GiTeamLayoutInput = {
    slots: input.slots.map((s) => s.layout),
    ...input.teamConfig,
  }

  // Core descriptors
  const teamLayout = createGiTeamLayoutDescriptor(layoutInput)
  const slotDescriptors = createGiSlotDescriptors(layoutInput)
  const sharedTeamContext = createGiSharedTeamContext(layoutInput)
  const compatibilityRules = createGiTeamCompatibilityRules()

  // Collect candidate domains and provenance, enriched with claims
  const itemDomains: LapicCandidateDomain[] = []
  const slotProvenance: LapicSlotCandidateProvenance[] = []

  for (const slot of input.slots) {
    const slotId = GI_TEAM_SLOT_IDS[slot.layout.slotIndex] as LapicSlotId
    const claims = createGiExclusiveClaimsForSlot(slot.equipment)

    // Push candidate domain as-is (pre-projected by caller)
    itemDomains.push(slot.candidateDomain)

    // Enrich provenance with exclusive resource claims
    slotProvenance.push({
      ...slot.provenance,
      slotId,
      exclusiveResourceClaims: claims.resourceClaims,
    })
  }

  const problem: LapicCanonicalProblem = {
    problemId: input.identity.problemId,
    problemDigest: input.identity.problemDigest,
    engineVersion: input.identity.engineVersion,
    arithmeticPolicyId: input.identity.arithmeticPolicyId,
    teamLayout,
    slotDescriptors,
    sharedTeamContext,
    frameAxis: input.frameAxis ?? [],
    itemDomains,
    compatibilityRules,
    objective: input.objective,
    constraints: input.constraints,
    topN: input.topN,
    orderingPolicy: input.orderingPolicy,
    ...(input.potentialConfiguration !== undefined
      ? { potentialConfiguration: input.potentialConfiguration }
      : {}),
    auxiliaryOutputs: input.auxiliaryOutputs ?? [],
    adapterMetadata: input.adapterMetadata,
    provenance: {
      teamLayoutDigest: input.teamLayoutDigest,
      sharedTeamContextDigest: input.sharedTeamContextDigest,
      ...(input.frameAxisDigest !== undefined
        ? { frameAxisDigest: input.frameAxisDigest }
        : {}),
      crossSlotRuleDescriptorVersion:
        input.crossSlotRuleDescriptorVersion ?? 'gi:cross-slot-rules:v1',
      compatibilitySignatureSchemaVersion:
        input.compatibilitySignatureSchemaVersion ??
        lapicCompatibilitySignatureSchemaVersion,
      slotProvenance,
    },
  }

  return createLapicSuccessResult(problem)
}
