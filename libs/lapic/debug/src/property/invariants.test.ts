import fc from 'fast-check'
import {
  arbFrontierBlock,
  arbFrontierIndex,
  arbStorageEnvelope,
} from './generators'
import {
  propColumnarColumnLengths,
  propColumnarLayoutKind,
  propColumnarRoundTrip,
  propDeterministicJsonIdempotent,
  propEnvelopeCloneDeterminism,
  propFrontierBlockCloneDeterminism,
  propFrontierBlockCodecRoundTrip,
  propFrontierBlockRowCountPreserved,
  propFrontierIndexCloneDeterminism,
  propFrontierIndexCodecRoundTrip,
  runLapicProperty,
} from './invariants'

const PROPERTY_RUNS = 100
const SEED = 42

describe('property: deterministic JSON', () => {
  it('idempotent serialization for arbitrary objects', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (val) =>
        propDeterministicJsonIdempotent(val)
      ),
      { numRuns: PROPERTY_RUNS, seed: SEED }
    )
  })

  it('idempotent serialization for frontier blocks', () => {
    fc.assert(
      fc.property(arbFrontierBlock(), (block) =>
        propDeterministicJsonIdempotent(block)
      ),
      { numRuns: PROPERTY_RUNS, seed: SEED }
    )
  })

  it('idempotent serialization for storage envelopes', () => {
    fc.assert(
      fc.property(arbStorageEnvelope(), (env) =>
        propDeterministicJsonIdempotent(env)
      ),
      { numRuns: PROPERTY_RUNS, seed: SEED }
    )
  })
})

describe('property: frontier block JSON codec', () => {
  it('round-trip is lossless (byte-identical)', () => {
    fc.assert(
      fc.property(arbFrontierBlock(), (block) =>
        propFrontierBlockCodecRoundTrip(block)
      ),
      { numRuns: PROPERTY_RUNS, seed: SEED }
    )
  })

  it('rowCount preserved after round-trip', () => {
    fc.assert(
      fc.property(arbFrontierBlock(), (block) =>
        propFrontierBlockRowCountPreserved(block)
      ),
      { numRuns: PROPERTY_RUNS, seed: SEED }
    )
  })
})

describe('property: frontier index JSON codec', () => {
  it('round-trip is lossless (byte-identical)', () => {
    fc.assert(
      fc.property(arbFrontierIndex(), (index) =>
        propFrontierIndexCodecRoundTrip(index)
      ),
      { numRuns: PROPERTY_RUNS, seed: SEED }
    )
  })
})

describe('property: columnar layout', () => {
  it('row → columnar → row is lossless', () => {
    fc.assert(
      fc.property(arbFrontierBlock(), (block) => propColumnarRoundTrip(block)),
      { numRuns: PROPERTY_RUNS, seed: SEED }
    )
  })

  it('columnar sets layoutKind to "columnar"', () => {
    fc.assert(
      fc.property(arbFrontierBlock(), (block) => propColumnarLayoutKind(block)),
      { numRuns: PROPERTY_RUNS, seed: SEED }
    )
  })

  it('all column arrays have length === rowCount', () => {
    fc.assert(
      fc.property(arbFrontierBlock(), (block) =>
        propColumnarColumnLengths(block)
      ),
      { numRuns: PROPERTY_RUNS, seed: SEED }
    )
  })
})

describe('property: builder clone determinism', () => {
  it('frontier block clone equals original', () => {
    fc.assert(
      fc.property(arbFrontierBlock(), (block) =>
        propFrontierBlockCloneDeterminism(block)
      ),
      { numRuns: PROPERTY_RUNS, seed: SEED }
    )
  })

  it('frontier index clone equals original', () => {
    fc.assert(
      fc.property(arbFrontierIndex(), (index) =>
        propFrontierIndexCloneDeterminism(index)
      ),
      { numRuns: PROPERTY_RUNS, seed: SEED }
    )
  })

  it('storage envelope clone equals original', () => {
    fc.assert(
      fc.property(arbStorageEnvelope(), (env) =>
        propEnvelopeCloneDeterminism(env)
      ),
      { numRuns: PROPERTY_RUNS, seed: SEED }
    )
  })
})

describe('runLapicProperty helper', () => {
  it('reports success for passing property', () => {
    const result = runLapicProperty(
      'test-pass',
      arbFrontierBlock(5),
      propFrontierBlockCodecRoundTrip,
      { numRuns: 10, seed: SEED }
    )
    expect(result.passed).toBe(true)
    expect(result.propertyName).toBe('test-pass')
    expect(result.numRuns).toBe(10)
  })

  it('reports failure for failing property', () => {
    const result = runLapicProperty(
      'test-fail',
      fc.integer(),
      (n) => n > 0, // will fail for n <= 0
      { numRuns: 100, seed: SEED }
    )
    expect(result.passed).toBe(false)
    expect(result.counterexample).toBeDefined()
  })
})
