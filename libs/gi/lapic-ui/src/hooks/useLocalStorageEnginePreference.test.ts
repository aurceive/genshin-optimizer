import { act, renderHook } from '@testing-library/react'
import { useLocalStorageEnginePreference } from './useLocalStorageEnginePreference'

const STORAGE_KEY = 'gi-optimizer-engine'

beforeEach(() => {
  localStorage.clear()
})

describe('useLocalStorageEnginePreference', () => {
  it('defaults to legacy when localStorage is empty', () => {
    const { result } = renderHook(() => useLocalStorageEnginePreference())
    expect(result.current[0]).toBe('legacy')
  })

  it('reads "lapic" from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'lapic')
    const { result } = renderHook(() => useLocalStorageEnginePreference())
    expect(result.current[0]).toBe('lapic')
  })

  it('treats unknown stored value as legacy', () => {
    localStorage.setItem(STORAGE_KEY, 'quantum')
    const { result } = renderHook(() => useLocalStorageEnginePreference())
    expect(result.current[0]).toBe('legacy')
  })

  it('setEngine updates state and persists to localStorage', () => {
    const { result } = renderHook(() => useLocalStorageEnginePreference())
    act(() => {
      result.current[1]('lapic')
    })
    expect(result.current[0]).toBe('lapic')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('lapic')
  })

  it('setEngine back to legacy persists correctly', () => {
    localStorage.setItem(STORAGE_KEY, 'lapic')
    const { result } = renderHook(() => useLocalStorageEnginePreference())
    act(() => {
      result.current[1]('legacy')
    })
    expect(result.current[0]).toBe('legacy')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('legacy')
  })

  it('gracefully handles localStorage errors on read', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError')
      })
    const { result } = renderHook(() => useLocalStorageEnginePreference())
    expect(result.current[0]).toBe('legacy')
    spy.mockRestore()
  })

  it('gracefully handles localStorage errors on write', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceeded')
      })
    const { result } = renderHook(() => useLocalStorageEnginePreference())
    act(() => {
      result.current[1]('lapic')
    })
    // State still updates even though persistence failed
    expect(result.current[0]).toBe('lapic')
    spy.mockRestore()
  })
})
