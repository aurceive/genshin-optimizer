/**
 * Deterministic priority queue for lapic work units.
 *
 * Implements a binary min-heap ordered by LapicPriorityDescriptor.
 * The queue guarantees deterministic dequeue order: given the same
 * set of enqueued items, the dequeue sequence is identical regardless
 * of insertion order (because ties are broken by enqueue sequence number).
 *
 * This is the core data structure underlying the work scheduler.
 */

import type { LapicWorkUnitEnvelope } from '../types'
import { comparePriorityDescriptors } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LapicPriorityQueueEntry {
  readonly workUnit: LapicWorkUnitEnvelope
  readonly enqueuedAtSequence: number
}

// ---------------------------------------------------------------------------
// Binary min-heap
// ---------------------------------------------------------------------------

function compareEntries(
  a: LapicPriorityQueueEntry,
  b: LapicPriorityQueueEntry
): number {
  const priorityResult = comparePriorityDescriptors(
    a.workUnit.priority,
    b.workUnit.priority
  )
  if (priorityResult !== 0) return priorityResult
  // Deterministic tie-break: earlier enqueue sequence wins
  return a.enqueuedAtSequence - b.enqueuedAtSequence
}

/**
 * A deterministic priority queue backed by a binary min-heap.
 *
 * Items are ordered by priority descriptor (highest priority first),
 * with ties broken by enqueue sequence number (FIFO among equals).
 */
export interface LapicPriorityQueue {
  /**
   * Insert a work unit into the queue.
   */
  enqueue(entry: LapicPriorityQueueEntry): void

  /**
   * Remove and return the highest-priority work unit.
   * Returns `undefined` if the queue is empty.
   */
  dequeue(): LapicPriorityQueueEntry | undefined

  /**
   * Peek at the highest-priority work unit without removing it.
   */
  peek(): LapicPriorityQueueEntry | undefined

  /**
   * Remove a specific work unit by ID.
   * Returns the removed entry, or `undefined` if not found.
   */
  remove(workUnitId: string): LapicPriorityQueueEntry | undefined

  /**
   * Number of items currently in the queue.
   */
  readonly size: number

  /**
   * Whether the queue is empty.
   */
  isEmpty(): boolean

  /**
   * Return all entries in priority order (for inspection/debugging).
   * Does not modify the queue.
   */
  toSortedArray(): readonly LapicPriorityQueueEntry[]
}

/**
 * Create a new empty priority queue.
 */
export function createLapicPriorityQueue(): LapicPriorityQueue {
  const heap: LapicPriorityQueueEntry[] = []
  const indexById = new Map<string, number>()

  function swap(i: number, j: number): void {
    const a = heap[i]!
    const b = heap[j]!
    heap[i] = b
    heap[j] = a
    indexById.set(a.workUnit.workUnitId, j)
    indexById.set(b.workUnit.workUnitId, i)
  }

  function siftUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2)
      if (compareEntries(heap[i]!, heap[parent]!) < 0) {
        swap(i, parent)
        i = parent
      } else {
        break
      }
    }
  }

  function siftDown(i: number): void {
    const n = heap.length
    while (true) {
      let smallest = i
      const left = 2 * i + 1
      const right = 2 * i + 2

      if (left < n && compareEntries(heap[left]!, heap[smallest]!) < 0)
        smallest = left
      if (right < n && compareEntries(heap[right]!, heap[smallest]!) < 0)
        smallest = right

      if (smallest !== i) {
        swap(i, smallest)
        i = smallest
      } else {
        break
      }
    }
  }

  return {
    enqueue(entry: LapicPriorityQueueEntry): void {
      const idx = heap.length
      heap.push(entry)
      indexById.set(entry.workUnit.workUnitId, idx)
      siftUp(idx)
    },

    dequeue(): LapicPriorityQueueEntry | undefined {
      if (heap.length === 0) return undefined
      const top = heap[0]!
      indexById.delete(top.workUnit.workUnitId)

      if (heap.length === 1) {
        heap.pop()
        return top
      }

      heap[0] = heap.pop()!
      indexById.set(heap[0]!.workUnit.workUnitId, 0)
      siftDown(0)
      return top
    },

    peek(): LapicPriorityQueueEntry | undefined {
      return heap[0]
    },

    remove(workUnitId: string): LapicPriorityQueueEntry | undefined {
      const idx = indexById.get(workUnitId)
      if (idx === undefined) return undefined

      const entry = heap[idx]!
      indexById.delete(workUnitId)

      if (idx === heap.length - 1) {
        heap.pop()
        return entry
      }

      heap[idx] = heap.pop()!
      indexById.set(heap[idx]!.workUnit.workUnitId, idx)
      siftUp(idx)
      siftDown(idx)
      return entry
    },

    get size(): number {
      return heap.length
    },

    isEmpty(): boolean {
      return heap.length === 0
    },

    toSortedArray(): readonly LapicPriorityQueueEntry[] {
      return [...heap].sort(compareEntries)
    },
  }
}
