/**
 * Polyfill for nested Web Workers in Vite dev mode.
 *
 * Vite injects `process.env.NODE_ENV` replacements for first-level
 * workers, but nested workers (Worker created from another Worker)
 * don't get this transformation.  Some libraries (e.g. React internals)
 * reference `process.env.NODE_ENV` at module load time, causing
 * "ReferenceError: process is not defined".
 *
 * This module MUST be the first import in the sub-worker entry point
 * so that `process` is defined before any library code executes.
 */
if (typeof globalThis.process === 'undefined') {
  const g = globalThis as unknown as Record<string, unknown>
  g.process = { env: { NODE_ENV: 'development' } }
}
