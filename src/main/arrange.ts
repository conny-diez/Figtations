/**
 * Auto-arrange (PRD FR-8): lay the unpinned cards out in a clean column next to
 * their frame — the spec-sheet view the native feature cannot produce.
 */
import type { Rect } from '../shared/format/geometry'
import type { ArrangeOptions } from '../shared/types'
import { boxOf, parentOrigin } from './connector'
import { getIndex, refreshIndex } from './registry'
import { readFigtation, readSettings } from './store'
import { outermostFrame, syncFigtation, withWriteGuard } from './sync'
import { list as listCategories } from './categories'

const VERTICAL_GAP = 16

interface Entry {
  card: FrameNode
  cardBox: Rect
  targetBox: Rect
  referenceBox: Rect
  referenceId: string
  pinned: boolean
}

async function nodeById(id: string): Promise<SceneNode | null> {
  if (id === '') return null
  try {
    const node = await figma.getNodeByIdAsync(id)
    if (!node || node.removed) return null
    return node as SceneNode
  } catch {
    return null
  }
}

/** Absolute → parent-local, because a card may live inside a section. */
function localOffset(card: FrameNode): { x: number; y: number } {
  const parent = card.parent
  if (!parent) return { x: 0, y: 0 }
  return parentOrigin(parent)
}

export interface ArrangeResult {
  moved: number
  skipped: number
}

export async function arrange(
  scope: 'page' | 'selection',
  options: ArrangeOptions
): Promise<ArrangeResult> {
  const page = figma.currentPage
  const settings = readSettings()
  const categories = new Map(listCategories().map((category) => [category.id, category]))

  const selectedIds = new Set(page.selection.map((node) => node.id))

  const result = await withWriteGuard(async () => {
    const index = refreshIndex(page)
    const entries: Entry[] = []

    for (const card of index.cards) {
      if (scope === 'selection' && !selectedIds.has(card.id)) continue
      const figtation = readFigtation(card)
      if (!figtation || figtation.targetId === '') continue
      const target = await nodeById(figtation.targetId)
      if (!target) continue
      const cardBox = boxOf(card)
      const targetBox = boxOf(target)
      const referenceNode = outermostFrame(target)
      const referenceBox = boxOf(referenceNode)
      if (!cardBox || !targetBox || !referenceBox) continue
      entries.push({
        card,
        cardBox,
        targetBox,
        referenceBox,
        referenceId: referenceNode.id,
        pinned: figtation.pinned,
      })
    }

    // Group by reference frame, then read order (target Y, then target X).
    const groups = new Map<string, Entry[]>()
    for (const entry of entries) {
      const group = groups.get(entry.referenceId)
      if (group) group.push(entry)
      else groups.set(entry.referenceId, [entry])
    }

    let moved = 0
    let skipped = 0

    for (const group of groups.values()) {
      group.sort((a, b) => a.targetBox.y - b.targetBox.y || a.targetBox.x - b.targetBox.x)
      const reference = group[0]?.referenceBox
      if (!reference) continue

      let previousBottom = -Infinity
      for (const entry of group) {
        if (entry.pinned) {
          // Pinned cards do not move but still block space (PRD FR-8 #5).
          previousBottom = Math.max(previousBottom, entry.cardBox.y + entry.cardBox.height)
          skipped += 1
          continue
        }
        const width = entry.cardBox.width
        const x =
          options.side === 'left'
            ? reference.x - options.gutter - width
            : reference.x + reference.width + options.gutter
        const y = Math.max(entry.targetBox.y, previousBottom + VERTICAL_GAP)
        const offset = localOffset(entry.card)
        entry.card.x = x - offset.x
        entry.card.y = y - offset.y
        previousBottom = y + entry.cardBox.height
        moved += 1
      }
    }

    // Every connector has to follow.
    for (const card of getIndex(page).cards) {
      await syncFigtation(card, 'sync', settings, categories)
    }

    return { moved, skipped }
  })

  return result
}
