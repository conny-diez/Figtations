/**
 * Finding Figtations on a page (PRD §5.6).
 *
 * `findAllWithCriteria` with a plugin-data criterion is not available in every
 * typings/runtime combination, so availability is feature-detected once and the
 * slower `findAll` predicate is used as a fallback. Results are cached per page
 * and invalidated on CREATE/DELETE document changes.
 */
import { NAMESPACE } from '../shared/types'
import { KEYS, get, nodeType } from './store'

export interface CardIndex {
  pageId: string
  /** Card frames, in document order. */
  cards: FrameNode[]
  /** Figtation id → card. */
  byFigtationId: Map<string, FrameNode>
  /** Target node id → figtation ids. Hot path for the sync handler. */
  byTargetId: Map<string, string[]>
  /** Figtation id → connector/endpoint/handle nodes belonging to it. */
  satellites: Map<string, SceneNode[]>
  /** Satellites whose card no longer exists. */
  orphanSatellites: SceneNode[]
  /** Node id → figtation id, for every node that belongs to a Figtation. */
  ownerOf: Map<string, string>
}

interface SharedPluginDataCriteria {
  sharedPluginData: { namespace: string; keys: string[] }
}

let criteriaSupported: boolean | null = null
const cache = new Map<string, CardIndex>()

function isFrame(node: SceneNode): node is FrameNode {
  return node.type === 'FRAME'
}

function supportsCriteria(page: PageNode): boolean {
  if (criteriaSupported !== null) return criteriaSupported
  try {
    const criteria: SharedPluginDataCriteria = {
      sharedPluginData: { namespace: NAMESPACE, keys: [KEYS.type] },
    }
    page.findAllWithCriteria(criteria as unknown as Parameters<typeof page.findAllWithCriteria>[0])
    criteriaSupported = true
  } catch {
    criteriaSupported = false
  }
  return criteriaSupported
}

function candidates(page: PageNode): SceneNode[] {
  if (supportsCriteria(page)) {
    const criteria: SharedPluginDataCriteria = {
      sharedPluginData: { namespace: NAMESPACE, keys: [KEYS.type] },
    }
    return page.findAllWithCriteria(
      criteria as unknown as Parameters<typeof page.findAllWithCriteria>[0]
    ) as SceneNode[]
  }
  return page.findAll((node) => nodeType(node) !== '')
}

function buildIndex(page: PageNode): CardIndex {
  const index: CardIndex = {
    pageId: page.id,
    cards: [],
    byFigtationId: new Map(),
    byTargetId: new Map(),
    satellites: new Map(),
    orphanSatellites: [],
    ownerOf: new Map(),
  }

  const satelliteNodes: SceneNode[] = []

  for (const node of candidates(page)) {
    const type = nodeType(node)
    if (type === 'card') {
      if (!isFrame(node)) continue
      index.cards.push(node)
      continue
    }
    if (type === 'connector' || type === 'endpoint' || type === 'handle') {
      satelliteNodes.push(node)
    }
  }

  for (const card of index.cards) {
    const id = get(card, KEYS.id)
    if (id === '') continue
    // Duplicates are resolved by sync.resolveDuplicates(); first one wins here.
    if (!index.byFigtationId.has(id)) index.byFigtationId.set(id, card)
    index.ownerOf.set(card.id, id)
    const targetId = get(card, KEYS.targetId)
    if (targetId === '') continue
    const list = index.byTargetId.get(targetId)
    if (list) list.push(id)
    else index.byTargetId.set(targetId, [id])
  }

  for (const node of satelliteNodes) {
    const cardId = get(node, KEYS.cardId)
    if (cardId === '' || !index.byFigtationId.has(cardId)) {
      index.orphanSatellites.push(node)
      continue
    }
    const list = index.satellites.get(cardId)
    if (list) list.push(node)
    else index.satellites.set(cardId, [node])
    index.ownerOf.set(node.id, cardId)
  }

  return index
}

/** Cached index for a page. */
export function getIndex(page: PageNode): CardIndex {
  const cached = cache.get(page.id)
  if (cached) return cached
  const index = buildIndex(page)
  cache.set(page.id, index)
  return index
}

export function refreshIndex(page: PageNode): CardIndex {
  const index = buildIndex(page)
  cache.set(page.id, index)
  return index
}

export function invalidate(pageId?: string): void {
  if (pageId === undefined) cache.clear()
  else cache.delete(pageId)
}

/** All card ids that appear more than once on the page. */
export function duplicateIds(page: PageNode): Map<string, FrameNode[]> {
  const index = getIndex(page)
  const groups = new Map<string, FrameNode[]>()
  for (const card of index.cards) {
    const id = get(card, KEYS.id)
    if (id === '') continue
    const list = groups.get(id)
    if (list) list.push(card)
    else groups.set(id, [card])
  }
  for (const [id, list] of groups) {
    if (list.length < 2) groups.delete(id)
  }
  return groups
}

/** Card frame for a Figtation id on the current page, or null. */
export function cardById(page: PageNode, figtationId: string): FrameNode | null {
  return getIndex(page).byFigtationId.get(figtationId) ?? null
}

/** Walks up at most `maxDepth` parents looking for a Figtation card. */
export function findOwningCard(node: BaseNode, maxDepth = 4): FrameNode | null {
  let current: BaseNode | null = node
  let depth = 0
  while (current && depth <= maxDepth) {
    if (current.type === 'FRAME' && nodeType(current) === 'card') return current
    current = current.parent
    depth += 1
  }
  return null
}
