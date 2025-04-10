/**
 * Whether the function is `inc`reasing/`dec`reasing in wide sense w.r.t. to
 * an argument. Note that having both `inc` and `dec` means the function is
 * constant w.r.t. the argument, while neither means that the argument affects
 * the function result non-monotonically.
 */
export type Monotonicity = { inc: boolean; dec: boolean }
export type Range = { min: number; max: number }

export type CustomInfo = {
  /** Given a range of each argument, returns the range of the result */
  range: (r: Range[]) => Range
  /** Given the arguments ranges, returns the monotonicity w.r.t. each argument */
  monotonicity: (r: Range[]) => Monotonicity[]
  /**
   * Actual computation of the custom node. `calc.toString` must be a valid
   * standalone function declaration if used with `compile`. Generally, a
   * function or arrow expression with no external function call will suffice.
   */
  calc: (_: (number | string)[]) => number | string
  /**
   * The dual part of `calc(x + dx e)` where `e = sqrt(0), e !== 0`. This has the
   * same declaration restriction as `calc`.
   */
  diff?: (x: number[], dx: number[]) => number
}

// This needs to be set only once at the beginning of the program.
export const customOps: Record<string, CustomInfo> = {}
