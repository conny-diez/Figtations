/**
 * Card visual tokens (PRD §7). The renderer must not contain magic numbers —
 * every value it uses comes from here.
 */
import type { CategoryColor } from './types'

export interface Rgb {
  r: number
  g: number
  b: number
}

/** `#RRGGBB` → 0…1 RGB. Accepts an optional leading `#`. */
export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  const int = Number.parseInt(full, 16)
  if (!Number.isFinite(int) || full.length !== 6) return { r: 0, g: 0, b: 0 }
  return {
    r: ((int >> 16) & 0xff) / 255,
    g: ((int >> 8) & 0xff) / 255,
    b: (int & 0xff) / 255,
  }
}

/** 0…1 RGB → `#RRGGBB`, upper case. */
export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (n: number): string =>
    Math.round(Math.min(1, Math.max(0, n)) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()
  return `#${part(r)}${part(g)}${part(b)}`
}

/** Category colours, approximated from Figma's palette (PRD §7). */
export const CATEGORY_HEX: Record<CategoryColor, string> = {
  yellow: '#E5B800',
  orange: '#D9822B',
  red: '#D93F2B',
  pink: '#D93FA8',
  violet: '#8B5CF6',
  blue: '#3B82F6',
  teal: '#3A7D8C',
  green: '#2E9E5B',
}

/** Stroke colour for a connector without a category. */
export const NEUTRAL_CONNECTOR_HEX = '#8C8C8C'

export interface CardTheme {
  cardFill: string
  cardStroke: string
  cardStrokeWeight: number
  shadowColor: Rgb
  shadowOpacity: number
  shadowBlur: number
  shadowOffsetY: number
  labelText: string
  propertyKeyText: string
  propertyValueText: string
  dividerColor: string
  pillText: string
  swatchStroke: string
  swatchStrokeOpacity: number
  tokenChipFill: string
  tokenChipFillOpacity: number
  tokenChipText: string
  detachedStroke: string
}

const DARK_THEME: CardTheme = {
  cardFill: '#2C2C2C',
  cardStroke: '#3D3D3D',
  cardStrokeWeight: 1,
  shadowColor: { r: 0, g: 0, b: 0 },
  shadowOpacity: 0.28,
  shadowBlur: 16,
  shadowOffsetY: 4,
  labelText: '#FFFFFF',
  propertyKeyText: '#A1A1A1',
  propertyValueText: '#FFFFFF',
  dividerColor: '#3D3D3D',
  pillText: '#FFFFFF',
  swatchStroke: '#FFFFFF',
  swatchStrokeOpacity: 0.15,
  tokenChipFill: '#5E8CFF',
  tokenChipFillOpacity: 0.18,
  tokenChipText: '#A9C1FF',
  detachedStroke: '#FF6B6B',
}

const LIGHT_THEME: CardTheme = {
  ...DARK_THEME,
  cardFill: '#FFFFFF',
  cardStroke: '#E5E5E5',
  labelText: '#1A1A1A',
  propertyKeyText: '#757575',
  propertyValueText: '#1A1A1A',
  dividerColor: '#E5E5E5',
  swatchStroke: '#000000',
  tokenChipText: '#2B4FA8',
}

export const CARD_THEMES: Record<'dark' | 'light', CardTheme> = {
  dark: DARK_THEME,
  light: LIGHT_THEME,
}

/** Geometry and typography, identical in both themes (PRD §7). */
export const CARD_METRICS = {
  cornerRadius: 13,
  padding: 16,
  gap: 12,
  pillCornerRadius: 6,
  pillPaddingVertical: 5,
  pillPaddingHorizontal: 10,
  headerGap: 8,
  labelFontSize: 13,
  labelLineHeight: 20,
  pillFontSize: 13,
  pillLineHeight: 16,
  rowFontSize: 13,
  rowGap: 4,
  rowMinHeight: 24,
  rowInnerGap: 12,
  valueGap: 6,
  swatchSize: 10,
  swatchCornerRadius: 2,
  tokenChipCornerRadius: 4,
  tokenChipPaddingVertical: 1,
  tokenChipPaddingHorizontal: 5,
  dividerSpacing: 4,
} as const

/** Connector tokens (PRD FR-5). */
export const CONNECTOR_METRICS = {
  endpointSize: 8,
  endpointStrokeWeight: 1.5,
  endpointStrokeHex: '#FFFFFF',
  /** Perpendicular stub out of the card and into the target. */
  stub: 24,
  dashPattern: [4, 4] as readonly number[],
  /** Handle sizes for route B (PRD FR-5b). */
  vertexHandleSize: 10,
  segmentHandleSize: 8,
  segmentHandleOpacity: 0.6,
} as const

export const NODE_NAMES = {
  connector: 'Figtation connector',
  endpoint: 'Figtation endpoint',
  handle: 'Figtation handle',
} as const
