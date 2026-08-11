/**
 * Category register (PRD FR-4). Figma has no remove/rename API for native
 * categories (PRD C-6), so Figtations keeps its own register in document shared
 * plugin data and maps onto native categories only at import/export time.
 */
import { createId } from '../shared/ids'
import { CATEGORY_HEX } from '../shared/tokens'
import { isCategoryColor, type CategoryColor, type FigtationCategory } from '../shared/types'
import { readCategories, writeCategories } from './store'

/** Seed order and colours per PRD FR-4. */
const SEED: ReadonlyArray<{ label: string; color: CategoryColor }> = [
  { label: 'Navigation', color: 'green' },
  { label: 'Interaction', color: 'blue' },
  { label: 'Accessibility', color: 'pink' },
  { label: 'Content', color: 'orange' },
  { label: 'Component', color: 'violet' },
  { label: 'Rule', color: 'red' },
  { label: 'Haptic Feedback', color: 'teal' },
  { label: 'Behaviour', color: 'yellow' },
  { label: 'Development', color: 'green' },
  { label: 'Change', color: 'pink' },
]

function fromSeed(): FigtationCategory[] {
  return SEED.map((entry, index) => ({
    id: createId(),
    label: entry.label,
    color: entry.color,
    order: index,
  }))
}

async function fromNative(): Promise<FigtationCategory[] | null> {
  try {
    const native = await figma.annotations.getAnnotationCategoriesAsync()
    if (native.length === 0) return null
    return native.map((category, index) => {
      const result: FigtationCategory = {
        id: createId(),
        label: category.label,
        color: isCategoryColor(category.color) ? category.color : 'blue',
        order: index,
        nativeId: category.id,
      }
      return result
    })
  } catch {
    return null
  }
}

/**
 * Returns the register, seeding it on first run. If the file already carries
 * native categories, those are adopted instead of the seed so the user keeps
 * their grown set (PRD FR-4).
 */
export async function ensureCategories(): Promise<FigtationCategory[]> {
  const existing = readCategories()
  if (existing.length > 0) return existing
  const adopted = await fromNative()
  const categories = adopted ?? fromSeed()
  writeCategories(categories)
  return categories
}

export function list(): FigtationCategory[] {
  return readCategories()
}

export function byId(id: string): FigtationCategory | null {
  if (id === '') return null
  return readCategories().find((category) => category.id === id) ?? null
}

export function colorOf(category: FigtationCategory | null): string | null {
  return category ? CATEGORY_HEX[category.color] : null
}

/** Commits the whole register at once — the modal's `Done` (PRD FR-4). */
export function commit(next: FigtationCategory[]): FigtationCategory[] {
  const seen = new Set<string>()
  const cleaned: FigtationCategory[] = []
  next.forEach((category, index) => {
    const label = category.label.trim()
    if (label === '') return
    const id = category.id !== '' && !seen.has(category.id) ? category.id : createId()
    seen.add(id)
    const entry: FigtationCategory = {
      id,
      label,
      color: isCategoryColor(category.color) ? category.color : 'blue',
      order: index,
    }
    if (category.nativeId) entry.nativeId = category.nativeId
    cleaned.push(entry)
  })
  writeCategories(cleaned)
  return cleaned
}

export function remove(categoryId: string): FigtationCategory[] {
  const next = readCategories().filter((category) => category.id !== categoryId)
  writeCategories(next)
  return next
}

/**
 * Finds an existing category by label + colour, or creates one. Used by the
 * native bridge in both directions (PRD C-6).
 */
export function upsertByLabelAndColor(label: string, color: CategoryColor): FigtationCategory {
  const categories = readCategories()
  const match = categories.find(
    (category) => category.label.toLowerCase() === label.toLowerCase() && category.color === color
  )
  if (match) return match
  const created: FigtationCategory = {
    id: createId(),
    label,
    color,
    order: categories.length,
  }
  writeCategories([...categories, created])
  return created
}

/** Resolves (or creates) the native counterpart of a Figtation category. */
export async function nativeIdFor(category: FigtationCategory): Promise<string | null> {
  try {
    const native = await figma.annotations.getAnnotationCategoriesAsync()
    const match = native.find(
      (entry) =>
        entry.label.toLowerCase() === category.label.toLowerCase() && entry.color === category.color
    )
    if (match) return match.id
    const created = await figma.annotations.addAnnotationCategoryAsync({
      label: category.label,
      color: category.color,
    })
    return created.id
  } catch {
    return null
  }
}
