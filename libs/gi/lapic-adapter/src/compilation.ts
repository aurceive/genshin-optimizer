/**
 * OptNode → F-IR compiler.
 *
 * Walks a GI `OptNode` DAG and produces an equivalent `LapicFirGraph`
 * via the hash-consing builder. Supports the core operator set
 * (const, read, add, mul, min, max, res, threshold with constant
 * threshold). Operations without an F-IR equivalent (sum_frac,
 * threshold with expression threshold) produce compilation errors.
 */

import type { ConstantNode, OptNode, ReadNode } from '@genshin-optimizer/gi/wr'
import type {
  LapicFirGraph,
  LapicFirNodeId,
  LapicFirVariableId,
} from '@genshin-optimizer/lapic/core'
import { LapicFirGraphBuilder } from '@genshin-optimizer/lapic/core'

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Successful compilation result. */
export interface GiLapicFirCompilationResult {
  /** The compiled F-IR graph. */
  readonly graph: LapicFirGraph
  /**
   * Maps the serialised OptNode read-path (joined with `:`)
   * to the F-IR variable ID used in the graph.
   */
  readonly variableMapping: ReadonlyMap<string, LapicFirVariableId>
}

/** A single compilation error. */
export interface GiLapicFirCompilationError {
  readonly kind: 'unsupported-operation' | 'invalid-structure'
  readonly operation: string
  readonly message: string
}

/** Discriminated outcome: success or failure with diagnostics. */
export type GiLapicFirCompilationOutcome =
  | { readonly ok: true; readonly result: GiLapicFirCompilationResult }
  | {
      readonly ok: false
      readonly errors: readonly GiLapicFirCompilationError[]
    }

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile a GI `OptNode` DAG into an equivalent `LapicFirGraph`.
 *
 * The compiler walks the DAG recursively with memoisation (one F-IR
 * node per unique OptNode reference) and produces a graph suitable
 * for both scalar evaluation and interval-based bound computation.
 *
 * Returns `{ ok: false, errors }` when the tree contains operations
 * that have no F-IR equivalent (currently: `sum_frac`, threshold
 * with a non-constant comparison expression).
 */
export function compileGiOptNodeToFir(
  root: OptNode
): GiLapicFirCompilationOutcome {
  const compiler = new OptNodeFirCompiler()
  const rootId = compiler.compile(root)

  if (compiler.errors.length > 0) {
    return { ok: false, errors: compiler.errors }
  }

  return {
    ok: true,
    result: {
      graph: compiler.builder.build(rootId),
      variableMapping: new Map(compiler.variableMapping),
    },
  }
}

// ---------------------------------------------------------------------------
// Internal compiler
// ---------------------------------------------------------------------------

class OptNodeFirCompiler {
  readonly builder = new LapicFirGraphBuilder()
  readonly variableMapping = new Map<string, LapicFirVariableId>()
  readonly errors: GiLapicFirCompilationError[] = []

  private readonly memo = new WeakMap<OptNode, LapicFirNodeId>()

  /** Compile an OptNode to an F-IR node ID, memoising by reference. */
  compile(node: OptNode): LapicFirNodeId {
    const cached = this.memo.get(node)
    if (cached !== undefined) return cached

    const result = this.compileNode(node)
    this.memo.set(node, result)
    return result
  }

  private compileNode(node: OptNode): LapicFirNodeId {
    switch (node.operation) {
      case 'const':
        return this.builder.constant((node as ConstantNode<number>).value)

      case 'read':
        return this.compileRead(node)

      case 'add':
        return this.builder.add(...this.compileOperands(node))

      case 'mul':
        return this.builder.mul(...this.compileOperands(node))

      case 'min':
        return this.builder.min(...this.compileOperands(node))

      case 'max':
        return this.builder.max(...this.compileOperands(node))

      case 'res':
        return this.builder.resistanceTransform(
          this.compile(node.operands[0] as OptNode)
        )

      case 'threshold':
        return this.compileThreshold(node)

      case 'sum_frac':
        this.errors.push({
          kind: 'unsupported-operation',
          operation: 'sum_frac',
          message:
            'sum_frac (x/(x+c)) requires division, which has no F-IR equivalent',
        })
        return this.builder.constant(0)

      default:
        this.errors.push({
          kind: 'unsupported-operation',
          operation: String(
            (node as Record<string, unknown>)['operation'] ?? 'unknown'
          ),
          message: `Unknown OptNode operation`,
        })
        return this.builder.constant(0)
    }
  }

  private compileRead(node: OptNode): LapicFirNodeId {
    const path = (node as ReadNode<number>).path
    const variableId = path.join(':')
    this.variableMapping.set(variableId, variableId)
    return this.builder.read(variableId)
  }

  /**
   * OptNode threshold: operands = [value, threshold, pass, fail]
   *   value >= threshold ? pass : fail
   *
   * F-IR thresholdSelect requires a constant threshold number.
   */
  private compileThreshold(node: OptNode): LapicFirNodeId {
    const ops = node.operands as readonly OptNode[]
    const guardNode = ops[0]!
    const threshNode = ops[1]!
    const thenNode = ops[2]!
    const elseNode = ops[3]!

    if (threshNode.operation !== 'const') {
      this.errors.push({
        kind: 'unsupported-operation',
        operation: 'threshold',
        message:
          'threshold with non-constant comparison value is not supported in F-IR',
      })
      return this.builder.constant(0)
    }

    const thresholdValue = (threshNode as ConstantNode<number>).value

    return this.builder.thresholdSelect(
      this.compile(guardNode),
      thresholdValue,
      this.compile(thenNode),
      this.compile(elseNode)
    )
  }

  private compileOperands(node: OptNode): LapicFirNodeId[] {
    return (node.operands as readonly OptNode[]).map((op) => this.compile(op))
  }
}
