# Team-Level Adapter Boundary

## Status

- Draft
- Scope: explicit deferred architectural boundary for multi-entity and team-level adapter semantics in lapic
- Audience: adapter, optimizer-core, validation, and roadmap maintainers

## 1. Purpose

This document defines the current architectural boundary between supported single-entity optimization and deferred team-level optimization in lapic.

It does not freeze the final team-level architecture. Its role is to make the deferral explicit, bounded, and non-accidental.

## 2. In-Scope Today

The current lapic architecture fully covers:

- single-entity build optimization,
- single-entity candidate extraction,
- single-entity canonical problem export,
- single-entity replay and benchmark retention.

## 3. Deferred Scope

The following remain deferred pending future architectural work:

- multi-entity candidate-domain coupling,
- team occupancy and uniqueness semantics beyond current single-entity compatibility hints,
- shared-team objective decomposition,
- cross-entity conditional formula activation,
- team-level benchmark interpretation and parity claims.

## 4. Boundary Rules

- No package may claim full team-level production support under the current document set.
- Single-entity APIs MAY carry future-compatible metadata hooks, but they MUST NOT pretend to freeze unresolved team-level semantics.
- Team-related fields currently referenced in core compatibility or signature contracts remain reserved extension points, not completed semantics.

## 5. Required Future Freeze Points

Future team-level architecture work must explicitly define:

- canonical team entity model,
- team-level compatibility signature semantics,
- team-level candidate provenance model,
- team-aware benchmark and replay requirements,
- migration and cutover rules for games that support team optimization.

## 6. Roadmap Effect

This boundary blocks:

- generalized team-level production cutover,
- final team-aware adapter compatibility signatures,
- team-level benchmark corpus interpretation.

It does not block:

- single-entity package scaffolding,
- single-entity adapter implementation,
- single-entity validation, replay, and benchmark infrastructure.
