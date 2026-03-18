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
  - [Implementation Roadmap](../implementation-roadmap.md)

## 1. Purpose

This directory contains low-level specifications that freeze wire formats, provider evidence payloads, API-level contracts, and other implementation-critical details.

These documents are subordinate to the architecture specifications in the parent directory.

They may refine representation, protocol, and packaging details, but they must not weaken correctness guarantees or silently change high-level architectural decisions.

## 2. Intended Contents

The first documents expected here are:

- exact-decimal canonical encoding and wire layout,
- HiGHS evidence payload schema and deterministic provider configuration,
- optimizer-core low-level IR API specification,
- optimizer-cert certificate API and replay payload specification,
- benchmark governance and browser noise policy.

## 3. Rules

- A low-level spec may freeze a detail left open by a parent architecture document.
- A low-level spec must reference the parent decision or parent unresolved section it is refining.
- If a low-level detail would force a high-level architectural change, that is not a low-level refinement and must be escalated back to the parent architecture documents.
