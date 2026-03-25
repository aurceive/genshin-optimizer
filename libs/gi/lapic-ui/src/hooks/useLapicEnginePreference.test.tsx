import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import React from 'react'
import {
  LapicEngineProvider,
  useLapicEnginePreference,
} from './useLapicEnginePreference'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useLapicEnginePreference', () => {
  it('returns default context values when used outside provider', () => {
    const { result } = renderHook(() => useLapicEnginePreference())

    expect(result.current.engine).toBe('legacy')
    expect(result.current.lapicAvailable).toBe(false)
    expect(result.current.setEngine).toBeDefined()
  })

  it('reads engine value from provider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LapicEngineProvider engine="lapic" onEngineChange={() => {}}>
        {children}
      </LapicEngineProvider>
    )

    const { result } = renderHook(() => useLapicEnginePreference(), {
      wrapper,
    })

    expect(result.current.engine).toBe('lapic')
    expect(result.current.lapicAvailable).toBe(true)
  })

  it('defaults lapicAvailable to true inside provider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LapicEngineProvider engine="legacy" onEngineChange={() => {}}>
        {children}
      </LapicEngineProvider>
    )

    const { result } = renderHook(() => useLapicEnginePreference(), {
      wrapper,
    })
    expect(result.current.lapicAvailable).toBe(true)
  })

  it('respects lapicAvailable=false from provider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LapicEngineProvider
        engine="legacy"
        onEngineChange={() => {}}
        lapicAvailable={false}
      >
        {children}
      </LapicEngineProvider>
    )

    const { result } = renderHook(() => useLapicEnginePreference(), {
      wrapper,
    })
    expect(result.current.lapicAvailable).toBe(false)
  })

  it('calls onEngineChange when setEngine is invoked', () => {
    const onEngineChange = vi.fn()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LapicEngineProvider engine="legacy" onEngineChange={onEngineChange}>
        {children}
      </LapicEngineProvider>
    )

    const { result } = renderHook(() => useLapicEnginePreference(), {
      wrapper,
    })

    act(() => {
      result.current.setEngine('lapic')
    })
    expect(onEngineChange).toHaveBeenCalledWith('lapic')
    expect(onEngineChange).toHaveBeenCalledTimes(1)
  })

  it('updates context when provider props change', () => {
    let engine: 'legacy' | 'lapic' = 'legacy'

    const wrapper = ({ children }: { children: ReactNode }) => (
      <LapicEngineProvider engine={engine} onEngineChange={() => {}}>
        {children}
      </LapicEngineProvider>
    )

    const { result, rerender } = renderHook(() => useLapicEnginePreference(), {
      wrapper,
    })

    expect(result.current.engine).toBe('legacy')

    engine = 'lapic'
    rerender()
    expect(result.current.engine).toBe('lapic')
  })
})
