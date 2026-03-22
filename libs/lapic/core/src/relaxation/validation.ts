import type { LapicValidationResult } from '../types'
import type {
  LapicConstraintSystem,
  LapicLinearConstraint,
  LapicLinearModel,
  LapicLinearObjective,
  LapicLinearVariable,
  LapicObjectiveSystem,
  LapicRelaxationArtifact,
  LapicRelaxationKind,
  LapicRelaxationValidityDomain,
  LapicRelaxationVerificationStatus,
  LapicVariableBasis,
  LapicVariableBasisKind,
} from './types'

const VALID_RELAXATION_KINDS: readonly LapicRelaxationKind[] = [
  'IntervalRelax',
  'AffineRelax',
  'McCormickRelax',
  'PiecewiseLinearRelax',
  'LinearProgramRelax',
]

const VALID_VERIFICATION_STATUSES: readonly LapicRelaxationVerificationStatus[] =
  ['unverified', 'admissibility-checked', 'danger-zone-escalated', 'rejected']

const VALID_BASIS_KINDS: readonly LapicVariableBasisKind[] = [
  'original-feature',
  'affine-reduced',
  'region-local-lifted',
  'join-level-aggregate',
]

function fail(message: string): LapicValidationResult<never> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code: 'SchemaViolation', message }],
  }
}

function succeed<T>(value: T): LapicValidationResult<T> {
  return { ok: true, value, diagnostics: [] }
}

export function validateRelaxationKind(
  kind: string
): LapicValidationResult<LapicRelaxationKind> {
  if (!VALID_RELAXATION_KINDS.includes(kind as LapicRelaxationKind))
    return fail(
      `Invalid relaxation kind '${kind}'. Expected one of: ${VALID_RELAXATION_KINDS.join(', ')}`
    )
  return succeed(kind as LapicRelaxationKind)
}

export function validateVariableBasis(
  basis: LapicVariableBasis
): LapicValidationResult<LapicVariableBasis> {
  if (!VALID_BASIS_KINDS.includes(basis.basisKind))
    return fail(
      `Invalid variable basis kind '${basis.basisKind}'. Expected one of: ${VALID_BASIS_KINDS.join(', ')}`
    )
  if (!Array.isArray(basis.variableIds) || basis.variableIds.length === 0)
    return fail('Variable basis must declare at least one variable')
  const seen = new Set<string>()
  for (const id of basis.variableIds) {
    if (typeof id !== 'string' || id.length === 0)
      return fail('Variable ID must be a non-empty string')
    if (seen.has(id)) return fail(`Duplicate variable ID in basis: '${id}'`)
    seen.add(id)
  }
  return succeed(basis)
}

export function validateValidityDomain(
  domain: LapicRelaxationValidityDomain
): LapicValidationResult<LapicRelaxationValidityDomain> {
  if (typeof domain.activePartitionDigest !== 'string')
    return fail('Validity domain must have an activePartitionDigest')
  if (!Array.isArray(domain.branchRegionPredicates))
    return fail('Validity domain must have branchRegionPredicates array')
  if (typeof domain.exactVariableBoundsDigest !== 'string')
    return fail('Validity domain must have an exactVariableBoundsDigest')
  if (!Array.isArray(domain.categoricalAssumptions))
    return fail('Validity domain must have categoricalAssumptions array')
  if (!Array.isArray(domain.compatibilityConstraintDigests))
    return fail('Validity domain must have compatibilityConstraintDigests array')
  return succeed(domain)
}

export function validateLinearVariable(
  v: LapicLinearVariable
): LapicValidationResult<LapicLinearVariable> {
  if (typeof v.variableIndex !== 'number' || v.variableIndex < 0)
    return fail('Variable index must be a non-negative number')
  if (typeof v.name !== 'string' || v.name.length === 0)
    return fail('Variable name must be a non-empty string')
  if (typeof v.lowerBound !== 'number')
    return fail('Variable lowerBound must be a number')
  if (typeof v.upperBound !== 'number')
    return fail('Variable upperBound must be a number')
  if (v.lowerBound > v.upperBound)
    return fail(
      `Variable '${v.name}' has infeasible bounds: [${v.lowerBound}, ${v.upperBound}]`
    )
  return succeed(v)
}

export function validateLinearConstraint(
  c: LapicLinearConstraint
): LapicValidationResult<LapicLinearConstraint> {
  if (typeof c.constraintId !== 'string' || c.constraintId.length === 0)
    return fail('Constraint ID must be a non-empty string')
  if (
    !Array.isArray(c.coefficients) ||
    !Array.isArray(c.variableIndices) ||
    c.coefficients.length !== c.variableIndices.length
  )
    return fail('Constraint coefficients and variableIndices must be arrays of equal length')
  if (c.coefficients.length === 0)
    return fail('Constraint must have at least one coefficient')
  if (typeof c.lowerBound !== 'number' || typeof c.upperBound !== 'number')
    return fail('Constraint bounds must be numbers')
  if (c.lowerBound > c.upperBound)
    return fail(
      `Constraint '${c.constraintId}' has infeasible bounds: [${c.lowerBound}, ${c.upperBound}]`
    )
  return succeed(c)
}

export function validateLinearObjective(
  obj: LapicLinearObjective
): LapicValidationResult<LapicLinearObjective> {
  if (obj.sense !== 'minimize' && obj.sense !== 'maximize')
    return fail(`Objective sense must be 'minimize' or 'maximize', got '${obj.sense}'`)
  if (
    !Array.isArray(obj.coefficients) ||
    !Array.isArray(obj.variableIndices) ||
    obj.coefficients.length !== obj.variableIndices.length
  )
    return fail(
      'Objective coefficients and variableIndices must be arrays of equal length'
    )
  if (typeof obj.offset !== 'number')
    return fail('Objective offset must be a number')
  return succeed(obj)
}

export function validateLinearModel(
  model: LapicLinearModel
): LapicValidationResult<LapicLinearModel> {
  if (typeof model.modelDigest !== 'string' || model.modelDigest.length === 0)
    return fail('Linear model must have a non-empty modelDigest')
  if (!Array.isArray(model.variables) || model.variables.length === 0)
    return fail('Linear model must have at least one variable')
  for (const v of model.variables) {
    const r = validateLinearVariable(v)
    if (!r.ok) return r as LapicValidationResult<never>
  }
  const indexSet = new Set(model.variables.map((v) => v.variableIndex))
  if (indexSet.size !== model.variables.length)
    return fail('Linear model has duplicate variable indices')
  for (const c of model.constraints) {
    const r = validateLinearConstraint(c)
    if (!r.ok) return r as LapicValidationResult<never>
    for (const idx of c.variableIndices) {
      if (!indexSet.has(idx))
        return fail(
          `Constraint '${c.constraintId}' references undefined variable index ${idx}`
        )
    }
  }
  const objResult = validateLinearObjective(model.objective)
  if (!objResult.ok) return objResult as LapicValidationResult<never>
  for (const idx of model.objective.variableIndices) {
    if (!indexSet.has(idx))
      return fail(`Objective references undefined variable index ${idx}`)
  }
  return succeed(model)
}

export function validateRelaxationArtifact(
  artifact: LapicRelaxationArtifact
): LapicValidationResult<LapicRelaxationArtifact> {
  if (typeof artifact.relaxId !== 'string' || artifact.relaxId.length === 0)
    return fail('Relaxation artifact must have a non-empty relaxId')
  const kindResult = validateRelaxationKind(artifact.relaxationKind)
  if (!kindResult.ok) return kindResult as LapicValidationResult<never>
  if (
    !VALID_VERIFICATION_STATUSES.includes(artifact.verificationStatus)
  )
    return fail(
      `Invalid verification status '${artifact.verificationStatus}'`
    )
  const basisResult = validateVariableBasis(artifact.variableBasis)
  if (!basisResult.ok) return basisResult as LapicValidationResult<never>
  const domainResult = validateValidityDomain(artifact.validityDomain)
  if (!domainResult.ok) return domainResult as LapicValidationResult<never>
  if (
    typeof artifact.constraintSystem?.constraintCount !== 'number' ||
    typeof artifact.constraintSystem?.constraintDigest !== 'string'
  )
    return fail('Relaxation artifact must have a valid constraintSystem')
  if (
    typeof artifact.objectiveSystem?.objectiveDigest !== 'string' ||
    (artifact.objectiveSystem?.sense !== 'minimize' &&
      artifact.objectiveSystem?.sense !== 'maximize')
  )
    return fail('Relaxation artifact must have a valid objectiveSystem')
  if (artifact.boundDirection !== 'lower' && artifact.boundDirection !== 'upper')
    return fail(`Bound direction must be 'lower' or 'upper'`)
  if (
    artifact.relaxationKind === 'LinearProgramRelax' &&
    !artifact.providerProfileId
  )
    return fail('LinearProgramRelax artifacts must declare a providerProfileId')
  return succeed(artifact)
}
