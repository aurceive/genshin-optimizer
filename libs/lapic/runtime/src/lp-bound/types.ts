import type {
  LapicFirGraph,
  LapicFirVariableId,
  LapicLpProvider,
} from '@genshin-optimizer/lapic/core'
import type { LapicFirDomainVariableMap } from '../fir-bound/types'

/**
 * Configuration for creating an LP-based bound provider.
 *
 * Follows the same structure as {@link LapicFirBoundProviderConfig}
 * but additionally requires an LP provider to solve compiled models.
 */
export interface LapicLpBoundProviderConfig {
  /** Pre-compiled F-IR graph for the objective function. */
  readonly graph: LapicFirGraph
  /** Variable maps for each domain in the problem. */
  readonly domainVariableMaps: readonly LapicFirDomainVariableMap[]
  /** Global constants not tied to any domain (e.g., base stats). */
  readonly globalConstants?: ReadonlyMap<LapicFirVariableId, number>
  /** LP solver provider implementing the LapicLpProvider contract. */
  readonly lpProvider: LapicLpProvider
  /**
   * Converts a numeric upper bound to a string for ordering-key
   * comparison with evaluations. Default: `String(value)`.
   */
  readonly formatUpperBound?: (value: number) => string
  /**
   * Model digest prefix used for certificate traceability.
   * Each compiled model gets a digest of the form `{prefix}:{partialHash}`.
   * Default: `'lp-bound'`.
   */
  readonly modelDigestPrefix?: string
}

/**
 * Configuration for a cascade bound provider that tries a primary
 * evaluator first and falls back to a secondary one when the
 * primary returns no useful bound or a wider bound.
 *
 * Typical use: interval-based bounds as primary (fast), LP-based
 * bounds as secondary (tighter but slower).
 */
export interface LapicCascadeBoundProviderConfig {
  /** Primary bound evaluator — tried first. */
  readonly primary: LapicCascadeBoundEvaluator
  /** Secondary bound evaluator — tried when primary is absent or wider. */
  readonly secondary: LapicCascadeBoundEvaluator
  /**
   * Strategy for combining bounds.
   *
   * - `'tightest'`: Returns whichever bound is smaller (tighter).
   *   Both evaluators are always invoked.
   * - `'fallback'`: Returns primary if available; otherwise secondary.
   *   Secondary is only invoked when primary returns `undefined`.
   *
   * Default: `'fallback'`.
   */
  readonly strategy?: 'tightest' | 'fallback'
}

/**
 * A bound evaluator function usable in a cascade.
 * Same signature as {@link LapicBoundedExactUpperBoundEvaluator}.
 */
export type LapicCascadeBoundEvaluator = (partial: {
  readonly assignedCandidates: readonly {
    readonly domainId: string
    readonly candidateId: string
  }[]
  readonly assignedDomainCount: number
  readonly totalDomainCount: number
  readonly problem: unknown
}) =>
  | { readonly upperBoundValue: string; readonly evidenceDigest: string }
  | undefined
