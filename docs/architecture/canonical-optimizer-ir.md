# Canonical Optimizer IR Specification

## Status

- Draft
- Depends on: [Exact Optimizer Engine](./exact-optimizer-engine.md)
- Scope: canonical intermediate representations used by the exact optimizer engine
- Audience: formula, solver, certification, runtime, and storage maintainers

## 1. Purpose

This document specifies the canonical intermediate representations used by the exact optimizer engine.

The IR stack must satisfy five goals simultaneously:

- preserve formula semantics exactly,
- expose enough structure for exact state compression,
- support certified admissible relaxations,
- support deterministic persistence and replay,
- remain game-agnostic above adapter boundaries.

This is a normative specification for correctness-critical architecture. If a case cannot yet be specified to production depth, it must be marked as место требует дополнительного анализа.

## 2. Normative Language

The words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, and MAY are normative.

For this document:

- MUST and SHALL denote correctness or compatibility requirements.
- SHOULD denotes strong preference that may be violated only with explicit justification.
- MAY denotes an allowed variation that does not affect correctness.

## 3. IR Stack Overview

The optimizer IR stack contains five layers.

1. F-IR: canonical formula DAG
2. A-IR: analyzed formula DAG
3. S-IR: state representation IR
4. R-IR: relaxation IR
5. C-IR: certificate IR

Each layer has a distinct responsibility.

- F-IR preserves exact semantics.
- A-IR adds structural facts that remain semantics-preserving.
- S-IR defines exact partial-state summaries for search and compression.
- R-IR defines certified upper-bounding or infeasibility artifacts.
- C-IR defines replayable proof objects for prune and dominance decisions.

No layer may smuggle correctness assumptions that are not explicit in its contract.

## 4. Global Invariants

The complete IR stack MUST satisfy all of the following.

### 4.1 Semantic Invariants

- Every valid source optimization problem has a deterministic F-IR representation.
- F-IR evaluation is semantically equivalent to source formula evaluation.
- A-IR annotations do not alter evaluation results.
- S-IR equivalence classes do not merge concrete states that can differ in feasibility, objective value, dominance, or admissible upper bound.
- R-IR bounds are admissible for every concrete build represented by the referenced state region.
- C-IR certificates are sufficient to replay the original decision.

### 4.2 Identity Invariants

- Every F-IR node has a stable content identity within a problem instance.
- Every S-IR state has a stable canonical key within a partitioning policy.
- Every R-IR artifact has a stable content identity over its fully normalized payload.
- Every C-IR certificate references immutable identities, never mutable runtime addresses.

### 4.3 Replay Invariants

- Any correctness-critical decision must be replayable from persisted IR and certificates.
- Replay must not depend on worker count, scheduling order, or browser-specific APIs.
- Replay must yield the same allow or prune verdict under the same arithmetic policy.

## 5. Canonical Problem Model

Before F-IR generation, the adapter layer must normalize the problem into a canonical problem model.

### 5.1 Problem Fields

The canonical problem model MUST contain:

- problemId
- engineVersion
- arithmeticPolicyId
- item domains by slot or partition dimension
- compatibility and exclusion rules
- objective expression
- feasibility constraint expressions
- topN value
- total ordering policy for results
- optional auxiliary outputs
- adapter metadata

### 5.2 Adapter Boundary

Game-specific code MUST terminate at the adapter boundary.

Adapters are responsible for:

- mapping source formulas to canonical operators,
- mapping item records to canonical candidate features,
- providing exact domain metadata,
- providing game-specific categorical compatibility semantics.

Core optimizer layers MUST NOT depend on game-specific tags, enum names, or storage schemas.

## 6. F-IR Specification

### 6.1 Purpose

F-IR is the exact semantics layer. It is the only IR whose evaluation semantics are defined directly in terms of the optimization problem.

### 6.2 Graph Form

F-IR MUST be a canonical DAG.

Required properties:

- hash-consed node allocation,
- deterministic child ordering for ordered operators,
- normalized child ordering for commutative operators,
- explicit node typing,
- explicit domain metadata,
- content-addressable node identity.

Cycles are forbidden.

### 6.3 Node Schema

Every F-IR node MUST contain:

- nodeId
- opKind
- resultType
- domainId
- childIds
- auxChildIds for branch selectors where relevant
- attributes
- sourceSpanSet
- canonicalHash

Node fields MUST be immutable after construction.

### 6.4 Result Types

F-IR supports the following result types:

- Bool
- Int
- Rational
- Decimal
- Enum
- String
- Vector of primitive scalar type

The optimizer core is required to support Bool, Int, Rational, Decimal, and Enum. String support is permitted only at the adapter or diagnostic boundary and MUST NOT leak into correctness-critical numeric kernels.

### 6.5 Domain Metadata

Every node MUST reference a domain descriptor describing:

- scalar type,
- boundedness,
- lower and upper exact bounds if known,
- categorical value set if finite,
- monotonicity prerequisites if any,
- arithmetic representation class.

Unknown bounds are allowed only when semantically unavoidable.

### 6.6 Operator Families

F-IR operators are divided into six families.

#### Constants and Reads

- Const
- FeatureRead
- CounterRead
- CategoryRead
- ParameterRead

#### Pure Arithmetic

- Add
- Mul
- Neg
- Sub
- Min
- Max
- RatioSum where x divided by x plus y
- AffineForm as canonicalized weighted sum plus constant

#### Comparisons and Branching

- CmpEq
- CmpNe
- CmpGe
- CmpGt
- CmpLe
- CmpLt
- Select
- ThresholdSelect
- LookupEnum

#### Region-Sensitive Game Kernels

- ResistanceTransform
- PiecewiseAffineKernel
- BilinearKernel
- MultilinearKernel
- SaturatingKernel

#### Structural Operators

- TupleConstruct
- TupleGet
- RegionTag
- FeasibilityMarker

#### Auxiliary Output Operators

- PlotAxis
- DiagnosticProbe

### 6.7 Canonicalization Rules

The following rules are REQUIRED.

- Add, Mul, Min, and Max are flattened.
- Commutative children are sorted by canonical order.
- Nested affine fragments are merged into AffineForm.
- Constant folding is performed whenever semantics are exact.
- Duplicate children are retained only if multiplicity matters semantically.
- ThresholdSelect is used instead of generic Select when the branch predicate is of threshold form.
- Source-specific syntactic sugar must not survive into F-IR.

### 6.8 Forbidden F-IR Forms

The following are forbidden in F-IR.

- Implicit coercions.
- Unbounded custom callbacks.
- Hidden side effects.
- Runtime closures.
- Dynamic property lookups outside canonical enum lookup operators.
- Game-specific string dispatch inside numeric kernels.

### 6.9 Custom Operator Policy

Custom operators are allowed only if all of the following are explicit:

- exact semantics,
- domain metadata,
- monotonicity interface,
- relaxation interface,
- serialization contract,
- replay evaluator.

If any of these are missing, the operator is not admissible into F-IR.

## 7. Canonical Node Identity and Hashing

### 7.1 Identity Contract

Each F-IR nodeId MUST be derived from normalized payload, not insertion order.

The canonical hash input MUST include:

- opKind
- normalized child references
- normalized attributes
- resultType
- domainId

sourceSpanSet MUST NOT affect semantic identity.

### 7.2 Deterministic Serialization for Hashing

Hash payload serialization MUST be:

- field-order deterministic,
- schema-versioned,
- free from locale-sensitive formatting,
- free from binary float text ambiguity.

## 8. A-IR Specification

### 8.1 Purpose

A-IR augments F-IR with analysis facts used by state compression, search, and relaxation construction.

### 8.2 Annotation Families

A-IR annotations are divided into the following families.

- exact domain tightening
- monotonicity regions
- convexity and concavity regions
- factorization groups
- branch activation predicates
- sufficient-statistic dependency slices
- interaction graph edges
- region decomposition metadata

### 8.3 Node Annotations

Each annotated node MAY carry:

- exactLower and exactUpper when derivable
- monotonicityByInput
- curvatureByRegion
- activeRegionId set
- affineSupport vector if representable
- nonlinearKernelId if extracted
- branchControlSet
- requiredStateFeatures

Annotations MUST be monotone with respect to correctness. If an analysis cannot prove a strong fact, it MUST emit a weaker fact or nothing. Unsound strengthening is forbidden.

### 8.4 Region Decomposition

The analysis layer MUST decompose formulas into regions whenever bound quality depends on active branch faces or nonlinear kernel domains.

Region descriptors MUST be first-class A-IR objects containing:

- regionId
- guard predicate set
- active operator face selection
- exact feasibility status if known
- parent and child region relationships

### 8.5 Sufficient-Statistic Slice

For each objective and constraint node, A-IR MUST be able to answer:

- which partial-state features are exact inputs to the node,
- which branch outcomes are already forced by those features,
- which unresolved dimensions remain necessary for admissible upper bounds.

This slice information is mandatory for S-IR construction.

## 9. S-IR Specification

### 9.1 Purpose

S-IR defines the exact representation of partial states used by frontier compression and join search.

### 9.2 State Schema

Each S-IR state MUST contain:

- stateId
- partitionId
- itemSelectionMask or equivalent exact provenance reference
- additiveFeatureVector
- discreteCounterVector
- categoricalSignature
- forcedBranchSignature
- unresolvedRegionFrontier
- kernelInputVector
- compatibilitySignature
- objectiveLowerBound if available
- certificateContext

### 9.3 Provenance Contract

S-IR MUST support exact provenance reconstruction of represented concrete states.

Allowed strategies:

- explicit compressed item index lists,
- exact block references into persisted partial-state stores,
- deterministic generator descriptors.

Lossy provenance is forbidden.

### 9.4 Equivalence Contract

Two concrete partial builds may map to the same S-IR state if and only if they are identical with respect to all of the following:

- completion compatibility,
- feasibility under all future completions,
- objective and constraint evaluation after any completion,
- admissible upper bounds under any completion,
- dominance relationships under the current partitioning policy,
- certificate replay requirements.

This equivalence condition is strict. If exact equivalence cannot be proven, states must remain separate.

### 9.5 State Key Layout

The canonical state key is the concatenation of:

- partitionId
- compatibilitySignature
- categoricalSignature
- forcedBranchSignature
- discreteCounterVector
- additiveFeatureVector in canonical order
- unresolvedRegionFrontier
- kernelInputVector

Fields must use deterministic binary encodings. Floating-point byte layout MUST NOT be used directly for correctness-critical keys unless wrapped by a canonical exact-decimal or rational encoding layer.

### 9.6 Compatibility Signature

The compatibilitySignature MUST summarize all future completion constraints relevant to joins, including:

- set-count obligations,
- slot-local exclusions,
- categorical mutual exclusions,
- branch-conditioned compatibility effects,
- team-level occupancy or uniqueness rules when applicable.

### 9.7 Skyline Dominance Interface

Each S-IR state MUST expose a dominance projection interface with:

- exact discrete signature group key,
- monotone comparable projection,
- incomparable projection,
- admissible upper-bound profile,
- certificate strength metadata.

No dominance engine may compare states outside the same exact discrete signature group.

## 10. R-IR Specification

### 10.1 Purpose

R-IR encodes admissible relaxations and bound constructions over F-IR or S-IR regions.

### 10.2 Artifact Schema

Every R-IR artifact MUST contain:

- relaxId
- sourceNodeSet or sourceRegionSet
- targetRegionDescriptor
- relaxationKind
- variableBasis
- constraintSystem
- objectiveSystem
- validityDomain
- arithmeticPolicyId
- verificationStatus

### 10.3 Relaxation Kinds

The architecture requires support for:

- IntervalRelax
- AffineRelax
- McCormickRelax
- PiecewiseLinearRelax
- LinearProgramRelax
- место требует дополнительного анализа: ConvexMixedIntegerRelax

### 10.4 Variable Basis Contract

Every relaxation MUST declare its variable basis explicitly. The basis may be:

- original feature coordinates,
- affine reduced coordinates,
- region-local lifted variables,
- join-level aggregate variables.

Hidden basis changes are forbidden.

### 10.5 Validity Domain

Every relaxation MUST define the exact region over which it is valid.

The validity domain MUST include:

- active partition,
- branch-region predicates,
- exact variable bounds,
- categorical assumptions,
- compatibility constraints.

An R-IR artifact may not be reused outside its validity domain.

## 11. C-IR Specification

### 11.1 Purpose

C-IR stores replayable proof objects for correctness-critical search decisions.

### 11.2 Certificate Schema

Every C-IR certificate MUST contain:

- certId
- certKind
- referencedStateIds and or blockIds
- referencedRelaxIds
- incumbentDigest
- decisionPredicate
- arithmeticPolicyId
- replayInputsDigest
- validationStatus
- emittedAtSolveStep

### 11.3 Certificate Kinds

Required kinds:

- DominanceCert
- InfeasibilityCert
- BoundPruneCert
- BranchReachabilityCert
- FinalOptimalityCert

### 11.4 Replay Inputs

Replay inputs MUST be sufficient to reproduce:

- the compared states or blocks,
- the applied region predicates,
- the exact threshold,
- the referenced relaxations,
- the final allow or prune verdict.

## 12. IR Serialization and Persistence

### 12.1 General Rules

All persisted IR objects MUST use versioned schemas.

Every persisted record MUST contain:

- schemaKind
- schemaVersion
- payload
- checksum
- contentHash

### 12.2 Binary Encoding

The storage layer SHOULD use compact binary encoding for persisted IR. The chosen encoding MUST preserve:

- deterministic ordering,
- exact integer widths,
- explicit optional field presence,
- exact decimal or rational fields.

### 12.3 Text Debug Encoding

All IR layers MUST support a deterministic text debug encoding for inspection and code review. This encoding is diagnostic only and MUST NOT be the canonical persistence format.

## 13. IR Validation Rules

### 13.1 F-IR Validation

The validator MUST reject:

- cyclic graphs,
- dangling child references,
- type-inconsistent operators,
- missing domain metadata,
- non-canonical child ordering,
- forbidden operators.

### 13.2 A-IR Validation

The validator MUST reject:

- annotations that contradict proven F-IR semantics,
- region descriptors with impossible guards,
- sufficient-statistic slices missing referenced features.

### 13.3 S-IR Validation

The validator MUST reject:

- malformed state keys,
- provenance that cannot reconstruct exact represented states,
- missing compatibility signatures,
- dominance metadata outside exact signature groups.

### 13.4 R-IR Validation

The validator MUST reject:

- relaxations without validity domains,
- relaxations with incompatible variable basis declarations,
- unverifiable pruning-critical relaxations.

### 13.5 C-IR Validation

The validator MUST reject:

- certificates referencing mutable runtime-only identifiers,
- certificates missing threshold or replay digest,
- certificates whose replay predicate is underspecified.

## 14. Bridge from Existing Engines

### 14.1 Pando Mapping

Existing pando node graphs can map into F-IR, but the mapping MUST be explicit and loseless.

Required adapter responsibilities:

- convert pando operator names to canonical opKind,
- normalize branch semantics,
- materialize exact domain descriptors,
- remove runtime-specific calculator behaviors from the canonical representation.

### 14.2 Waverider Mapping

Existing gi wr optimization nodes can map into F-IR only through an adapter that makes all special kernels explicit.

Legacy implicit semantics are forbidden in canonical IR.

## 15. Evolution Policy

### 15.1 Schema Evolution

IR schemas may evolve only under explicit version increments.

Backward-compatible additions may include:

- new optional annotation fields,
- new diagnostic metadata,
- new relaxation providers that fit existing contracts.

Backward-incompatible changes require:

- schema version increment,
- migration strategy,
- replay compatibility statement.

### 15.2 Operator Evolution

Adding an operator requires all of the following before use in correctness-critical code:

- exact semantics,
- type and domain rules,
- canonicalization rules,
- serialization schema,
- analysis hooks,
- relaxation hooks or explicit non-relaxable classification,
- validation rules,
- replay evaluator.

## 16. Open Specification Gaps

The following items are not frozen.

### 16.1 Convex Mixed-Integer Relaxation Artifact Format

место требует дополнительного анализа

The architecture reserves the extension point, but the final artifact schema depends on the chosen backend and certificate quality.

## 17. Accepted Decisions

- Canonical correctness-critical scalar persistence is exact-decimal, with rational arithmetic retained only as a verification escape hatch. See [decision-log.md](./decision-log.md).

## 18. Compliance Checklist

An implementation is IR-compliant only if all answers below are yes.

1. Does it construct deterministic F-IR for the same canonical problem input?
2. Does every node carry explicit type and domain metadata?
3. Can every correctness-critical prune decision be replayed from persisted IR plus certificates?
4. Can every S-IR state reconstruct exact represented concrete states?
5. Are all relaxations validity-scoped and explicitly typed?
6. Can schemas evolve without silent replay breakage?

## 19. Required Follow-On Specifications

This document requires the following detailed documents:

1. [Relaxation and Certificate Specification](./relaxation-and-certificate-system.md).
2. [Frontier Storage and Block Codec Specification](./frontier-storage-and-block-codec.md).
3. [Runtime Protocol and Checkpoint Specification](./runtime-protocol-and-checkpoint-specification.md).
4. Adapter Specification for GI, SR, and ZZZ.

Implementation of production search and certificate modules must not begin before these documents exist.
