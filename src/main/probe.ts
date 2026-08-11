/**
 * Reads live property values off a target node (PRD FR-3a).
 *
 * The node-touching part lives here; the formatting is pure and lives in
 * `shared/format/properties.ts`. Resolution order per value is
 * bound variable → style → raw value (PRD FR-3b).
 */
import {
  formatProperty,
  PROPERTY_LABELS,
  UNKNOWN_VALUE,
  type AxisAlign,
  type LayoutMode,
  type PaintInfo,
  type PropertyInput,
  type RawValue,
} from '../shared/format/properties'
import { rgbToHex } from '../shared/tokens'
import { PROPERTY_TYPES, type ProbedProperty, type PropertyType } from '../shared/types'

type Rec = Record<string, unknown>

const variableNames = new Map<string, string>()
const styleNames = new Map<string, string>()

/** Session cache — variable and style names change rarely and cost a round trip. */
export function resetProbeCache(): void {
  variableNames.clear()
  styleNames.clear()
}

async function variableName(id: string): Promise<string | undefined> {
  if (id === '') return undefined
  const cached = variableNames.get(id)
  if (cached !== undefined) return cached
  try {
    const variable = await figma.variables.getVariableByIdAsync(id)
    if (!variable) return undefined
    variableNames.set(id, variable.name)
    return variable.name
  } catch {
    return undefined
  }
}

async function styleName(id: unknown): Promise<string | undefined> {
  if (typeof id !== 'string' || id === '') return undefined
  const cached = styleNames.get(id)
  if (cached !== undefined) return cached
  try {
    const style = await figma.getStyleByIdAsync(id)
    if (!style) return undefined
    styleNames.set(id, style.name)
    return style.name
  } catch {
    return undefined
  }
}

function asRecord(value: unknown): Rec {
  return typeof value === 'object' && value !== null ? (value as Rec) : {}
}

function isMixed(value: unknown): boolean {
  return value === figma.mixed
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Resolves `boundVariables[field]`, including the array form used by paints. */
async function boundVariable(bound: Rec, field: string): Promise<string | undefined> {
  const entry = bound[field]
  if (!entry) return undefined
  if (Array.isArray(entry)) {
    const first = entry[0]
    const id = asRecord(first)['id']
    return typeof id === 'string' ? variableName(id) : undefined
  }
  const id = asRecord(entry)['id']
  return typeof id === 'string' ? variableName(id) : undefined
}

function paintInfos(value: unknown): PaintInfo[] | 'mixed' | null {
  if (isMixed(value)) return 'mixed'
  if (!Array.isArray(value)) return null
  return value.map((entry): PaintInfo => {
    const paint = asRecord(entry)
    const type = typeof paint['type'] === 'string' ? paint['type'] : 'UNKNOWN'
    const opacity = num(paint['opacity'])
    const info: PaintInfo = {
      opacity: opacity === null ? 1 : opacity,
      kind: type,
      visible: paint['visible'] !== false,
    }
    if (type === 'SOLID') {
      const color = asRecord(paint['color'])
      info.hex = rgbToHex({
        r: num(color['r']) ?? 0,
        g: num(color['g']) ?? 0,
        b: num(color['b']) ?? 0,
      })
    }
    return info
  })
}

function layoutModeOf(rec: Rec): LayoutMode {
  const mode = rec['layoutMode']
  return mode === 'HORIZONTAL' || mode === 'VERTICAL' || mode === 'GRID' ? mode : 'NONE'
}

function axisAlign(value: unknown, fallback: AxisAlign): AxisAlign {
  return value === 'MIN' ||
    value === 'CENTER' ||
    value === 'MAX' ||
    value === 'SPACE_BETWEEN' ||
    value === 'BASELINE'
    ? value
    : fallback
}

interface Probed {
  available: boolean
  input: PropertyInput
}

function unavailable(type: PropertyType): Probed {
  return { available: false, input: { type } }
}

function pxValue(type: PropertyType, value: unknown): Probed {
  if (isMixed(value)) return { available: true, input: { type, raw: { k: 'mixed' } } }
  const n = num(value)
  if (n === null) return unavailable(type)
  return { available: true, input: { type, raw: { k: 'px', v: n } } }
}

function numValue(type: PropertyType, value: unknown): Probed {
  const n = num(value)
  if (n === null) return unavailable(type)
  return { available: true, input: { type, raw: { k: 'num', v: n } } }
}

async function probeProperty(node: SceneNode, type: PropertyType): Promise<Probed> {
  const rec = node as unknown as Rec
  const bound = asRecord(rec['boundVariables'])
  const parentRec = asRecord(node.parent)
  const layoutMode = layoutModeOf(rec)
  const isText = node.type === 'TEXT'

  const withResolvers = async (raw: RawValue, variableField?: string, style?: unknown) => {
    const input: PropertyInput = { type, raw }
    if (variableField !== undefined) {
      const variable = await boundVariable(bound, variableField)
      if (variable !== undefined) input.variable = variable
    }
    if (style !== undefined) {
      const name = await styleName(style)
      if (name !== undefined) input.style = name
    }
    return { available: true, input }
  }

  switch (type) {
    case 'width':
      return withResolvers({ k: 'px', v: num(rec['width']) ?? 0 }, 'width')
    case 'height':
      return withResolvers({ k: 'px', v: num(rec['height']) ?? 0 }, 'height')
    case 'opacity': {
      const opacity = num(rec['opacity'])
      return withResolvers({ k: 'percent', v: Math.round((opacity ?? 1) * 100) }, 'opacity')
    }
    case 'minWidth':
    case 'maxWidth':
    case 'minHeight':
    case 'maxHeight': {
      if (!(type in rec)) return unavailable(type)
      const value = num(rec[type])
      if (value === null) return unavailable(type)
      return withResolvers({ k: 'px', v: value }, type)
    }
    case 'layoutMode':
      if (!('layoutMode' in rec)) return unavailable(type)
      return { available: true, input: { type, raw: { k: 'layoutMode', v: layoutMode } } }
    case 'alignItems': {
      if (layoutMode === 'NONE') return unavailable(type)
      return {
        available: true,
        input: {
          type,
          raw: {
            k: 'align',
            layoutMode,
            primary: axisAlign(rec['primaryAxisAlignItems'], 'MIN'),
            counter: axisAlign(rec['counterAxisAlignItems'], 'MIN'),
          },
        },
      }
    }
    case 'itemSpacing': {
      if (layoutMode === 'NONE') return unavailable(type)
      const spacing = num(rec['itemSpacing']) ?? 0
      return withResolvers(
        {
          k: 'gap',
          v: spacing,
          spaceBetween: rec['primaryAxisAlignItems'] === 'SPACE_BETWEEN',
        },
        'itemSpacing'
      )
    }
    case 'padding': {
      if (layoutMode === 'NONE') return unavailable(type)
      return withResolvers(
        {
          k: 'padding',
          top: num(rec['paddingTop']) ?? 0,
          right: num(rec['paddingRight']) ?? 0,
          bottom: num(rec['paddingBottom']) ?? 0,
          left: num(rec['paddingLeft']) ?? 0,
        },
        'paddingTop'
      )
    }
    case 'cornerRadius': {
      if (!('cornerRadius' in rec)) return unavailable(type)
      const radius = rec['cornerRadius']
      if (isMixed(radius)) {
        return withResolvers(
          {
            k: 'radii',
            tl: num(rec['topLeftRadius']) ?? 0,
            tr: num(rec['topRightRadius']) ?? 0,
            br: num(rec['bottomRightRadius']) ?? 0,
            bl: num(rec['bottomLeftRadius']) ?? 0,
          },
          'topLeftRadius'
        )
      }
      return withResolvers({ k: 'px', v: num(radius) ?? 0 }, 'topLeftRadius')
    }
    case 'fills': {
      if (!('fills' in rec)) return unavailable(type)
      const paints = paintInfos(rec['fills'])
      if (paints === null) return unavailable(type)
      if (paints === 'mixed') return { available: true, input: { type, raw: { k: 'mixed' } } }
      return withResolvers({ k: 'paints', paints }, 'fills', rec['fillStyleId'])
    }
    case 'strokes': {
      if (!('strokes' in rec)) return unavailable(type)
      const paints = paintInfos(rec['strokes'])
      if (paints === null) return unavailable(type)
      if (paints === 'mixed') return { available: true, input: { type, raw: { k: 'mixed' } } }
      return withResolvers({ k: 'paints', paints }, 'strokes', rec['strokeStyleId'])
    }
    case 'strokeWeight': {
      if (!('strokeWeight' in rec)) return unavailable(type)
      if (isMixed(rec['strokeWeight'])) {
        return { available: true, input: { type, raw: { k: 'mixed' } } }
      }
      return withResolvers({ k: 'px', v: num(rec['strokeWeight']) ?? 0 }, 'strokeWeight')
    }
    case 'effects': {
      if (!('effects' in rec)) return unavailable(type)
      const effects = rec['effects']
      const count = Array.isArray(effects)
        ? effects.filter((e) => asRecord(e)['visible'] !== false).length
        : 0
      return withResolvers({ k: 'effects', count }, undefined, rec['effectStyleId'])
    }
    case 'fontFamily': {
      if (!isText) return unavailable(type)
      const fontName = rec['fontName']
      if (isMixed(fontName)) return { available: true, input: { type, raw: { k: 'mixed' } } }
      const family = asRecord(fontName)['family']
      return withResolvers(
        { k: 'str', v: typeof family === 'string' ? family : '' },
        'fontFamily',
        rec['textStyleId']
      )
    }
    case 'fontStyle': {
      if (!isText) return unavailable(type)
      const fontName = rec['fontName']
      if (isMixed(fontName)) return { available: true, input: { type, raw: { k: 'mixed' } } }
      const style = asRecord(fontName)['style']
      return withResolvers({ k: 'str', v: typeof style === 'string' ? style : '' }, 'fontStyle')
    }
    case 'fontSize':
      if (!isText) return unavailable(type)
      return isMixed(rec['fontSize'])
        ? { available: true, input: { type, raw: { k: 'mixed' } } }
        : withResolvers({ k: 'px', v: num(rec['fontSize']) ?? 0 }, 'fontSize')
    case 'fontWeight':
      if (!isText) return unavailable(type)
      return isMixed(rec['fontWeight'])
        ? { available: true, input: { type, raw: { k: 'mixed' } } }
        : numValue(type, rec['fontWeight'])
    case 'lineHeight': {
      if (!isText) return unavailable(type)
      const lineHeight = rec['lineHeight']
      if (isMixed(lineHeight)) return { available: true, input: { type, raw: { k: 'mixed' } } }
      const record = asRecord(lineHeight)
      const unit = record['unit']
      if (unit === 'AUTO') return withResolvers({ k: 'lineHeight', unit: 'AUTO' }, 'lineHeight')
      if (unit === 'PIXELS' || unit === 'PERCENT') {
        return withResolvers({ k: 'lineHeight', unit, v: num(record['value']) ?? 0 }, 'lineHeight')
      }
      return unavailable(type)
    }
    case 'letterSpacing': {
      if (!isText) return unavailable(type)
      const spacing = rec['letterSpacing']
      if (isMixed(spacing)) return { available: true, input: { type, raw: { k: 'mixed' } } }
      const record = asRecord(spacing)
      const unit = record['unit']
      if (unit !== 'PIXELS' && unit !== 'PERCENT') return unavailable(type)
      return withResolvers(
        { k: 'letterSpacing', unit, v: num(record['value']) ?? 0 },
        'letterSpacing'
      )
    }
    case 'textAlignHorizontal': {
      if (!isText) return unavailable(type)
      const align = rec['textAlignHorizontal']
      if (typeof align !== 'string') return unavailable(type)
      return { available: true, input: { type, raw: { k: 'titleCase', v: align } } }
    }
    case 'textStyleId': {
      if (!isText) return unavailable(type)
      const id = rec['textStyleId']
      if (isMixed(id)) return { available: true, input: { type, raw: { k: 'mixed' } } }
      const name = await styleName(id)
      return { available: true, input: { type, raw: { k: 'str', v: name ?? '' } } }
    }
    case 'mainComponent': {
      if (node.type !== 'INSTANCE') return unavailable(type)
      const variants: Record<string, string> = {}
      const properties = asRecord(rec['componentProperties'])
      for (const [key, value] of Object.entries(properties)) {
        const property = asRecord(value)
        if (property['type'] !== 'VARIANT') continue
        variants[key] = String(property['value'] ?? '')
      }
      let name = ''
      try {
        const main = await node.getMainComponentAsync()
        name = main?.name ?? ''
      } catch {
        name = ''
      }
      const raw: RawValue =
        Object.keys(variants).length > 0
          ? { k: 'component', name, variants }
          : { k: 'component', name }
      return { available: true, input: { type, raw } }
    }
    case 'gridRowGap':
      if (layoutMode !== 'GRID') return unavailable(type)
      return pxValue(type, rec['gridRowGap'])
    case 'gridColumnGap':
      if (layoutMode !== 'GRID') return unavailable(type)
      return pxValue(type, rec['gridColumnGap'])
    case 'gridRowCount':
      if (layoutMode !== 'GRID') return unavailable(type)
      return numValue(type, rec['gridRowCount'])
    case 'gridColumnCount':
      if (layoutMode !== 'GRID') return unavailable(type)
      return numValue(type, rec['gridColumnCount'])
    // Anchor/span live on the *children* of a grid container.
    case 'gridRowAnchorIndex':
      if (layoutModeOf(parentRec) !== 'GRID') return unavailable(type)
      return numValue(type, rec['gridRowAnchorIndex'])
    case 'gridColumnAnchorIndex':
      if (layoutModeOf(parentRec) !== 'GRID') return unavailable(type)
      return numValue(type, rec['gridColumnAnchorIndex'])
    case 'gridRowSpan':
      if (layoutModeOf(parentRec) !== 'GRID') return unavailable(type)
      return numValue(type, rec['gridRowSpan'])
    case 'gridColumnSpan':
      if (layoutModeOf(parentRec) !== 'GRID') return unavailable(type)
      return numValue(type, rec['gridColumnSpan'])
  }
}

function toProbed(available: boolean, input: PropertyInput): ProbedProperty {
  const formatted = formatProperty(input)
  const result: ProbedProperty = {
    type: formatted.type,
    key: formatted.key,
    value: available ? formatted.value : UNKNOWN_VALUE,
    available,
  }
  if (formatted.swatch !== undefined) result.swatch = formatted.swatch
  if (formatted.variable !== undefined) result.variable = formatted.variable
  return result
}

/** All property types with availability and live values, for the picker. */
export async function probeAll(node: SceneNode): Promise<ProbedProperty[]> {
  const result: ProbedProperty[] = []
  for (const type of PROPERTY_TYPES) {
    try {
      const probed = await probeProperty(node, type)
      result.push(toProbed(probed.available, probed.input))
    } catch {
      // An unknown or failing property must never break the panel (PRD FR-3).
      result.push({
        type,
        key: PROPERTY_LABELS[type] ?? type,
        value: UNKNOWN_VALUE,
        available: false,
      })
    }
  }
  return result
}

/** Live values for a specific, ordered selection of properties — the card path. */
export async function probeSelected(
  node: SceneNode,
  types: readonly PropertyType[]
): Promise<ProbedProperty[]> {
  const result: ProbedProperty[] = []
  for (const type of types) {
    try {
      const probed = await probeProperty(node, type)
      result.push(toProbed(probed.available, probed.input))
    } catch {
      result.push({
        type,
        key: PROPERTY_LABELS[type] ?? type,
        value: UNKNOWN_VALUE,
        available: false,
      })
    }
  }
  return result
}
