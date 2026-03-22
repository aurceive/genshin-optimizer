import { createLapicMemoryArtifactStore } from '@genshin-optimizer/lapic/storage'
import type {
  LapicOrchestrationOutcome,
  LapicOrchestrationState,
  LapicSolveOrchestrationConfig,
} from '../orchestrate/types'
import {
  lapicOrchestrationStates,
  lapicOrchestrationTerminalStates,
  validateLapicOrchestrationOutcome,
  validateLapicOrchestrationState,
  validateLapicOrchestrationStateTransition,
  validateLapicSolveOrchestrationConfig,
} from './orchestrate'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createValidConfig(
  overrides: Partial<LapicSolveOrchestrationConfig> = {}
): LapicSolveOrchestrationConfig {
  return {
    problemDigest: 'test-problem-digest',
    engineVersion: '0.1.0-draft',
    arithmeticPolicyId: 'ieee754-double',
    artifactStore: createLapicMemoryArtifactStore(),
    solveFn: async (controller) => controller.complete(),
    ...overrides,
  }
}

function createValidOutcome(
  overrides: Partial<LapicOrchestrationOutcome> = {}
): LapicOrchestrationOutcome {
  return {
    state: 'completed',
    solveOutcome: {
      summary: {
        identity: {
          sessionId: 's1',
          problemDigest: 'p1',
          engineVersion: 'v1',
          arithmeticPolicyId: 'a1',
          runtimeProtocolVersion: '0.1.0-draft',
          createdAtLogicalTimestamp: 'ts1',
        },
        solveState: 'completed',
      },
      emittedCertificates: [],
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

describe('validateLapicSolveOrchestrationConfig', () => {
  it('accepts a valid config', () => {
    const result = validateLapicSolveOrchestrationConfig(createValidConfig())
    expect(result.ok).toBe(true)
  })

  it('accepts config with explicit session id', () => {
    const result = validateLapicSolveOrchestrationConfig(
      createValidConfig({ sessionId: 'explicit-id' })
    )
    expect(result.ok).toBe(true)
  })

  it('rejects non-record input', () => {
    const result = validateLapicSolveOrchestrationConfig(
      null as unknown as LapicSolveOrchestrationConfig
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('record')
  })

  it('rejects empty problem digest', () => {
    const result = validateLapicSolveOrchestrationConfig(
      createValidConfig({ problemDigest: '' })
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('Problem digest')
  })

  it('rejects empty engine version', () => {
    const result = validateLapicSolveOrchestrationConfig(
      createValidConfig({ engineVersion: '' })
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('Engine version')
  })

  it('rejects empty arithmetic policy id', () => {
    const result = validateLapicSolveOrchestrationConfig(
      createValidConfig({ arithmeticPolicyId: '' })
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('Arithmetic policy')
  })

  it('rejects non-record artifact store', () => {
    const result = validateLapicSolveOrchestrationConfig(
      createValidConfig({ artifactStore: null as any })
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain(
      'Artifact store must be a record'
    )
  })

  it('rejects artifact store without write method', () => {
    const result = validateLapicSolveOrchestrationConfig(
      createValidConfig({ artifactStore: { read: () => {} } as any })
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('write method')
  })

  it('rejects artifact store without read method', () => {
    const result = validateLapicSolveOrchestrationConfig(
      createValidConfig({ artifactStore: { write: () => {} } as any })
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('read method')
  })

  it('rejects non-function solveFn', () => {
    const result = validateLapicSolveOrchestrationConfig(
      createValidConfig({ solveFn: 'not-a-function' as any })
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('function')
  })

  it('rejects empty session id when provided', () => {
    const result = validateLapicSolveOrchestrationConfig(
      createValidConfig({ sessionId: '' })
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('Session id')
  })
})

// ---------------------------------------------------------------------------
// State validation
// ---------------------------------------------------------------------------

describe('validateLapicOrchestrationState', () => {
  for (const state of lapicOrchestrationStates) {
    it(`accepts '${state}'`, () => {
      const result = validateLapicOrchestrationState(state)
      expect(result.ok).toBe(true)
    })
  }

  it('rejects invalid state', () => {
    const result = validateLapicOrchestrationState(
      'invalid' as LapicOrchestrationState
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('must be one of')
  })

  it('rejects empty string', () => {
    const result = validateLapicOrchestrationState(
      '' as LapicOrchestrationState
    )
    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// State transition validation
// ---------------------------------------------------------------------------

describe('validateLapicOrchestrationStateTransition', () => {
  it('allows created → running', () => {
    const result = validateLapicOrchestrationStateTransition(
      'created',
      'running'
    )
    expect(result.ok).toBe(true)
  })

  it('allows running → completed', () => {
    const result = validateLapicOrchestrationStateTransition(
      'running',
      'completed'
    )
    expect(result.ok).toBe(true)
  })

  it('allows running → paused', () => {
    const result = validateLapicOrchestrationStateTransition(
      'running',
      'paused'
    )
    expect(result.ok).toBe(true)
  })

  it('allows running → failed', () => {
    const result = validateLapicOrchestrationStateTransition(
      'running',
      'failed'
    )
    expect(result.ok).toBe(true)
  })

  it('allows running → cancelled', () => {
    const result = validateLapicOrchestrationStateTransition(
      'running',
      'cancelled'
    )
    expect(result.ok).toBe(true)
  })

  it('rejects created → completed (must go through running)', () => {
    const result = validateLapicOrchestrationStateTransition(
      'created',
      'completed'
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('Illegal')
  })

  it('rejects all transitions from terminal states', () => {
    for (const terminal of lapicOrchestrationTerminalStates) {
      for (const target of lapicOrchestrationStates) {
        const result = validateLapicOrchestrationStateTransition(
          terminal,
          target
        )
        expect(result.ok).toBe(false)
      }
    }
  })

  it('rejects running → created (backward transition)', () => {
    const result = validateLapicOrchestrationStateTransition(
      'running',
      'created'
    )
    expect(result.ok).toBe(false)
  })

  it('rejects self-transitions for non-idempotent states', () => {
    const result = validateLapicOrchestrationStateTransition(
      'running',
      'running'
    )
    expect(result.ok).toBe(false)
  })

  it('rejects invalid source state', () => {
    const result = validateLapicOrchestrationStateTransition(
      'bogus' as LapicOrchestrationState,
      'running'
    )
    expect(result.ok).toBe(false)
  })

  it('rejects invalid target state', () => {
    const result = validateLapicOrchestrationStateTransition(
      'created',
      'bogus' as LapicOrchestrationState
    )
    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Outcome validation
// ---------------------------------------------------------------------------

describe('validateLapicOrchestrationOutcome', () => {
  it('accepts valid completed outcome', () => {
    const result = validateLapicOrchestrationOutcome(createValidOutcome())
    expect(result.ok).toBe(true)
  })

  it('accepts valid paused outcome', () => {
    const result = validateLapicOrchestrationOutcome(
      createValidOutcome({
        state: 'paused',
        solveOutcome: {
          paused: true,
          checkpointState: {
            cursorPosition: {
              currentDepth: 0,
              domainIndexStack: [],
              resumeFromFlatIndex: 0,
            },
            topNSnapshot: {
              entries: [],
              capacity: 10,
              currentSize: 0,
            },
            searchStatistics: {
              totalVisited: 0,
              totalEvaluated: 0,
              totalPruned: 0,
              totalInfeasible: 0,
              totalConflicted: 0,
            },
          },
        },
      })
    )
    expect(result.ok).toBe(true)
  })

  it('accepts valid failed outcome', () => {
    const result = validateLapicOrchestrationOutcome({
      state: 'failed',
      error: new Error('test failure'),
    })
    expect(result.ok).toBe(true)
  })

  it('accepts valid cancelled outcome', () => {
    const result = validateLapicOrchestrationOutcome({
      state: 'cancelled',
    })
    expect(result.ok).toBe(true)
  })

  it('rejects non-record input', () => {
    const result = validateLapicOrchestrationOutcome(
      null as unknown as LapicOrchestrationOutcome
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('record')
  })

  it('rejects non-terminal state in outcome', () => {
    const result = validateLapicOrchestrationOutcome({
      state: 'running',
    } as unknown as LapicOrchestrationOutcome)
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('terminal')
  })

  it('rejects created state in outcome', () => {
    const result = validateLapicOrchestrationOutcome({
      state: 'created',
    } as unknown as LapicOrchestrationOutcome)
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('terminal')
  })

  it('rejects completed outcome without solveOutcome', () => {
    const result = validateLapicOrchestrationOutcome({
      state: 'completed',
    } as unknown as LapicOrchestrationOutcome)
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('solveOutcome')
  })

  it('rejects completed outcome with error', () => {
    const result = validateLapicOrchestrationOutcome({
      state: 'completed',
      solveOutcome: createValidOutcome().solveOutcome,
      error: new Error('unexpected'),
    })
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('must not include error')
  })

  it('rejects paused outcome without solveOutcome', () => {
    const result = validateLapicOrchestrationOutcome({
      state: 'paused',
    } as unknown as LapicOrchestrationOutcome)
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('solveOutcome')
  })

  it('rejects paused outcome with error', () => {
    const result = validateLapicOrchestrationOutcome({
      state: 'paused',
      solveOutcome: {
        paused: true,
        checkpointState: {
          cursorPosition: {
            currentDepth: 0,
            domainIndexStack: [],
            resumeFromFlatIndex: 0,
          },
          topNSnapshot: {
            entries: [],
            capacity: 10,
            currentSize: 0,
          },
          searchStatistics: {
            totalVisited: 0,
            totalEvaluated: 0,
            totalPruned: 0,
            totalInfeasible: 0,
            totalConflicted: 0,
          },
        },
      },
      error: new Error('unexpected'),
    })
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('must not include error')
  })

  it('rejects failed outcome without error', () => {
    const result = validateLapicOrchestrationOutcome({
      state: 'failed',
    })
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('must include error')
  })

  it('rejects cancelled outcome with error', () => {
    const result = validateLapicOrchestrationOutcome({
      state: 'cancelled',
      error: new Error('unexpected'),
    })
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('must not include error')
  })

  it('rejects invalid state in outcome', () => {
    const result = validateLapicOrchestrationOutcome({
      state: 'invalid' as LapicOrchestrationState,
    })
    expect(result.ok).toBe(false)
  })
})
