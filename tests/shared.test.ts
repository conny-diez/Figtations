import { describe, expect, it } from 'vitest'
import { CATEGORY_HEX, hexToRgb, rgbToHex, CARD_THEMES } from '../src/shared/tokens'
import { createId } from '../src/shared/ids'
import { isMainEvent, isUiMessage } from '../src/shared/rpc'
import {
  CATEGORY_COLORS,
  DEFAULT_SETTINGS,
  isCategoryColor,
  isPropertyType,
} from '../src/shared/types'

describe('colour conversion', () => {
  it('round-trips hex values', () => {
    for (const color of CATEGORY_COLORS) {
      const hex = CATEGORY_HEX[color]
      expect(rgbToHex(hexToRgb(hex))).toBe(hex)
    }
  })

  it('accepts short form and missing hash', () => {
    expect(hexToRgb('fff')).toEqual({ r: 1, g: 1, b: 1 })
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('falls back to black on malformed input', () => {
    expect(hexToRgb('nope')).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('clamps out-of-range channels', () => {
    expect(rgbToHex({ r: 2, g: -1, b: 0.5 })).toBe('#FF0080')
  })

  it('ships both themes', () => {
    expect(CARD_THEMES.dark.cardFill).toBe('#2C2C2C')
    expect(CARD_THEMES.light.cardFill).toBe('#FFFFFF')
    expect(CARD_THEMES.light.labelText).toBe('#1A1A1A')
  })
})

describe('createId', () => {
  it('produces unique, non-empty ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createId()))
    expect(ids.size).toBe(500)
    for (const id of ids) expect(id.length).toBeGreaterThan(8)
  })
})

describe('type guards', () => {
  it('validates category colours', () => {
    expect(isCategoryColor('teal')).toBe(true)
    expect(isCategoryColor('turquoise')).toBe(false)
    expect(isCategoryColor(42)).toBe(false)
  })

  it('validates property types', () => {
    expect(isPropertyType('cornerRadius')).toBe(true)
    expect(isPropertyType('borderRadius')).toBe(false)
    expect(isPropertyType(null)).toBe(false)
  })

  it('validates UI messages', () => {
    expect(isUiMessage({ requestId: 'r1', req: { t: 'init' } })).toBe(true)
    expect(isUiMessage({ requestId: 'r1' })).toBe(false)
    expect(isUiMessage({ req: { t: 'init' } })).toBe(false)
    expect(isUiMessage(null)).toBe(false)
  })

  it('validates main events', () => {
    expect(isMainEvent({ t: 'toast', level: 'info', message: 'hi' })).toBe(true)
    expect(isMainEvent({})).toBe(false)
    expect(isMainEvent('toast')).toBe(false)
  })
})

describe('defaults', () => {
  it('matches the PRD defaults', () => {
    expect(DEFAULT_SETTINGS.cardWidth).toBe(280)
    expect(DEFAULT_SETTINGS.theme).toBe('dark')
    expect(DEFAULT_SETTINGS.connectorStyle).toBe('elbow')
    expect(DEFAULT_SETTINGS.connectorDashed).toBe(false)
    expect(DEFAULT_SETTINGS.connectorCornerRadius).toBe(12)
    expect(DEFAULT_SETTINGS.connectorWeight).toBe(1.5)
    expect(DEFAULT_SETTINGS.arrangeGutter).toBe(80)
    // Deviations from the PRD defaults, see DECISIONS.md D-022.
    expect(DEFAULT_SETTINGS.showCardLayerName).toBe(false)
  })
})
