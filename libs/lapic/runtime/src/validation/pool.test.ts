import { createCallbackWorkerHandle } from '../worker/pool'
import type {
  LapicPoolTransportConfig,
  LapicWorkerHandle,
} from '../worker/pool'
import {
  validateLapicPoolTransportConfig,
  validateLapicWorkerHandle,
} from './pool'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createValidHandle(id = 'w0'): LapicWorkerHandle {
  return createCallbackWorkerHandle(id, () => ({
    tag: 'WorkComplete',
    sessionId: 's',
    partitionIndex: 0,
    topCandidates: [],
    evaluatedCount: 0,
    visitedCount: 0,
  }))
}

function createValidConfig(
  overrides: Partial<LapicPoolTransportConfig> = {}
): LapicPoolTransportConfig {
  return {
    handles: [createValidHandle('w0'), createValidHandle('w1')],
    backendKind: 'in-process',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Worker handle validation
// ---------------------------------------------------------------------------

describe('validateLapicWorkerHandle', () => {
  it('accepts a valid handle', () => {
    const result = validateLapicWorkerHandle(createValidHandle())
    expect(result.ok).toBe(true)
  })

  it('rejects non-record input', () => {
    const result = validateLapicWorkerHandle(
      null as unknown as LapicWorkerHandle
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('record')
  })

  it('rejects empty workerId', () => {
    const handle = { ...createValidHandle(), workerId: '' }
    const result = validateLapicWorkerHandle(handle)
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('workerId')
  })

  it('rejects handle without dispatch function', () => {
    const handle = { ...createValidHandle(), dispatch: 'not-a-function' }
    const result = validateLapicWorkerHandle(
      handle as unknown as LapicWorkerHandle
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('dispatch')
  })

  it('rejects handle without requestPause function', () => {
    const handle = { ...createValidHandle(), requestPause: undefined }
    const result = validateLapicWorkerHandle(
      handle as unknown as LapicWorkerHandle
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('requestPause')
  })

  it('rejects handle without terminate function', () => {
    const handle = { ...createValidHandle(), terminate: 42 }
    const result = validateLapicWorkerHandle(
      handle as unknown as LapicWorkerHandle
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('terminate')
  })
})

// ---------------------------------------------------------------------------
// Pool config validation
// ---------------------------------------------------------------------------

describe('validateLapicPoolTransportConfig', () => {
  it('accepts a valid config', () => {
    const result = validateLapicPoolTransportConfig(createValidConfig())
    expect(result.ok).toBe(true)
  })

  it('accepts config with single handle', () => {
    const result = validateLapicPoolTransportConfig(
      createValidConfig({ handles: [createValidHandle('solo')] })
    )
    expect(result.ok).toBe(true)
  })

  it('rejects non-record input', () => {
    const result = validateLapicPoolTransportConfig(
      null as unknown as LapicPoolTransportConfig
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('record')
  })

  it('rejects empty handles array', () => {
    const result = validateLapicPoolTransportConfig(
      createValidConfig({ handles: [] })
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('at least one')
  })

  it('rejects non-array handles', () => {
    const result = validateLapicPoolTransportConfig(
      createValidConfig({ handles: 'not-an-array' as any })
    )
    expect(result.ok).toBe(false)
  })

  it('rejects config with invalid handle', () => {
    const result = validateLapicPoolTransportConfig(
      createValidConfig({
        handles: [
          createValidHandle('ok'),
          {
            workerId: '',
            dispatch: () => {},
            requestPause: () => {},
            terminate: () => {},
          } as any,
        ],
      })
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('workerId')
  })

  it('rejects duplicate workerIds', () => {
    const result = validateLapicPoolTransportConfig(
      createValidConfig({
        handles: [createValidHandle('dupe'), createValidHandle('dupe')],
      })
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('Duplicate')
    expect(result.diagnostics[0]!.message).toContain('dupe')
  })

  it('rejects invalid backend kind', () => {
    const result = validateLapicPoolTransportConfig(
      createValidConfig({ backendKind: 'invalid' as any })
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('must be one of')
  })

  it('rejects empty backend kind', () => {
    const result = validateLapicPoolTransportConfig(
      createValidConfig({ backendKind: '' as any })
    )
    expect(result.ok).toBe(false)
  })

  for (const kind of ['browser-worker', 'node-worker', 'in-process'] as const) {
    it(`accepts backend kind '${kind}'`, () => {
      const result = validateLapicPoolTransportConfig(
        createValidConfig({ backendKind: kind })
      )
      expect(result.ok).toBe(true)
    })
  }
})
