/**
 * Font resolution and caching (PRD C-7). Every text mutation must be preceded by
 * `loadFontAsync`, and the resolved family is cached for the session.
 */

const PREFERRED_FAMILIES = ['Inter', 'Roboto', 'Helvetica'] as const

export type Weight = 'regular' | 'medium' | 'semibold'

const STYLE_CANDIDATES: Record<Weight, string[]> = {
  regular: ['Regular', 'Book', 'Normal'],
  medium: ['Medium', 'Regular'],
  semibold: ['Semi Bold', 'SemiBold', 'Semibold', 'Bold', 'Medium', 'Regular'],
}

let resolved: Record<Weight, FontName> | null = null
let resolving: Promise<Record<Weight, FontName>> | null = null
const loaded = new Set<string>()

function fontKey(font: FontName): string {
  return `${font.family}__${font.style}`
}

async function tryLoad(font: FontName): Promise<boolean> {
  const key = fontKey(font)
  if (loaded.has(key)) return true
  try {
    await figma.loadFontAsync(font)
    loaded.add(key)
    return true
  } catch {
    return false
  }
}

async function resolveFamily(
  family: string,
  available: Map<string, Set<string>>
): Promise<Record<Weight, FontName> | null> {
  const styles = available.get(family)
  if (!styles) return null
  const picked: Partial<Record<Weight, FontName>> = {}
  for (const weight of Object.keys(STYLE_CANDIDATES) as Weight[]) {
    const candidates = STYLE_CANDIDATES[weight]
    const style = candidates.find((candidate) => styles.has(candidate)) ?? [...styles][0]
    if (style === undefined) return null
    const font: FontName = { family, style }
    if (!(await tryLoad(font))) return null
    picked[weight] = font
  }
  if (!picked.regular || !picked.medium || !picked.semibold) return null
  return { regular: picked.regular, medium: picked.medium, semibold: picked.semibold }
}

async function resolveFonts(): Promise<Record<Weight, FontName>> {
  const list = await figma.listAvailableFontsAsync()
  const available = new Map<string, Set<string>>()
  for (const entry of list) {
    const styles = available.get(entry.fontName.family) ?? new Set<string>()
    styles.add(entry.fontName.style)
    available.set(entry.fontName.family, styles)
  }

  for (const family of PREFERRED_FAMILIES) {
    const result = await resolveFamily(family, available)
    if (result) return result
  }

  // Last resort: the first family that loads at all.
  for (const family of available.keys()) {
    const result = await resolveFamily(family, available)
    if (result) return result
  }

  throw new Error('No usable font found')
}

/** Resolved fonts for the session. Concurrent callers share one resolution. */
export async function fonts(): Promise<Record<Weight, FontName>> {
  if (resolved) return resolved
  if (!resolving) {
    resolving = resolveFonts().then((result) => {
      resolved = result
      return result
    })
  }
  return resolving
}

/** Loads a font that already exists on a node before its text is touched. */
export async function ensureLoaded(font: FontName | typeof figma.mixed): Promise<void> {
  if (font === figma.mixed) return
  await tryLoad(font)
}

/** Test seam: forget the cached resolution. */
export function resetFontCache(): void {
  resolved = null
  resolving = null
  loaded.clear()
}
