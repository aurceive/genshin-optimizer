import {
  createLapicMemoryArtifactStore,
} from '@genshin-optimizer/lapic/storage'
import type {
  LapicBoundedExactSolveOutcome,
} from '../solve/types'
import type {
  LapicInMemorySessionController,
  LapicProgressEvent,
  LapicSolveCompletionResult,
} from '../types'
import {
  createSolveOrchestration,
  resetSessionSequenceForTesting,
} from './orchestrate'
import type { LapicSolveOrchestrationConfig } from './types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createBaseConfig(
  overrides: Partial<LapicSolveOrchestrationConfig> = {}
): LapicSolveOrchestrationConfig {
  return {
    problemDigest: 'test-problem-digest',
    engineVersion: '0.1.0-draft',
    arithmeticPolicyId: 'ieee754-double',
    artifactStore: createLapicMemoryArtifactStore(),
    solveFn: async (controller) => {
      controller.activate('analyze')
      return controller.complete()
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('lapic solve orchestrator', () => {
  beforeEach(() => {
    resetSessionSequenceForTesting()
  })

  describe('orchestration lifecycle', () => {
    it('starts in created state', () => {
      const orch = createSolveOrchestration(createBaseConfig())
      expect(orch.state).toBe('created')
    })

    it('transitions to completed after successful solve', async () => {
      const orch = createSolveOrchestration(createBaseConfig())
      const outcome = await orch.start()

      expect(orch.state).toBe('completed')
      expect(outcome.state).toBe('completed')
      expect(outcome.solveOutcome).toBeDefined()
      expect(outcome.error).toBeUndefined()
    })

    it('transitions to paused when solve yields pause result', async () => {
      const orch = createSolveOrchestration(
        createBaseConfig({
          solveFn: async (): Promise<LapicBoundedExactSolveOutcome> => {
            return {
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
            }
          },
        })
      )

      const outcome = await orch.start()
      expect(orch.state).toBe('paused')
      expect(outcome.state).toBe('paused')
      expect(outcome.solveOutcome).toBeDefined()
    })

    it('transitions to failed when solve throws', async () => {
      const orch = createSolveOrchestration(
        createBaseConfig({
          solveFn: async () => {
            throw new Error('deliberate-failure')
          },
        })
      )

      const outcome = await orch.start()
      expect(orch.state).toBe('failed')
      expect(outcome.state).toBe('failed')
      expect(outcome.error).toBeInstanceOf(Error)
      expect(outcome.error!.message).toBe('deliberate-failure')
    })

    it('wraps non-Error throws as Error objects', async () => {
      const orch = createSolveOrchestration(
        createBaseConfig({
          solveFn: async () => {
            throw 'string-error'
          },
        })
      )

      const outcome = await orch.start()
      expect(outcome.error).toBeInstanceOf(Error)
      expect(outcome.error!.message).toBe('string-error')
    })

    it('throws if start() is called twice', async () => {
      const orch = createSolveOrchestration(createBaseConfig())
      await orch.start()

      await expect(orch.start()).rejects.toThrow('already been started')
    })
  })

  describe('session identity', () => {
    it('generates unique session IDs', () => {
      const orch1 = createSolveOrchestration(createBaseConfig())
      const orch2 = createSolveOrchestration(createBaseConfig())

      expect(orch1.sessionId).not.toBe(orch2.sessionId)
    })

    it('uses explicit session ID when provided', () => {
      const orch = createSolveOrchestration(
        createBaseConfig({ sessionId: 'explicit-session' })
      )
      expect(orch.sessionId).toBe('explicit-session')
    })

    it('wires problem digest into session identity', async () => {
      const orch = createSolveOrchestration(
        createBaseConfig({ problemDigest: 'my-problem-digest' })
      )

      const inspection = await orch.handle.inspectSessionState()
      expect(inspection.summary.identity.problemDigest).toBe(
        'my-problem-digest'
      )
    })
  })

  describe('public handle', () => {
    it('provides handle before start for early subscription', async () => {
      const events: LapicProgressEvent[] = []

      const orch = createSolveOrchestration(
        createBaseConfig({
          solveFn: async (controller) => {
            controller.activate('frontier-build')
            controller.publishProgress({
              phase: 'frontier-build',
              completedUnits: 1,
              totalUnits: 5,
            })
            controller.publishProgress({
              phase: 'frontier-build',
              completedUnits: 3,
              totalUnits: 5,
            })
            return controller.complete()
          },
        })
      )

      // Subscribe BEFORE start
      orch.handle.subscribeProgress((event) => events.push(event))

      await orch.start()

      expect(events).toHaveLength(2)
      expect(events[0]!.phase).toBe('frontier-build')
      expect(events[0]!.completedUnits).toBe(1)
      expect(events[1]!.completedUnits).toBe(3)
    })

    it('supports diagnostics subscription through handle', async () => {
      const diagnosticTags: string[] = []

      const orch = createSolveOrchestration(
        createBaseConfig({
          solveFn: async (controller) => {
            controller.activate('analyze')
            controller.publishTrace('Progress')
            return controller.complete()
          },
        })
      )

      orch.handle.subscribeDiagnostics((event) => {
        if ('tag' in event) diagnosticTags.push(event.tag)
      })

      await orch.start()

      expect(diagnosticTags).toContain('StartWork')
      expect(diagnosticTags).toContain('Progress')
    })

    it('supports session inspection through handle', async () => {
      const orch = createSolveOrchestration(
        createBaseConfig({
          sessionId: 'inspect-session',
          engineVersion: '1.0.0',
        })
      )

      const inspection = await orch.handle.inspectSessionState()
      expect(inspection.summary.identity.sessionId).toBe('inspect-session')
      expect(inspection.summary.identity.engineVersion).toBe('1.0.0')
      expect(inspection.summary.solveState).toBe('created')
    })

    it('supports cancellation through handle', async () => {
      let controllerRef: LapicInMemorySessionController | undefined

      const orch = createSolveOrchestration(
        createBaseConfig({
          solveFn: async (controller) => {
            controllerRef = controller
            controller.activate('analyze')
            // Simulate cancel from outside
            const cancelResult = await controller.requestCancel()
            expect(cancelResult.accepted).toBe(true)
            return controller.awaitCompletion()
          },
        })
      )

      const outcome = await orch.start()

      // Controller.awaitCompletion() for a cancelled session returns
      // a completion result with 'cancelled' state
      expect(outcome.solveOutcome).toBeDefined()
      const result = outcome.solveOutcome as LapicSolveCompletionResult
      expect(result.summary.solveState).toBe('cancelled')
    })
  })

  describe('controller access', () => {
    it('exposes internal controller for adapter use', async () => {
      const orch = createSolveOrchestration(createBaseConfig())
      expect(orch.controller).toBeDefined()
      expect(typeof orch.controller.activate).toBe('function')
      expect(typeof orch.controller.publishProgress).toBe('function')
    })

    it('controller and handle reference the same object', () => {
      const orch = createSolveOrchestration(createBaseConfig())
      expect(orch.handle).toBe(orch.controller)
    })
  })

  describe('artifact store wiring', () => {
    it('passes artifact store to solve function', async () => {
      const store = createLapicMemoryArtifactStore()
      let receivedStore: unknown

      const orch = createSolveOrchestration(
        createBaseConfig({
          artifactStore: store,
          solveFn: async (controller, artifactStore) => {
            receivedStore = artifactStore
            controller.activate('analyze')
            return controller.complete()
          },
        })
      )

      await orch.start()
      expect(receivedStore).toBe(store)
    })
  })
})
