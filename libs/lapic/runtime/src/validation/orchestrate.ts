/**
 * Validators for the lapic solve orchestration layer.
 *
 * Covers:
 * - `LapicSolveOrchestrationConfig` — required fields and contracts
 * - `LapicOrchestrationState` — state enum membership
 * - `LapicOrchestrationOutcome` — state/outcome consistency
 * - Orchestration state transitions — legal lifecycle transitions
 */

import { createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicOrchestrationOutcome,
  LapicOrchestrationState,
  LapicSolveOrchestrationConfig,
} from '../orchestrate/types'
import { createRuntimeFailure, isNonEmptyString, isRecord } from './internal'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const lapicOrchestrationStates = [
  'created',
  'running',
  'completed',
  'paused',
  'failed',
  'cancelled',
] as const satisfies readonly LapicOrchestrationState[]

/**
 * Terminal states — no transitions allowed from these.
 */
export const lapicOrchestrationTerminalStates: ReadonlySet<LapicOrchestrationState> =
  new Set(['completed', 'paused', 'failed', 'cancelled'])

/**
 * Legal state transitions for orchestration lifecycle.
 *
 * created → running (start called)
 * running → completed | paused | failed | cancelled
 * Terminal states have no outgoing transitions.
 */
const legalOrchestrationTransitions: ReadonlyMap<
  LapicOrchestrationState,
  ReadonlySet<LapicOrchestrationState>
> = new Map([
  ['created', new Set(['running'])],
  ['running', new Set(['completed', 'paused', 'failed', 'cancelled'])],
  ['completed', new Set()],
  ['paused', new Set()],
  ['failed', new Set()],
  ['cancelled', new Set()],
])

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

/**
 * Validate a `LapicSolveOrchestrationConfig`.
 *
 * Checks:
 * - All required fields are present and non-empty
 * - `solveFn` is a function
 * - `artifactStore` has the required interface shape
 * - Optional `sessionId` is non-empty if provided
 */
export function validateLapicSolveOrchestrationConfig(
  config: LapicSolveOrchestrationConfig
): LapicValidationResult<LapicSolveOrchestrationConfig> {
  if (!isRecord(config))
    return createRuntimeFailure('Orchestration config must be a record.', [
      'orchestrationConfig',
    ])

  if (!isNonEmptyString(config.problemDigest))
    return createRuntimeFailure('Problem digest must be a non-empty string.', [
      'problemDigest',
    ])

  if (!isNonEmptyString(config.engineVersion))
    return createRuntimeFailure('Engine version must be a non-empty string.', [
      'engineVersion',
    ])

  if (!isNonEmptyString(config.arithmeticPolicyId))
    return createRuntimeFailure(
      'Arithmetic policy id must be a non-empty string.',
      ['arithmeticPolicyId']
    )

  if (!isRecord(config.artifactStore))
    return createRuntimeFailure('Artifact store must be a record.', [
      'artifactStore',
    ])

  if (
    typeof (config.artifactStore as Record<string, unknown>)['write'] !==
    'function'
  )
    return createRuntimeFailure('Artifact store must have a write method.', [
      'artifactStore',
      'write',
    ])

  if (
    typeof (config.artifactStore as Record<string, unknown>)['read'] !==
    'function'
  )
    return createRuntimeFailure('Artifact store must have a read method.', [
      'artifactStore',
      'read',
    ])

  if (typeof config.solveFn !== 'function')
    return createRuntimeFailure('Solve function must be a function.', [
      'solveFn',
    ])

  if (config.sessionId !== undefined && !isNonEmptyString(config.sessionId))
    return createRuntimeFailure(
      'Session id must be a non-empty string when provided.',
      ['sessionId']
    )

  return createLapicSuccessResult(config)
}

// ---------------------------------------------------------------------------
// State validation
// ---------------------------------------------------------------------------

/**
 * Validate that a value is a valid `LapicOrchestrationState`.
 */
export function validateLapicOrchestrationState(
  state: LapicOrchestrationState
): LapicValidationResult<LapicOrchestrationState> {
  if (
    !isNonEmptyString(state) ||
    !lapicOrchestrationStates.includes(state as LapicOrchestrationState)
  )
    return createRuntimeFailure(
      `Orchestration state must be one of: ${lapicOrchestrationStates.join(', ')}.`,
      ['orchestrationState']
    )

  return createLapicSuccessResult(state)
}

/**
 * Validate a state transition in the orchestration lifecycle.
 *
 * Returns success if the transition from `fromState` to `toState`
 * is legal according to the orchestration state machine.
 */
export function validateLapicOrchestrationStateTransition(
  fromState: LapicOrchestrationState,
  toState: LapicOrchestrationState
): LapicValidationResult<{
  from: LapicOrchestrationState
  to: LapicOrchestrationState
}> {
  const fromValidation = validateLapicOrchestrationState(fromState)
  if (!fromValidation.ok) return fromValidation

  const toValidation = validateLapicOrchestrationState(toState)
  if (!toValidation.ok) return toValidation

  const allowedTargets = legalOrchestrationTransitions.get(fromState)
  if (!allowedTargets || !allowedTargets.has(toState))
    return createRuntimeFailure(
      `Illegal orchestration state transition: ${fromState} → ${toState}.`,
      ['orchestrationStateTransition'],
      { from: fromState, to: toState }
    )

  return createLapicSuccessResult({ from: fromState, to: toState })
}

// ---------------------------------------------------------------------------
// Outcome validation
// ---------------------------------------------------------------------------

/**
 * Validate a `LapicOrchestrationOutcome`.
 *
 * Checks state/outcome consistency:
 * - `completed` and `paused` must have `solveOutcome`
 * - `failed` must have `error`
 * - `created` and `running` must not appear in outcomes
 */
export function validateLapicOrchestrationOutcome(
  outcome: LapicOrchestrationOutcome
): LapicValidationResult<LapicOrchestrationOutcome> {
  if (!isRecord(outcome))
    return createRuntimeFailure('Orchestration outcome must be a record.', [
      'orchestrationOutcome',
    ])

  const stateValidation = validateLapicOrchestrationState(outcome.state)
  if (!stateValidation.ok) return stateValidation

  // Outcomes should only be terminal states
  if (!lapicOrchestrationTerminalStates.has(outcome.state))
    return createRuntimeFailure(
      `Orchestration outcome state must be terminal (one of: ${[...lapicOrchestrationTerminalStates].join(', ')}), got '${outcome.state}'.`,
      ['orchestrationOutcome', 'state']
    )

  // State/content consistency
  if (outcome.state === 'completed') {
    if (!outcome.solveOutcome)
      return createRuntimeFailure(
        'Completed outcome must include solveOutcome.',
        ['orchestrationOutcome', 'solveOutcome']
      )
    if (outcome.error)
      return createRuntimeFailure('Completed outcome must not include error.', [
        'orchestrationOutcome',
        'error',
      ])
  }

  if (outcome.state === 'paused') {
    if (!outcome.solveOutcome)
      return createRuntimeFailure('Paused outcome must include solveOutcome.', [
        'orchestrationOutcome',
        'solveOutcome',
      ])
    if (outcome.error)
      return createRuntimeFailure('Paused outcome must not include error.', [
        'orchestrationOutcome',
        'error',
      ])
  }

  if (outcome.state === 'failed') {
    if (!outcome.error)
      return createRuntimeFailure('Failed outcome must include error.', [
        'orchestrationOutcome',
        'error',
      ])
  }

  if (outcome.state === 'cancelled') {
    if (outcome.error)
      return createRuntimeFailure('Cancelled outcome must not include error.', [
        'orchestrationOutcome',
        'error',
      ])
  }

  return createLapicSuccessResult(outcome)
}
