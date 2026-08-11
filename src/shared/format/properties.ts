/**
 * Property label + value formatting (PRD FR-3b).
 *
 * Pure functions only: `probe.ts` reads the raw data off a node and hands over a
 * plain `PropertyInput`, everything below is testable without the Figma API.
 *
 * Resolution order per value: bound variable → style → raw value.
 */
import type { PropertyType } from '../types'

/** Display labels (PRD FR-3b, column "Anzeige-Key"). */
export const PROPERTY_LABELS: Record<PropertyType, string> = {
  width: 'Width',
  height: 'Height',
  maxWidth: 'Max width',
  minWidth: 'Min width',
  maxHeight: 'Max height',
  minHeight: 'Min height',
  fills: 'Fill',
  strokes: 'Stroke',
  effects: 'Effects',
  strokeWeight: 'Stroke weight',
  cornerRadius: 'Corner radius',
  textStyleId: 'Text style',
  textAlignHorizontal: 'Text align',
  fontFamily: 'Font',
  fontStyle: 'Font style',
  fontSize: 'Font size',
  fontWeight: 'Font weight',
  lineHeight: 'Line height',
  letterSpacing: 'Letter spacing',
  itemSpacing: 'Gap',
  padding: 'Padding',
  layoutMode: 'Direction',
  alignItems: 'Alignment',
  opacity: 'Opacity',
  mainComponent: 'Component',
  gridRowGap: 'Grid row gap',
  gridColumnGap: 'Grid column gap',
  gridRowCount: 'Grid rows',
  gridColumnCount: 'Grid columns',
  gridRowAnchorIndex: 'Grid row anchor',
  gridColumnAnchorIndex: 'Grid column anchor',
  gridRowSpan: 'Grid row span',
  gridColumnSpan: 'Grid column span',
}

/** Fallback for a property we cannot resolve — never crash (PRD FR-3 acceptance). */
export const UNKNOWN_VALUE = '—'

export type AxisAlign = 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN' | 'BASELINE'
export type LayoutMode = 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID'

export interface PaintInfo {
  /** `#RRGGBB`, absent for non-solid paints. */
  hex?: string
  /** 0…1 */
  opacity: number
  /** e.g. 'GRADIENT_LINEAR', 'IMAGE' */
  kind: string
  visible: boolean
}

/**
 * Raw, Figma-free representation of a property's value.
 * `{ k: 'mixed' }` stands in for `figma.mixed`.
 */
export type RawValue =
  | { k: 'mixed' }
  | { k: 'absent' }
  | { k: 'num'; v: number }
  | { k: 'px'; v: number }
  | { k: 'str'; v: string }
  | { k: 'percent'; v: number }
  | { k: 'padding'; top: number; right: number; bottom: number; left: number }
  | { k: 'radii'; tl: number; tr: number; br: number; bl: number }
  | { k: 'layoutMode'; v: LayoutMode }
  | { k: 'align'; layoutMode: LayoutMode; primary: AxisAlign; counter: AxisAlign }
  | { k: 'gap'; v: number; spaceBetween: boolean }
  | { k: 'paints'; paints: PaintInfo[] }
  | { k: 'effects'; count: number }
  | { k: 'lineHeight'; unit: 'AUTO' | 'PIXELS' | 'PERCENT'; v?: number }
  | { k: 'letterSpacing'; unit: 'PIXELS' | 'PERCENT'; v: number }
  | { k: 'titleCase'; v: string }
  | { k: 'component'; name: string; variants?: Record<string, string> }

export interface PropertyInput {
  type: PropertyType
  /** Name of a bound variable; wins over style and raw value. */
  variable?: string
  /** Name of a bound style; wins over the raw value. */
  style?: string
  raw?: RawValue
}

export interface FormattedProperty {
  type: PropertyType
  key: string
  value: string
  /** `#RRGGBB` for fills/strokes, when a solid colour is shown. */
  swatch?: string
  /** Present when the value came from a bound variable. */
  variable?: string
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

/**
 * Round to 2 decimals, strip trailing zeros. Only exact integers lose their
 * decimals — `413.99` stays `413.99` (PRD FR-3b).
 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return UNKNOWN_VALUE
  const rounded = Math.round(n * 100) / 100
  if (Object.is(rounded, -0)) return '0'
  return String(rounded)
}

export function px(n: number): string {
  const formatted = formatNumber(n)
  return formatted === UNKNOWN_VALUE ? UNKNOWN_VALUE : `${formatted}px`
}

function percent(n: number): string {
  const formatted = formatNumber(n)
  return formatted === UNKNOWN_VALUE ? UNKNOWN_VALUE : `${formatted}%`
}

/** `SPACE_BETWEEN` → `Space between`, `left` → `Left`. */
export function titleCase(value: string): string {
  const words = value.replace(/_/g, ' ').trim().toLowerCase().split(/\s+/)
  return words
    .map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
}

// ---------------------------------------------------------------------------
// Alignment matrix (PRD FR-3b)
// ---------------------------------------------------------------------------

const VERTICAL_WORDS: Record<AxisAlign, string> = {
  MIN: 'Top',
  CENTER: 'Center',
  MAX: 'Bottom',
  SPACE_BETWEEN: 'Space between',
  BASELINE: 'Baseline',
}

const HORIZONTAL_WORDS: Record<AxisAlign, string> = {
  MIN: 'Left',
  CENTER: 'Center',
  MAX: 'Right',
  SPACE_BETWEEN: 'Space between',
  BASELINE: 'Baseline',
}

function lower(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1)
}

/**
 * The matrix from PRD FR-3b. The vertical word always comes first, so a
 * horizontal layout simply swaps which axis supplies which word.
 */
export function formatAlignment(
  layoutMode: LayoutMode,
  primary: AxisAlign,
  counter: AxisAlign
): string {
  if (layoutMode === 'NONE') return UNKNOWN_VALUE
  const vertical = layoutMode === 'VERTICAL'
  const primaryWord = (vertical ? VERTICAL_WORDS : HORIZONTAL_WORDS)[primary]
  const counterWord = (vertical ? HORIZONTAL_WORDS : VERTICAL_WORDS)[counter]
  if (counter === 'BASELINE') return `Baseline ${lower(primaryWord)}`
  if (primaryWord === 'Center' && counterWord === 'Center') return 'Center'
  return vertical ? `${primaryWord} ${lower(counterWord)}` : `${counterWord} ${lower(primaryWord)}`
}

// ---------------------------------------------------------------------------
// Padding & radii
// ---------------------------------------------------------------------------

export function formatPadding(top: number, right: number, bottom: number, left: number): string {
  if (top === right && right === bottom && bottom === left) return px(top)
  if (top === bottom && right === left) return `${px(top)} ${px(right)}`
  return `${px(top)} ${px(right)} ${px(bottom)} ${px(left)}`
}

export function formatRadii(tl: number, tr: number, br: number, bl: number): string {
  if (tl === tr && tr === br && br === bl) return px(tl)
  return `${px(tl)} ${px(tr)} ${px(br)} ${px(bl)}`
}

// ---------------------------------------------------------------------------
// Paints
// ---------------------------------------------------------------------------

function formatPaint(paint: PaintInfo): string {
  if (paint.hex) {
    const opacity = Math.round(paint.opacity * 100)
    return opacity < 100 ? `${paint.hex} ${opacity}%` : paint.hex
  }
  return titleCase(paint.kind)
}

export interface PaintsResult {
  value: string
  swatch?: string
}

export function formatPaints(paints: PaintInfo[]): PaintsResult {
  const visible = paints.filter((paint) => paint.visible)
  const first = visible[0]
  if (!first) return { value: 'None' }
  const value =
    visible.length > 1 ? `${formatPaint(first)} +${visible.length - 1}` : formatPaint(first)
  return first.hex ? { value, swatch: first.hex } : { value }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

function formatRaw(raw: RawValue): PaintsResult {
  switch (raw.k) {
    case 'mixed':
      return { value: 'Mixed' }
    case 'absent':
      return { value: 'None' }
    case 'num':
      return { value: formatNumber(raw.v) }
    case 'px':
      return { value: px(raw.v) }
    case 'percent':
      return { value: percent(raw.v) }
    case 'str':
      return { value: raw.v === '' ? 'None' : raw.v }
    case 'titleCase':
      return { value: raw.v === '' ? 'None' : titleCase(raw.v) }
    case 'padding':
      return { value: formatPadding(raw.top, raw.right, raw.bottom, raw.left) }
    case 'radii':
      return { value: formatRadii(raw.tl, raw.tr, raw.br, raw.bl) }
    case 'layoutMode':
      return { value: raw.v === 'NONE' ? 'None' : titleCase(raw.v) }
    case 'align':
      return { value: formatAlignment(raw.layoutMode, raw.primary, raw.counter) }
    case 'gap':
      return { value: raw.spaceBetween ? 'Auto' : px(raw.v) }
    case 'paints':
      return formatPaints(raw.paints)
    case 'effects':
      return {
        value: raw.count === 0 ? 'None' : `${raw.count} effect${raw.count === 1 ? '' : 's'}`,
      }
    case 'lineHeight':
      if (raw.unit === 'AUTO' || raw.v === undefined) return { value: 'Auto' }
      return { value: raw.unit === 'PIXELS' ? px(raw.v) : percent(raw.v) }
    case 'letterSpacing':
      return { value: raw.unit === 'PIXELS' ? px(raw.v) : percent(raw.v) }
    case 'component': {
      const variants = raw.variants
      if (variants) {
        const entries = Object.entries(variants)
        if (entries.length > 0) {
          return { value: entries.map(([key, val]) => `${key}=${val}`).join(', ') }
        }
      }
      return { value: raw.name === '' ? UNKNOWN_VALUE : raw.name }
    }
  }
}

/** Formats one property. Never throws; unresolvable values become `—`. */
export function formatProperty(input: PropertyInput): FormattedProperty {
  const key = PROPERTY_LABELS[input.type] ?? input.type
  const base: FormattedProperty = { type: input.type, key, value: UNKNOWN_VALUE }

  if (input.variable) {
    const result: FormattedProperty = { ...base, value: input.variable, variable: input.variable }
    // A bound colour still gets its swatch, so the card stays scannable.
    if (input.raw?.k === 'paints') {
      const swatch = formatPaints(input.raw.paints).swatch
      if (swatch !== undefined) result.swatch = swatch
    }
    return result
  }

  if (input.style) {
    const result: FormattedProperty = { ...base, value: input.style }
    if (input.raw?.k === 'paints') {
      const swatch = formatPaints(input.raw.paints).swatch
      if (swatch !== undefined) result.swatch = swatch
    }
    return result
  }

  if (!input.raw) return base

  const { value, swatch } = formatRaw(input.raw)
  const result: FormattedProperty = { ...base, value }
  if (swatch !== undefined) result.swatch = swatch
  return result
}
