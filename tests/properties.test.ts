import { describe, expect, it } from 'vitest'
import {
  formatAlignment,
  formatNumber,
  formatPadding,
  formatPaints,
  formatProperty,
  formatRadii,
  looksLikeVariantName,
  px,
  PROPERTY_LABELS,
  titleCase,
  UNKNOWN_VALUE,
  type PaintInfo,
} from '../src/shared/format/properties'
import { PROPERTY_TYPES } from '../src/shared/types'

const paint = (overrides: Partial<PaintInfo> = {}): PaintInfo => ({
  hex: '#FF0000',
  opacity: 1,
  kind: 'SOLID',
  visible: true,
  ...overrides,
})

describe('formatNumber', () => {
  it('drops decimals on exact integers', () => {
    expect(formatNumber(414)).toBe('414')
    expect(formatNumber(414.0)).toBe('414')
  })

  it('keeps up to two decimals', () => {
    expect(formatNumber(413.99)).toBe('413.99')
    expect(formatNumber(413.994)).toBe('413.99')
    expect(formatNumber(413.996)).toBe('414')
  })

  it('handles negative and zero-ish values', () => {
    expect(formatNumber(-8.5)).toBe('-8.5')
    expect(formatNumber(-0.001)).toBe('0')
  })

  it('falls back for non-finite input', () => {
    expect(formatNumber(Number.NaN)).toBe(UNKNOWN_VALUE)
    expect(px(Number.POSITIVE_INFINITY)).toBe(UNKNOWN_VALUE)
  })

  it('appends px', () => {
    expect(px(414)).toBe('414px')
    expect(px(1.5)).toBe('1.5px')
  })
})

describe('titleCase', () => {
  it('normalises enum values', () => {
    expect(titleCase('SPACE_BETWEEN')).toBe('Space between')
    expect(titleCase('LEFT')).toBe('Left')
    expect(titleCase('vertical')).toBe('Vertical')
  })
})

describe('formatAlignment', () => {
  it('matches the vertical matrix from the PRD', () => {
    expect(formatAlignment('VERTICAL', 'MIN', 'MIN')).toBe('Top left')
    expect(formatAlignment('VERTICAL', 'CENTER', 'MIN')).toBe('Center left')
    expect(formatAlignment('VERTICAL', 'MAX', 'MIN')).toBe('Bottom left')
    expect(formatAlignment('VERTICAL', 'SPACE_BETWEEN', 'MIN')).toBe('Space between left')
    expect(formatAlignment('VERTICAL', 'MIN', 'CENTER')).toBe('Top center')
    expect(formatAlignment('VERTICAL', 'CENTER', 'CENTER')).toBe('Center')
    expect(formatAlignment('VERTICAL', 'MAX', 'MAX')).toBe('Bottom right')
    expect(formatAlignment('VERTICAL', 'SPACE_BETWEEN', 'CENTER')).toBe('Space between center')
  })

  it('swaps axes for horizontal layouts', () => {
    expect(formatAlignment('HORIZONTAL', 'MIN', 'MIN')).toBe('Top left')
    expect(formatAlignment('HORIZONTAL', 'MAX', 'MAX')).toBe('Bottom right')
  })

  it('puts baseline first', () => {
    expect(formatAlignment('HORIZONTAL', 'MIN', 'BASELINE')).toBe('Baseline left')
    expect(formatAlignment('HORIZONTAL', 'SPACE_BETWEEN', 'BASELINE')).toBe(
      'Baseline space between'
    )
  })

  it('is unavailable without auto layout', () => {
    expect(formatAlignment('NONE', 'MIN', 'MIN')).toBe(UNKNOWN_VALUE)
  })
})

describe('formatPadding', () => {
  it('collapses equal values', () => {
    expect(formatPadding(0, 0, 0, 0)).toBe('0px')
    expect(formatPadding(16, 16, 16, 16)).toBe('16px')
  })

  it('uses two values for symmetric padding', () => {
    expect(formatPadding(8, 16, 8, 16)).toBe('8px 16px')
  })

  it('uses four values otherwise', () => {
    expect(formatPadding(1, 2, 3, 4)).toBe('1px 2px 3px 4px')
  })
})

describe('formatRadii', () => {
  it('collapses equal corners', () => {
    expect(formatRadii(8, 8, 8, 8)).toBe('8px')
  })

  it('lists four corners when mixed', () => {
    expect(formatRadii(1, 2, 3, 4)).toBe('1px 2px 3px 4px')
  })
})

describe('formatPaints', () => {
  it('reports None for an empty list', () => {
    expect(formatPaints([])).toEqual({ value: 'None' })
  })

  it('ignores invisible paints', () => {
    expect(formatPaints([paint({ visible: false })])).toEqual({ value: 'None' })
  })

  it('returns hex plus swatch', () => {
    expect(formatPaints([paint({ hex: '#E5E5E5' })])).toEqual({
      value: '#E5E5E5',
      swatch: '#E5E5E5',
    })
  })

  it('appends the opacity below 100 percent', () => {
    expect(formatPaints([paint({ opacity: 0.5 })]).value).toBe('#FF0000 50%')
  })

  it('counts additional paints', () => {
    expect(formatPaints([paint(), paint({ hex: '#00FF00' })]).value).toBe('#FF0000 +1')
  })

  it('names non-solid paints', () => {
    const result = formatPaints([{ opacity: 1, kind: 'GRADIENT_LINEAR', visible: true }])
    expect(result).toEqual({ value: 'Gradient linear' })
  })
})

describe('formatProperty', () => {
  it('prefers a bound variable over everything', () => {
    const result = formatProperty({
      type: 'fills',
      variable: 'color/neutral/0',
      style: 'Surface/Base',
      raw: { k: 'paints', paints: [paint({ hex: '#FFFFFF' })] },
    })
    expect(result.value).toBe('color/neutral/0')
    expect(result.variable).toBe('color/neutral/0')
    expect(result.swatch).toBe('#FFFFFF')
  })

  it('falls back to the style name', () => {
    const result = formatProperty({
      type: 'fills',
      style: 'Surface/Base',
      raw: { k: 'paints', paints: [paint()] },
    })
    expect(result.value).toBe('Surface/Base')
    expect(result.variable).toBeUndefined()
  })

  it('formats mixed values', () => {
    expect(formatProperty({ type: 'strokeWeight', raw: { k: 'mixed' } }).value).toBe('Mixed')
  })

  it('formats mixed corner radii as four values', () => {
    const result = formatProperty({
      type: 'cornerRadius',
      raw: { k: 'radii', tl: 8, tr: 0, br: 8, bl: 0 },
    })
    expect(result.value).toBe('8px 0px 8px 0px')
  })

  it('formats gaps, including space-between', () => {
    expect(
      formatProperty({ type: 'itemSpacing', raw: { k: 'gap', v: 0, spaceBetween: false } }).value
    ).toBe('0px')
    expect(
      formatProperty({ type: 'itemSpacing', raw: { k: 'gap', v: 8, spaceBetween: true } }).value
    ).toBe('Auto')
  })

  it('formats effects', () => {
    expect(formatProperty({ type: 'effects', raw: { k: 'effects', count: 0 } }).value).toBe('None')
    expect(formatProperty({ type: 'effects', raw: { k: 'effects', count: 1 } }).value).toBe(
      '1 effect'
    )
    expect(formatProperty({ type: 'effects', raw: { k: 'effects', count: 3 } }).value).toBe(
      '3 effects'
    )
  })

  it('formats line height and letter spacing units', () => {
    expect(
      formatProperty({ type: 'lineHeight', raw: { k: 'lineHeight', unit: 'AUTO' } }).value
    ).toBe('Auto')
    expect(
      formatProperty({ type: 'lineHeight', raw: { k: 'lineHeight', unit: 'PIXELS', v: 24 } }).value
    ).toBe('24px')
    expect(
      formatProperty({ type: 'lineHeight', raw: { k: 'lineHeight', unit: 'PERCENT', v: 150 } })
        .value
    ).toBe('150%')
    expect(
      formatProperty({ type: 'letterSpacing', raw: { k: 'letterSpacing', unit: 'PIXELS', v: 0 } })
        .value
    ).toBe('0px')
    expect(
      formatProperty({ type: 'letterSpacing', raw: { k: 'letterSpacing', unit: 'PERCENT', v: 2 } })
        .value
    ).toBe('2%')
  })

  it('shows the component name, not its variants (D-024)', () => {
    const result = formatProperty({
      type: 'mainComponent',
      raw: { k: 'component', name: 'Button' },
    })
    expect(result.value).toBe('Button')
  })

  it('reports an empty component name as unknown', () => {
    expect(formatProperty({ type: 'mainComponent', raw: { k: 'component', name: '' } }).value).toBe(
      UNKNOWN_VALUE
    )
  })

  it('formats layout mode and absent values', () => {
    expect(formatProperty({ type: 'layoutMode', raw: { k: 'layoutMode', v: 'NONE' } }).value).toBe(
      'None'
    )
    expect(formatProperty({ type: 'layoutMode', raw: { k: 'layoutMode', v: 'GRID' } }).value).toBe(
      'Grid'
    )
    expect(formatProperty({ type: 'textStyleId', raw: { k: 'absent' } }).value).toBe('None')
    expect(formatProperty({ type: 'textStyleId', raw: { k: 'str', v: '' } }).value).toBe('None')
  })

  it('formats numbers, percentages and title case', () => {
    expect(formatProperty({ type: 'fontWeight', raw: { k: 'num', v: 600 } }).value).toBe('600')
    expect(formatProperty({ type: 'opacity', raw: { k: 'percent', v: 100 } }).value).toBe('100%')
    expect(
      formatProperty({ type: 'textAlignHorizontal', raw: { k: 'titleCase', v: 'LEFT' } }).value
    ).toBe('Left')
    expect(
      formatProperty({ type: 'textAlignHorizontal', raw: { k: 'titleCase', v: '' } }).value
    ).toBe('None')
  })

  it('formats padding and alignment through the entry point', () => {
    expect(
      formatProperty({
        type: 'padding',
        raw: { k: 'padding', top: 0, right: 0, bottom: 0, left: 0 },
      }).value
    ).toBe('0px')
    expect(
      formatProperty({
        type: 'alignItems',
        raw: { k: 'align', layoutMode: 'VERTICAL', primary: 'MIN', counter: 'CENTER' },
      }).value
    ).toBe('Top center')
  })

  it('returns the fallback when no raw value is given', () => {
    expect(formatProperty({ type: 'width' }).value).toBe(UNKNOWN_VALUE)
  })

  it('detects variant combinations, which are not component names', () => {
    expect(looksLikeVariantName('variant=primary, state=enabled')).toBe(true)
    expect(looksLikeVariantName('variant=single')).toBe(true)
    expect(looksLikeVariantName('Size=Large, Icon=true')).toBe(true)
    // An empty variant value is still a variant combination.
    expect(looksLikeVariantName('state=')).toBe(true)
    expect(looksLikeVariantName('Button')).toBe(false)
    expect(looksLikeVariantName('Button / Primary')).toBe(false)
    expect(looksLikeVariantName('')).toBe(false)
  })

  it('has a label for every one of the 33 property types', () => {
    expect(PROPERTY_TYPES).toHaveLength(33)
    for (const type of PROPERTY_TYPES) {
      expect(PROPERTY_LABELS[type]).toBeTruthy()
    }
  })
})
