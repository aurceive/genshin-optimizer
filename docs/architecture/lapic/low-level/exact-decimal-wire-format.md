# Exact-Decimal Canonical Encoding and Wire Layout

## Status

- Draft
- Depends on: [lapic Decision Log](../decision-log.md)
- Depends on: [Canonical Optimizer IR Specification](../canonical-ir.md)
- Depends on: [Frontier Storage and Codec Specification](../frontier-storage-and-codec.md)
- Scope: canonical persisted representation, hashing payload, ordering payload, and verification escape encoding for correctness-critical scalar values
- Audience: lapic core, lapic storage, lapic cert, runtime, and replay maintainers

## 1. Purpose

This document freezes the low-level wire format for correctness-critical scalar persistence in lapic.

It refines decision D-001 without changing it.

The goal is to define:

- the canonical exact-decimal logical model,
- the byte-level wire representation used for persisted payloads,
- the normalization rules required before hashing and storage,
- the escape representation used only when rational replay is required.

## 2. Non-Negotiable Rules

- Correctness-critical persisted scalars MUST use canonical exact-decimal encoding unless the field is explicitly declared verification-only rational escape data.
- Native binary floating-point payload bytes MUST NOT appear in correctness-critical canonical payloads.
- Canonical bytes MUST be stable across browser and Node runtimes.
- Canonical hashing MUST operate over post-normalization serialized bytes.
- A non-canonical decimal representation is invalid even if it denotes the same mathematical value.

## 3. Logical Value Model

### 3.1 Canonical Decimal Value

The canonical exact-decimal value domain is:

`value = sign * coefficient * 10^(-scale)`

where:

- sign is one of `-1`, `0`, `+1`,
- coefficient is a non-negative integer,
- scale is a non-negative integer.

### 3.2 Normalization Rules

Every non-zero exact-decimal value MUST satisfy all of the following:

- coefficient > 0,
- scale >= 0,
- coefficient is not divisible by 10,
- sign is `+1` or `-1`.

Zero MUST have a single canonical form:

- sign = `0`,
- coefficient = `0`,
- scale = `0`.

Negative zero is forbidden.

### 3.3 Verification Escape Domain

General rational representation is permitted only for verification-only payloads where exact local replay cannot be expressed in canonical decimal form without semantic loss.

Such payloads MUST be marked as verification-only and MUST NOT be used as canonical ordering keys for frontier state identity.

## 4. Canonical Scalar Envelope

Every correctness-critical scalar field serialized outside a larger typed struct MUST use the following envelope.

- scalarEncodingKind: `decimalCanonicalV1` or `rationalVerificationV1`
- payloadLength
- payloadBytes

Typed parent payloads MAY omit the outer envelope only if the parent schema already fixes the scalar encoding kind and field layout.

## 5. Byte Order and Primitive Conventions

Unless otherwise stated:

- unsigned integers use ULEB128,
- signed integers use ZigZag-encoded SLEB128,
- raw integer magnitude bytes use big-endian byte order,
- boolean flags use one byte with values `0x00` or `0x01`,
- field order is exactly the schema order declared in this document.

No locale-sensitive formatting, text decimals, exponent notation, or JSON number serialization is permitted in canonical payloads.

## 6. Decimal Payload Layout

The `decimalCanonicalV1` payload layout is:

1. `signCode : u8`
2. `scale : ULEB128`
3. `coefficientByteLength : ULEB128`
4. `coefficientMagnitude : byte[coefficientByteLength]`

### 6.1 signCode

- `0x00` means zero
- `0x01` means positive
- `0x02` means negative

Any other value is invalid.

### 6.2 coefficientMagnitude

`coefficientMagnitude` is the unsigned base-256 magnitude of `coefficient` encoded in minimal big-endian form.

The following are forbidden:

- leading zero bytes,
- empty magnitude for non-zero values,
- non-zero magnitude when `signCode = 0x00`.

### 6.3 Canonical Examples

- `0` -> `signCode=0x00`, `scale=0`, `coefficientByteLength=0`
- `12.34` -> `signCode=0x01`, `scale=2`, `coefficient=1234`
- `-7.5` -> `signCode=0x02`, `scale=1`, `coefficient=75`

## 7. Rational Verification Escape Layout

The `rationalVerificationV1` payload layout is:

1. `numeratorSignCode : u8`
2. `numeratorByteLength : ULEB128`
3. `numeratorMagnitude : byte[numeratorByteLength]`
4. `denominatorByteLength : ULEB128`
5. `denominatorMagnitude : byte[denominatorByteLength]`

### 7.1 Rational Normalization

Rational verification payloads MUST satisfy:

- denominator > 0,
- numerator and denominator are coprime,
- zero is encoded as numerator sign zero, numerator magnitude empty, denominator magnitude equal to `0x01`,
- negative denominator is forbidden.

### 7.2 Usage Restriction

`rationalVerificationV1` MAY appear only in:

- verification-only certificate payload sections,
- exact replay artifacts,
- diagnostic escalation artifacts explicitly marked as non-canonical for state identity.

It MUST NOT appear in:

- frontier state keys,
- compatibility signatures,
- canonical state ordering payloads,
- any artifact identity field that is declared decimal-canonical by parent schema.

## 8. Ordering Semantics

### 8.1 Numeric Ordering

Canonical byte order is not the numeric comparison rule.

Numeric comparison of two decimal-canonical values MUST follow mathematical comparison of:

`sign * coefficient * 10^(-scale)`

Implementations MUST use an exact comparison algorithm. They MUST NOT compare via lossy float conversion.

### 8.2 Equality

Two canonical decimal payloads are equal if and only if their serialized bytes are equal.

This holds because the normalization rules prohibit alternate encodings of the same value.

### 8.3 Stable Ordering Key Derivation

If a schema requires a sortable comparison key for block-local ordering, the key MUST be derived from exact arithmetic semantics, not lexicographic payload bytes.

The derived ordering key algorithm MUST be fixed by the parent schema that uses it.

## 9. Hashing and Content Identity

- Canonical content hashes MUST include the scalar encoding kind.
- Canonical content hashes MUST include only normalized bytes.
- Compression codec choice MUST NOT change canonical payload bytes.
- Transport framing MUST NOT change canonical payload bytes.

Any change to normalization or primitive encoding rules requires a new schema version.

## 10. Field Classification Rules

Every scalar-bearing parent schema MUST classify each scalar field as one of:

- `canonicalDecimal`
- `verificationRationalOnly`
- `nonCanonicalTelemetry`

`nonCanonicalTelemetry` fields are outside this canonical wire format and MUST NOT participate in correctness-critical identity or ordering.

## 11. Validation Rules

A decoder MUST reject any payload that violates one or more of the following:

- invalid sign code,
- non-minimal magnitude encoding,
- zero encoded with non-zero scale or non-empty coefficient,
- non-zero coefficient divisible by 10,
- rational payload with non-coprime numerator and denominator,
- rational payload with zero or negative denominator,
- scalar kind not permitted by the parent schema.

## 12. Compatibility and Migration

- `decimalCanonicalV1` is the required canonical scalar encoding for initial lapic implementation.
- Future packed-decimal or limb-based variants require a new encoding kind and explicit compatibility policy.
- Backward readers MAY support older versions, but forward writers MUST emit the current canonical version only.

## 13. Implementation Checklist

Before a package may claim compliance with this specification, it MUST demonstrate:

- round-trip serialization and deserialization for decimal and rational escape payloads,
- canonical rejection tests for alternate decimal encodings,
- hash stability across browser and Node runtimes,
- exact comparison tests that do not rely on binary float conversion,
- parent-schema validation tests for forbidden rational placement.
