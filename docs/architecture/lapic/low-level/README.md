# Low-Level Specifications

## Status

- Draft
- Scope: implementation-freezing details that refine the high-level architecture without changing it
- Parent documents:
  - [lapic Architecture](../overview.md)
  - [Canonical Optimizer IR Specification](../canonical-ir.md)
  - [Relaxation and Certificate System Specification](../relaxation-and-certificates.md)
  - [Frontier Storage and Codec Specification](../frontier-storage-and-codec.md)
  - [Runtime and Checkpoint Specification](../runtime-and-checkpoints.md)
  - [Validation and Benchmark Specification](../validation-and-benchmarks.md)
  - [Potential-Aware Optimization Architecture](../potential-aware-optimization.md)
  - [Implementation Roadmap](../implementation-roadmap.md)

## 1. Purpose

This directory contains low-level specifications that freeze wire formats, provider evidence payloads, API-level contracts, and other implementation-critical details.

These documents are subordinate to the architecture specifications in the parent directory.

They may refine representation, protocol, and packaging details, but they must not weaken correctness guarantees or silently change high-level architectural decisions.

## 2. Intended Contents

The initial document set in this directory is:

- [exact-decimal-wire-format.md](./exact-decimal-wire-format.md): canonical exact-decimal persistence, hashing payload, and rational verification escape format.
- [highs-evidence-and-deterministic-config.md](./highs-evidence-and-deterministic-config.md): deterministic HiGHS profile, structured evidence schema, and danger-zone metadata contract.
- [benchmark-governance-and-browser-noise.md](./benchmark-governance-and-browser-noise.md): corpus versioning, benchmark profile classes, browser noise model, and regression gating policy.
- [benchmark-fixture-layout.md](./benchmark-fixture-layout.md): repository-level directory layout, ownership mapping, fixture classes, retained artifacts, and report storage rules.
- [lapic-core-ir-api.md](./lapic-core-ir-api.md): lapic core package surface for canonical problem, IR builders, validators, identities, and state-model contracts.
- [lapic-cert-api.md](./lapic-cert-api.md): lapic cert package surface for certificate models, evidence references, replay requests, replay results, and audit helpers.
- [lapic-storage-api.md](./lapic-storage-api.md): lapic storage package surface for artifact envelopes, block codecs, manifests, backends, checkpoint closures, and integrity tooling.
- [lapic-runtime-api.md](./lapic-runtime-api.md): lapic runtime package surface for solve sessions, solve handles, work units, worker protocol, checkpoints, failures, and diagnostics.
- [adapters-gi-sr-zzz-api.md](./adapters-gi-sr-zzz-api.md): public package surfaces for GI, SR, and ZZZ adapter requests, canonical exports, snapshot metadata, capabilities, and validation hooks.
- [lapic-debug-api.md](./lapic-debug-api.md): lapic debug package surface for inspection, trace views, audit reports, replay-oriented tools, and validation and benchmark helpers.
- [source-snapshot-packaging.md](./source-snapshot-packaging.md): canonical packaging policy for adapter source snapshots used in replay and benchmark retention.

## 3. Rules

- A low-level spec may freeze a detail left open by a parent architecture document.
- A low-level spec must reference the parent decision or parent unresolved section it is refining.
- If a low-level detail would force a high-level architectural change, that is not a low-level refinement and must be escalated back to the parent architecture documents.
