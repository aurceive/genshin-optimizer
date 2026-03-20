import {
  hasUniqueValues,
  isBoolean,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
} from './primitives'

describe('lapic validation primitives', () => {
  it('recognizes plain records', () => {
    expect(isRecord({ key: 'value' })).toBe(true)
    expect(isRecord(null)).toBe(false)
    expect(isRecord(['value'])).toBe(false)
  })

  it('recognizes non-empty strings', () => {
    expect(isNonEmptyString('value')).toBe(true)
    expect(isNonEmptyString('')).toBe(false)
    expect(isNonEmptyString(1)).toBe(false)
  })

  it('recognizes booleans and non-negative integers', () => {
    expect(isBoolean(true)).toBe(true)
    expect(isBoolean('true')).toBe(false)
    expect(isNonNegativeInteger(0)).toBe(true)
    expect(isNonNegativeInteger(-1)).toBe(false)
    expect(isNonNegativeInteger(1.5)).toBe(false)
  })

  it('detects duplicate string values', () => {
    expect(hasUniqueValues(['a', 'b', 'c'])).toBe(true)
    expect(hasUniqueValues(['a', 'b', 'a'])).toBe(false)
  })
})
