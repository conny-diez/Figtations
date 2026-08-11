/**
 * Reverse sync, canvas → pluginData (PRD C-10, FR-12).
 *
 * Classifies document changes into "which Figtations are affected and why".
 * Applying the consequences is `sync.ts`'s job — keeping the classification
 * side-effect free makes the whitelist easy to reason about.
 */
import { KEYS, get, nodeType, roleOf } from './store'
import { findOwningCard } from './registry'

/** Geometry and appearance properties that can invalidate a card or a line. */
const RELEVANT_PROPERTIES = new Set<string>([
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'parent',
  'layoutMode',
  'itemSpacing',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingBottom',
  'primaryAxisAlignItems',
  'counterAxisAlignItems',
  'primaryAxisSizingMode',
  'counterAxisSizingMode',
  'fills',
  'strokes',
  'strokeWeight',
  'cornerRadius',
  'topLeftRadius',
  'topRightRadius',
  'bottomLeftRadius',
  'bottomRightRadius',
  'effects',
  'opacity',
  'fontName',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlignHorizontal',
  'textStyleId',
  'fillStyleId',
  'strokeStyleId',
  'effectStyleId',
  'boundVariables',
  'componentProperties',
  'mainComponent',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
])

/** Geometry-only subset: these move a card or a target but change no value. */
const GEOMETRY_PROPERTIES = new Set<string>(['x', 'y', 'width', 'height', 'rotation', 'parent'])

export interface ChangeVerdict {
  /** Figtation ids whose card must be re-rendered. */
  cards: Set<string>
  /** Figtation ids whose connector must be recomputed. */
  connectors: Set<string>
  /** Node ids that changed geometry and may be a target or a target ancestor. */
  movedNodeIds: Set<string>
  /** A protected text field was edited on the canvas. */
  protectedEdited: boolean
  /** Cards were created or deleted → the page index is stale. */
  structural: boolean
  /** Card node ids that were deleted, so their satellites can be cleaned up. */
  deletedCardIds: Set<string>
}

export function emptyVerdict(): ChangeVerdict {
  return {
    cards: new Set(),
    connectors: new Set(),
    movedNodeIds: new Set(),
    protectedEdited: false,
    structural: false,
    deletedCardIds: new Set(),
  }
}

function isProtectedRole(role: string): boolean {
  return role === 'pill-text' || role === 'row-key' || role === 'row-value'
}

/**
 * Folds one node change into the verdict. `node` may already be removed —
 * every access is guarded.
 */
export function classify(change: NodeChange, verdict: ChangeVerdict): void {
  if (change.type === 'CREATE' || change.type === 'DELETE') {
    verdict.structural = true
    if (change.type === 'DELETE') verdict.deletedCardIds.add(change.id)
    return
  }
  if (change.type !== 'PROPERTY_CHANGE') return

  const properties = change.properties
  const relevant = properties.some((property) => RELEVANT_PROPERTIES.has(property))
  const textChanged = properties.includes('characters')
  if (!relevant && !textChanged) return

  const node = change.node
  if (node.removed) {
    verdict.structural = true
    return
  }

  // Direct hit on a card?
  if (node.type === 'FRAME' && nodeType(node) === 'card') {
    const id = get(node, KEYS.id)
    if (id !== '') {
      verdict.connectors.add(id)
      if (properties.some((property) => !GEOMETRY_PROPERTIES.has(property))) verdict.cards.add(id)
      verdict.movedNodeIds.add(node.id)
      return
    }
  }

  // A child of a card — the reverse-sync path.
  const owner = findOwningCard(node)
  if (owner) {
    const id = get(owner, KEYS.id)
    if (id !== '') {
      const role = roleOf(node)
      if (textChanged) {
        verdict.cards.add(id)
        if (isProtectedRole(role)) verdict.protectedEdited = true
      } else if (relevant) {
        verdict.cards.add(id)
      }
      return
    }
  }

  // Anything else: possibly a target, or an ancestor of one.
  if (properties.some((property) => GEOMETRY_PROPERTIES.has(property))) {
    verdict.movedNodeIds.add(node.id)
  }
  if (relevant) verdict.movedNodeIds.add(node.id)
}

export function isEmpty(verdict: ChangeVerdict): boolean {
  return (
    verdict.cards.size === 0 &&
    verdict.connectors.size === 0 &&
    verdict.movedNodeIds.size === 0 &&
    verdict.deletedCardIds.size === 0 &&
    !verdict.structural
  )
}
