import type {
  LapicLinearConstraint,
  LapicLinearModel,
  LapicLinearObjective,
  LapicLinearVariable,
  LapicRelaxationArtifact,
  LapicRelaxationValidityDomain,
  LapicVariableBasis,
} from './types'
import {
  validateLinearConstraint,
  validateLinearModel,
  validateLinearObjective,
  validateLinearVariable,
  validateRelaxationArtifact,
  validateRelaxationKind,
  validateValidityDomain,
  validateVariableBasis,
} from './validation'

function makeValidBasis(): LapicVariableBasis {
  return {
    basisKind: 'original-feature',
    variableIds: ['x0', 'x1', 'x2'],
  }
}

function makeValidDomain(): LapicRelaxationValidityDomain {
  return {
    activePartitionDigest: 'part-digest-abc',
    branchRegionPredicates: ['pred-1', 'pred-2'],
    exactVariableBoundsDigest: 'bounds-digest-def',
    categoricalAssumptions: ['weapon=sword'],
    compatibilityConstraintDigests: ['compat-1'],
  }
}

function makeValidVariable(index = 0): LapicLinearVariable {
  return {
    variableIndex: index,
    name: `x${index}`,
    lowerBound: 0,
    upperBound: 1,
  }
}

function makeValidConstraint(): LapicLinearConstraint {
  return {
    constraintId: 'c0',
    coefficients: [1, -1],
    variableIndices: [0, 1],
    lowerBound: -Infinity,
    upperBound: 10,
  }
}

function makeValidObjective(): LapicLinearObjective {
  return {
    sense: 'maximize',
    coefficients: [3, 5],
    variableIndices: [0, 1],
    offset: 0,
  }
}

function makeValidModel(): LapicLinearModel {
  return {
    modelDigest: 'model-digest-123',
    variables: [makeValidVariable(0), makeValidVariable(1)],
    constraints: [makeValidConstraint()],
    objective: makeValidObjective(),
  }
}

function makeValidArtifact(): LapicRelaxationArtifact {
  return {
    relaxId: 'relax-001',
    schemaVersion: '0.1.0-draft',
    relaxationKind: 'IntervalRelax',
    sourceNodeSetDigest: 'src-nodes-abc',
    targetRegionDescriptor: 'region-def',
    variableBasis: makeValidBasis(),
    constraintSystem: { constraintCount: 2, constraintDigest: 'cs-digest' },
    objectiveSystem: { objectiveDigest: 'obj-digest', sense: 'maximize' },
    validityDomain: makeValidDomain(),
    arithmeticPolicyId: 'exact-decimal-v1',
    verificationStatus: 'unverified',
    boundDirection: 'upper',
  }
}

describe('validateRelaxationKind', () => {
  it('accepts all valid relaxation kinds', () => {
    const kinds = [
      'IntervalRelax',
      'AffineRelax',
      'McCormickRelax',
      'PiecewiseLinearRelax',
      'LinearProgramRelax',
    ]
    for (const kind of kinds) {
      expect(validateRelaxationKind(kind).ok).toBe(true)
    }
  })

  it('rejects invalid relaxation kind', () => {
    const result = validateRelaxationKind('MagicRelax')
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('MagicRelax')
  })
})

describe('validateVariableBasis', () => {
  it('accepts a valid basis', () => {
    expect(validateVariableBasis(makeValidBasis()).ok).toBe(true)
  })

  it('rejects invalid basis kind', () => {
    const basis = { ...makeValidBasis(), basisKind: 'unknown' as never }
    expect(validateVariableBasis(basis).ok).toBe(false)
  })

  it('rejects empty variable list', () => {
    const basis = { ...makeValidBasis(), variableIds: [] }
    expect(validateVariableBasis(basis).ok).toBe(false)
  })

  it('rejects duplicate variable IDs', () => {
    const basis = { ...makeValidBasis(), variableIds: ['x0', 'x1', 'x0'] }
    const result = validateVariableBasis(basis)
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('Duplicate')
  })
})

describe('validateValidityDomain', () => {
  it('accepts a valid domain', () => {
    expect(validateValidityDomain(makeValidDomain()).ok).toBe(true)
  })

  it('rejects missing activePartitionDigest', () => {
    const domain = { ...makeValidDomain(), activePartitionDigest: 42 as never }
    expect(validateValidityDomain(domain).ok).toBe(false)
  })
})

describe('validateLinearVariable', () => {
  it('accepts a valid variable', () => {
    expect(validateLinearVariable(makeValidVariable()).ok).toBe(true)
  })

  it('rejects negative index', () => {
    const v = { ...makeValidVariable(), variableIndex: -1 }
    expect(validateLinearVariable(v).ok).toBe(false)
  })

  it('rejects infeasible bounds', () => {
    const v = { ...makeValidVariable(), lowerBound: 10, upperBound: 5 }
    const result = validateLinearVariable(v)
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('infeasible bounds')
  })
})

describe('validateLinearConstraint', () => {
  it('accepts a valid constraint', () => {
    expect(validateLinearConstraint(makeValidConstraint()).ok).toBe(true)
  })

  it('rejects empty coefficients', () => {
    const c = {
      ...makeValidConstraint(),
      coefficients: [],
      variableIndices: [],
    }
    expect(validateLinearConstraint(c).ok).toBe(false)
  })

  it('rejects mismatched array lengths', () => {
    const c = {
      ...makeValidConstraint(),
      coefficients: [1],
      variableIndices: [0, 1],
    }
    expect(validateLinearConstraint(c).ok).toBe(false)
  })
})

describe('validateLinearObjective', () => {
  it('accepts a valid objective', () => {
    expect(validateLinearObjective(makeValidObjective()).ok).toBe(true)
  })

  it('rejects invalid sense', () => {
    const obj = { ...makeValidObjective(), sense: 'optimise' as never }
    expect(validateLinearObjective(obj).ok).toBe(false)
  })
})

describe('validateLinearModel', () => {
  it('accepts a valid model', () => {
    expect(validateLinearModel(makeValidModel()).ok).toBe(true)
  })

  it('rejects empty model digest', () => {
    const model = { ...makeValidModel(), modelDigest: '' }
    expect(validateLinearModel(model).ok).toBe(false)
  })

  it('rejects empty variable set', () => {
    const model = { ...makeValidModel(), variables: [] }
    expect(validateLinearModel(model).ok).toBe(false)
  })

  it('rejects duplicate variable indices', () => {
    const model = {
      ...makeValidModel(),
      variables: [makeValidVariable(0), makeValidVariable(0)],
    }
    expect(validateLinearModel(model).ok).toBe(false)
  })

  it('rejects constraint referencing undefined variable', () => {
    const model = {
      ...makeValidModel(),
      constraints: [
        {
          constraintId: 'c0',
          coefficients: [1],
          variableIndices: [99],
          lowerBound: 0,
          upperBound: 10,
        },
      ],
    }
    const result = validateLinearModel(model)
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain(
      'undefined variable index 99'
    )
  })

  it('rejects objective referencing undefined variable', () => {
    const model = {
      ...makeValidModel(),
      objective: {
        sense: 'maximize' as const,
        coefficients: [1],
        variableIndices: [77],
        offset: 0,
      },
    }
    const result = validateLinearModel(model)
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain(
      'undefined variable index 77'
    )
  })
})

describe('validateRelaxationArtifact', () => {
  it('accepts a valid IntervalRelax artifact', () => {
    expect(validateRelaxationArtifact(makeValidArtifact()).ok).toBe(true)
  })

  it('accepts all relaxation kinds', () => {
    const kinds = [
      'IntervalRelax',
      'AffineRelax',
      'McCormickRelax',
      'PiecewiseLinearRelax',
    ] as const
    for (const kind of kinds) {
      const artifact = { ...makeValidArtifact(), relaxationKind: kind }
      expect(validateRelaxationArtifact(artifact).ok).toBe(true)
    }
  })

  it('accepts LinearProgramRelax with providerProfileId', () => {
    const artifact = {
      ...makeValidArtifact(),
      relaxationKind: 'LinearProgramRelax' as const,
      providerProfileId: 'lapic-highs-deterministic-v1',
    }
    expect(validateRelaxationArtifact(artifact).ok).toBe(true)
  })

  it('rejects LinearProgramRelax without providerProfileId', () => {
    const artifact = {
      ...makeValidArtifact(),
      relaxationKind: 'LinearProgramRelax' as const,
    }
    const result = validateRelaxationArtifact(artifact)
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('providerProfileId')
  })

  it('rejects empty relaxId', () => {
    const artifact = { ...makeValidArtifact(), relaxId: '' }
    expect(validateRelaxationArtifact(artifact).ok).toBe(false)
  })

  it('rejects invalid bound direction', () => {
    const artifact = { ...makeValidArtifact(), boundDirection: 'both' as never }
    expect(validateRelaxationArtifact(artifact).ok).toBe(false)
  })

  it('rejects invalid verification status', () => {
    const artifact = {
      ...makeValidArtifact(),
      verificationStatus: 'trusted' as never,
    }
    expect(validateRelaxationArtifact(artifact).ok).toBe(false)
  })
})
