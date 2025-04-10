import type { Tag } from '../tag'
import { type CustomInfo, customOps } from './custom'
export * from './arrayMap'
export * from './custom'

type DebugMode = boolean

let debugMode = false
export function setDebugMode(mode: DebugMode) {
  debugMode = mode
}
export function isDebug(_: 'calc' | 'tag_db'): boolean {
  return debugMode
}

export function assertUnreachable(value: never): never {
  throw new Error(`Should not reach this with value ${value}`)
}

export const tagString = (record: Tag): string =>
  `{ ${Object.entries(record)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')} }`

export const extract = <V, K extends keyof V>(arr: V[], key: K): V[K][] =>
  arr.map((v) => v[key])

export function addCustomOperation(name: string, info: CustomInfo) {
  if (name in customOps) throw new Error(`Already set custom formula: ${name}`)
  customOps[name] = info
}
