/**
 * Lifecycle engine (PRD FR-6): create, sync, delete.
 *
 * There is no drag event in the plugin API (PRD C-3), so everything is driven by
 * `documentchange` (debounced, coalesced by Figtation id) plus a full `syncAll`
 * whenever the plugin opens. `isWriting` guards against the renderer's own
 * writes feeding back into the handler.
 */
import { createId } from '../shared/ids'
import { rectsOverlap, translateWaypoints, type Rect } from '../shared/format/geometry'
import type {
  Figtation,
  FigtationCategory,
  FigtationDraft,
  FigtationState,
  FigtationSummary,
  Settings,
} from '../shared/types'
import { CATEGORY_HEX, NEUTRAL_CONNECTOR_HEX } from '../shared/tokens'
import { emit, throttledToast, toast } from './bus'
import { createCardShell, renderCard, type RenderSource } from './card'
import { boxOf, parentOrigin, removeSatellites, syncConnector } from './connector'
import { list as listCategories } from './categories'
import { probeSelected } from './probe'
import { getIndex, invalidate, refreshIndex } from './registry'
import {
  KEYS,
  get,
  patchFigtation,
  readFigtation,
  readSettings,
  set,
  writeFigtation,
} from './store'
import { classify, emptyVerdict, isEmpty, type ChangeVerdict } from './reconcile'

// ---------------------------------------------------------------------------
// Write guard (PRD FR-12 #5)
// ---------------------------------------------------------------------------

let writing = 0

export function isWriting(): boolean {
  return writing > 0
}

export async function withWriteGuard<T>(fn: () => Promise<T>): Promise<T> {
  writing += 1
  try {
    return await fn()
  } finally {
    // Release on the next tick so the change events our own writes produced are
    // still swallowed by the handler.
    const release = (): void => {
      writing = Math.max(0, writing - 1)
    }
    setTimeout(release, 0)
  }
}

function commitUndo(): void {
  const api = figma as unknown as { commitUndo?: () => void }
  if (typeof api.commitUndo === 'function') api.commitUndo()
}

// ---------------------------------------------------------------------------
// Indices
// ---------------------------------------------------------------------------

/** node id → figtation ids, for targets and every ancestor of a target. */
let watchIndex = new Map<string, Set<string>>()
let pathEditFigtationId: string | null = null

function watch(nodeId: string, figtationId: string): void {
  const set_ = watchIndex.get(nodeId)
  if (set_) set_.add(figtationId)
  else watchIndex.set(nodeId, new Set([figtationId]))
}

export function pathEditTarget(): string | null {
  return pathEditFigtationId
}

export function setPathEditTarget(id: string | null): void {
  pathEditFigtationId = id
  emit({ t: 'pathEditMode', figtationId: id })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function pageOf(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node
  while (current) {
    if (current.type === 'PAGE') return current
    current = current.parent
  }
  return null
}

function sectionAncestor(node: SceneNode): SectionNode | null {
  let current: BaseNode | null = node.parent
  while (current) {
    if (current.type === 'SECTION') return current
    current = current.parent
  }
  return null
}

/** Outermost frame-like ancestor, the reference for placement and arrange. */
export function outermostFrame(node: SceneNode): SceneNode {
  let result: SceneNode = node
  let current: BaseNode | null = node.parent
  while (current) {
    if (current.type === 'PAGE' || current.type === 'DOCUMENT') break
    if (
      current.type === 'FRAME' ||
      current.type === 'COMPONENT' ||
      current.type === 'COMPONENT_SET' ||
      current.type === 'INSTANCE'
    ) {
      result = current
    }
    current = current.parent
  }
  return result
}

function categoryMap(): Map<string, FigtationCategory> {
  return new Map(listCategories().map((category) => [category.id, category]))
}

function connectorColor(category: FigtationCategory | null): string {
  return category ? CATEGORY_HEX[category.color] : NEUTRAL_CONNECTOR_HEX
}

function readPos(card: FrameNode): { x: number; y: number } | null {
  const raw = get(card, KEYS.pos)
  if (raw === '') return null
  const parts = raw.split(',')
  const x = Number(parts[0])
  const y = Number(parts[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function writePos(card: FrameNode, box: Rect | null): void {
  if (!box) return
  set(card, KEYS.pos, `${box.x},${box.y}`)
}

// ---------------------------------------------------------------------------
// Sync one Figtation
// ---------------------------------------------------------------------------

export interface SyncOutcome {
  figtation: Figtation
  state: FigtationState
  pageName?: string
  restoredRows: number
  resetProtected: boolean
  labelChanged: boolean
}

export async function syncFigtation(
  card: FrameNode,
  source: RenderSource,
  settings: Settings,
  categories: Map<string, FigtationCategory>
): Promise<SyncOutcome | null> {
  const figtation = readFigtation(card)
  if (!figtation) return null

  const target = await nodeById(figtation.targetId)
  const targetPage = target ? pageOf(target) : null
  let state: FigtationState = 'ok'
  let pageName: string | undefined
  if (figtation.targetId === '') state = 'free'
  else if (!target) state = 'detached'
  else if (targetPage && targetPage.id !== figma.currentPage.id) {
    state = 'off-page'
    pageName = targetPage.name
  }

  // Waypoints travel with the card, not with the target (PRD D-4).
  const cardBox = boxOf(card)
  if (figtation.route === 'custom' && figtation.waypoints.length > 0 && cardBox) {
    const previous = readPos(card)
    if (previous) {
      const dx = cardBox.x - previous.x
      const dy = cardBox.y - previous.y
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        figtation.waypoints = translateWaypoints(figtation.waypoints, dx, dy)
        patchFigtation(card, { waypoints: figtation.waypoints })
      }
    }
  }

  // A manual card resize becomes a width override (PRD FR-12).
  if (cardBox && source === 'sync') {
    const expected = figtation.widthOverride ?? settings.cardWidth
    if (Math.abs(cardBox.width - expected) > 0.5) {
      figtation.widthOverride = Math.round(cardBox.width)
      patchFigtation(card, { widthOverride: figtation.widthOverride })
    }
  }

  const category =
    figtation.categoryId === '' ? null : (categories.get(figtation.categoryId) ?? null)
  const properties =
    target && figtation.props.length > 0 ? await probeSelected(target, figtation.props) : []

  const report = await renderCard(card, {
    figtation,
    category,
    properties,
    settings,
    detached: state === 'detached',
    source,
  })

  let labelChanged = false
  if (report.labelFromCanvas !== null && report.labelFromCanvas !== figtation.label) {
    figtation.label = report.labelFromCanvas
    patchFigtation(card, { label: figtation.label })
    emit({ t: 'labelChangedOnCanvas', figtationId: figtation.id, label: figtation.label })
    labelChanged = true
  }

  if (target && state === 'ok') {
    if (target.name !== figtation.targetName) {
      figtation.targetName = target.name
      patchFigtation(card, { targetName: figtation.targetName })
    }
    const result = await syncConnector({
      figtation,
      card,
      targetBox: boxOf(target),
      colorHex: connectorColor(category),
      settings,
      pathEditing: pathEditFigtationId === figtation.id,
    })
    if (
      result.connectorId !== figtation.connectorId ||
      result.endpointId !== figtation.endpointId
    ) {
      figtation.connectorId = result.connectorId
      figtation.endpointId = result.endpointId
      patchFigtation(card, {
        connectorId: figtation.connectorId,
        endpointId: figtation.endpointId,
      })
    }
  } else {
    await removeSatellites(figtation)
    if (figtation.connectorId !== '' || figtation.endpointId !== '') {
      figtation.connectorId = ''
      figtation.endpointId = ''
      patchFigtation(card, { connectorId: '', endpointId: '' })
    }
  }

  writePos(card, boxOf(card))

  const outcome: SyncOutcome = {
    figtation,
    state,
    restoredRows: report.restoredRows,
    resetProtected: report.resetProtected,
    labelChanged,
  }
  if (pageName !== undefined) outcome.pageName = pageName
  return outcome
}

// ---------------------------------------------------------------------------
// Summaries for the panel
// ---------------------------------------------------------------------------

export async function summarise(card: FrameNode): Promise<FigtationSummary | null> {
  const figtation = readFigtation(card)
  if (!figtation) return null
  const box = boxOf(card)
  let state: FigtationState = 'ok'
  let pageName: string | undefined
  if (figtation.targetId === '') state = 'free'
  else {
    const target = await nodeById(figtation.targetId)
    if (!target) state = 'detached'
    else {
      const page = pageOf(target)
      if (page && page.id !== figma.currentPage.id) {
        state = 'off-page'
        pageName = page.name
      }
    }
  }
  const summary: FigtationSummary = {
    id: figtation.id,
    cardId: card.id,
    label: figtation.label,
    categoryId: figtation.categoryId,
    targetId: figtation.targetId,
    targetName: figtation.targetName,
    propCount: figtation.props.length,
    props: figtation.props,
    state,
    x: box?.x ?? 0,
    y: box?.y ?? 0,
    route: figtation.route,
    routeMode: figtation.routeMode,
    cardSide: figtation.cardSide,
    waypointCount: figtation.waypoints.length,
    widthOverride: figtation.widthOverride,
    pinned: figtation.pinned,
  }
  if (pageName !== undefined) summary.pageName = pageName
  return summary
}

export async function listSummaries(page: PageNode): Promise<FigtationSummary[]> {
  const index = getIndex(page)
  const result: FigtationSummary[] = []
  for (const card of index.cards) {
    const summary = await summarise(card)
    if (summary) result.push(summary)
  }
  return result.sort((a, b) => a.y - b.y || a.x - b.x)
}

// ---------------------------------------------------------------------------
// syncAll
// ---------------------------------------------------------------------------

/** Copy/paste duplicates a card's id — the first one keeps it (PRD §5.6). */
async function resolveDuplicates(page: PageNode): Promise<number> {
  const index = refreshIndex(page)
  const seen = new Set<string>()
  let renamed = 0
  for (const card of index.cards) {
    const id = get(card, KEYS.id)
    if (id === '') continue
    if (!seen.has(id)) {
      seen.add(id)
      continue
    }
    const figtation = readFigtation(card)
    if (!figtation) continue
    const fresh = createId()
    // The clone points at the original's connector; drop the reference so a new
    // one gets created for it.
    patchFigtation(card, { id: fresh, connectorId: '', endpointId: '' })
    renamed += 1
  }
  if (renamed > 0) refreshIndex(page)
  return renamed
}

export interface SyncAllResult {
  count: number
  duplicates: number
  restoredRows: number
}

export async function syncAll(source: RenderSource = 'sync'): Promise<SyncAllResult> {
  const page = figma.currentPage
  const settings = readSettings()
  const categories = categoryMap()

  return withWriteGuard(async () => {
    const duplicates = await resolveDuplicates(page)
    const index = refreshIndex(page)

    // Satellites whose card is gone would otherwise linger as orphan vectors.
    for (const node of index.orphanSatellites) node.remove()

    watchIndex = new Map()
    let restoredRows = 0
    let processed = 0

    for (const card of index.cards) {
      const outcome = await syncFigtation(card, source, settings, categories)
      if (!outcome) continue
      restoredRows += outcome.restoredRows
      processed += 1

      if (outcome.figtation.targetId !== '') {
        watch(outcome.figtation.targetId, outcome.figtation.id)
        const target = await nodeById(outcome.figtation.targetId)
        let current: BaseNode | null = target?.parent ?? null
        while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
          watch(current.id, outcome.figtation.id)
          current = current.parent
        }
      }
      watch(card.id, outcome.figtation.id)

      if (processed % 50 === 0 && index.cards.length > 50) {
        figma.notify(`Refreshing annotations… ${processed}/${index.cards.length}`, { timeout: 500 })
      }
    }

    if (restoredRows > 0) {
      toast(
        'warn',
        `Restored ${restoredRows} property row${restoredRows === 1 ? '' : 's'}. Remove properties in the plugin instead.`
      )
    }
    return { count: processed, duplicates, restoredRows }
  })
}

// ---------------------------------------------------------------------------
// Change handler
//
// PRD C-3 and FR-6 name `figma.on('documentchange')`. Under
// `documentAccess: "dynamic-page"` that event cannot be registered without
// `loadAllPagesAsync()` first, which would load every page of the file at
// startup and blow NFR-1. `PageNode.on('nodechange')` is the granular
// alternative the API recommends, delivers the same `NodeChange` payload for the
// current page, and matches Figtations' page-scoped design. See DECISIONS.md
// D-017.
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 120
let pending: ChangeVerdict = emptyVerdict()
let timer: ReturnType<typeof setTimeout> | null = null
let onListChanged: (() => void) | null = null

export function setListChangedHandler(handler: () => void): void {
  onListChanged = handler
}

async function flush(): Promise<void> {
  timer = null
  const verdict = pending
  pending = emptyVerdict()
  if (isEmpty(verdict)) return

  const page = figma.currentPage
  const settings = readSettings()
  const categories = categoryMap()

  await withWriteGuard(async () => {
    if (verdict.structural) {
      invalidate(page.id)
      const index = refreshIndex(page)
      for (const node of index.orphanSatellites) node.remove()
    }

    const index = getIndex(page)
    const ids = new Set<string>([...verdict.cards, ...verdict.connectors])
    for (const nodeId of verdict.movedNodeIds) {
      const watched = watchIndex.get(nodeId)
      if (!watched) continue
      for (const id of watched) ids.add(id)
    }

    let restored = 0
    for (const id of ids) {
      const card = index.byFigtationId.get(id)
      if (!card || card.removed) continue
      const outcome = await syncFigtation(card, 'sync', settings, categories)
      if (outcome) restored += outcome.restoredRows
    }

    if (verdict.protectedEdited) {
      throttledToast(
        'protected',
        'warn',
        'Category names and property values are managed in the plugin.'
      )
    }
    if (restored > 0) {
      throttledToast(
        'restored-rows',
        'warn',
        `Restored ${restored} property row${restored === 1 ? '' : 's'}. Remove properties in the plugin instead.`
      )
    }
    if (verdict.structural && onListChanged) onListChanged()
  })
}

function handleNodeChange(event: NodeChangeEvent): void {
  if (isWriting()) return
  for (const change of event.nodeChanges) classify(change, pending)
  if (isEmpty(pending)) return
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => {
    void flush().catch((error: unknown) => {
      toast('error', error instanceof Error ? error.message : 'Sync failed')
    })
  }, DEBOUNCE_MS)
}

let watchedPage: PageNode | null = null

/** Listens on one page at a time; rebind after a page switch. */
export function watchPage(page: PageNode): void {
  if (watchedPage === page) return
  unwatchPage()
  page.on('nodechange', handleNodeChange)
  watchedPage = page
}

export function unwatchPage(): void {
  if (!watchedPage) return
  try {
    watchedPage.off('nodechange', handleNodeChange)
  } catch {
    // The page may already be gone; the listener dies with it.
  }
  watchedPage = null
}

// ---------------------------------------------------------------------------
// Creation (PRD FR-1)
// ---------------------------------------------------------------------------

function placementFor(
  reference: Rect,
  targetBox: Rect,
  cardHeight: number,
  cardWidth: number,
  existing: Rect[],
  settings: Settings
): { x: number; y: number } {
  const x =
    settings.arrangeSide === 'left'
      ? reference.x - settings.arrangeGutter - cardWidth
      : reference.x + reference.width + settings.arrangeGutter
  let y = targetBox.y
  // Collision avoidance against other cards only (PRD D-2).
  for (let attempt = 0; attempt < 40; attempt++) {
    const candidate: Rect = { x, y, width: cardWidth, height: cardHeight }
    const collides = existing.some((rect) => rectsOverlap(candidate, rect, 8))
    if (!collides) break
    y += cardHeight + 16
  }
  return { x, y }
}

export async function createFigtations(
  targetIds: string[],
  draft: FigtationDraft
): Promise<string[]> {
  const settings = readSettings()
  const categories = categoryMap()
  const page = figma.currentPage
  const previousSelection = page.selection

  const created = await withWriteGuard(async () => {
    const index = refreshIndex(page)
    const occupied: Rect[] = []
    for (const card of index.cards) {
      const box = boxOf(card)
      if (box) occupied.push(box)
    }

    const ids: string[] = []
    for (const targetId of targetIds) {
      const target = await nodeById(targetId)
      if (!target) continue
      const id = await buildFigtation(target, targetId, draft, settings, categories, occupied)
      if (id !== null) ids.push(id)
    }
    refreshIndex(page)
    return ids
  })

  // The selection belongs to the user (PRD FR-1 acceptance).
  page.selection = previousSelection
  commitUndo()
  return created
}

/**
 * Builds one Figtation: card, content, position, connector.
 *
 * A fresh frame starts at the page origin and is only moved into place near the
 * end. Anything that throws in between would leave a stranded card thousands of
 * pixels from the design, so the whole build is unwound on failure.
 */
async function buildFigtation(
  target: SceneNode,
  targetId: string,
  draft: FigtationDraft,
  settings: Settings,
  categories: Map<string, FigtationCategory>,
  occupied: Rect[]
): Promise<string | null> {
  const parent: BaseNode & ChildrenMixin = sectionAncestor(target) ?? figma.currentPage
  const card = createCardShell(settings)
  parent.appendChild(card)

  try {
    const figtation: Figtation = {
      id: createId(),
      cardId: card.id,
      targetId,
      targetName: target.name,
      categoryId: draft.categoryId,
      label: draft.label,
      props: draft.props,
      connectorId: '',
      endpointId: '',
      pinned: false,
      route: 'auto',
      routeMode: draft.routeMode ?? settings.connectorStyle,
      waypoints: [],
      tangents: [],
      cardSide: draft.cardSide ?? 'auto',
      anchor: 'auto',
      widthOverride: null,
      rev: 0,
    }
    writeFigtation(card, figtation)

    const category =
      figtation.categoryId === '' ? null : (categories.get(figtation.categoryId) ?? null)
    const properties =
      figtation.props.length > 0 ? await probeSelected(target, figtation.props) : []
    await renderCard(card, {
      figtation,
      category,
      properties,
      settings,
      detached: false,
      source: 'create',
    })

    const targetBox = boxOf(target)
    const referenceBox = boxOf(outermostFrame(target)) ?? targetBox
    if (targetBox && referenceBox) {
      const height = boxOf(card)?.height ?? 0
      const position = placementFor(referenceBox, targetBox, height, card.width, occupied, settings)
      // Same conversion the connector uses: absoluteTransform, not the bounding
      // box, which strokes and rotation would skew.
      const origin = parentOrigin(parent)
      card.x = position.x - origin.x
      card.y = position.y - origin.y
      occupied.push({ x: position.x, y: position.y, width: card.width, height })
    }

    const result = await syncConnector({
      figtation,
      card,
      targetBox,
      colorHex: connectorColor(category),
      settings,
      pathEditing: false,
    })
    patchFigtation(card, {
      connectorId: result.connectorId,
      endpointId: result.endpointId,
    })
    writePos(card, boxOf(card))
    return figtation.id
  } catch (error) {
    if (!card.removed) card.remove()
    throw error
  }
}

export async function deleteFigtations(ids: string[]): Promise<number> {
  const page = figma.currentPage
  const deleted = await withWriteGuard(async () => {
    const index = getIndex(page)
    let count = 0
    for (const id of ids) {
      const card = index.byFigtationId.get(id)
      if (!card) continue
      const figtation = readFigtation(card)
      if (figtation) await removeSatellites(figtation)
      for (const node of index.satellites.get(id) ?? []) if (!node.removed) node.remove()
      card.remove()
      count += 1
    }
    refreshIndex(page)
    return count
  })
  commitUndo()
  return deleted
}

export async function duplicateFigtation(id: string): Promise<string | null> {
  const page = figma.currentPage
  const created = await withWriteGuard(async () => {
    const card = getIndex(page).byFigtationId.get(id)
    if (!card) return null
    const clone = card.clone()
    clone.x = card.x + 24
    clone.y = card.y + 24
    const fresh = createId()
    patchFigtation(clone, { id: fresh, connectorId: '', endpointId: '', pinned: true })
    set(clone, KEYS.pos, '')
    refreshIndex(page)
    const settings = readSettings()
    await syncFigtation(clone, 'create', settings, categoryMap())
    return fresh
  })
  commitUndo()
  return created
}

/** Re-renders every card, e.g. after a theme or card-width change (PRD FR-10). */
export async function rerenderAll(): Promise<number> {
  const result = await syncAll('theme')
  commitUndo()
  return result.count
}
