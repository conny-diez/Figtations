/**
 * Sandbox entry: lifecycle, menu commands and the RPC router (PRD §4.4).
 *
 * Every handler is wrapped in try/catch — the plugin must never fail silently
 * and never crash (PRD §4.4 "Fehlerregel", NFR-5).
 */
import { computeRoute } from '../shared/format/geometry'
import { isUiMessage, type MainEvent, type UiRequest } from '../shared/rpc'
import { CONNECTOR_METRICS } from '../shared/tokens'
import {
  DEFAULT_SETTINGS,
  SETTINGS_RANGES,
  type FigtationSummary,
  type PluginState,
  type RouteState,
  type SelectionContext,
  type SelectedNodeInfo,
  type Settings,
} from '../shared/types'
import { arrange } from './arrange'
import { emit, toast } from './bus'
import {
  commit as commitCategories,
  ensureCategories,
  list as listCategories,
  remove as removeCategory,
} from './categories'
import { boxOf, lockAllConnectors } from './connector'
import { readBackNetwork } from './handles'
import { exportImpact, exportNative, importNative, scanNative } from './native'
import { probeAll } from './probe'
import { getIndex, invalidate, refreshIndex } from './registry'
import {
  KEYS,
  ensureSchema,
  get,
  nodeType,
  patchFigtation,
  readFigtation,
  readSettings,
  writeSettings,
} from './store'
import {
  createFigtations,
  deleteFigtations,
  duplicateFigtation,
  handleDocumentChange,
  listSummaries,
  pathEditTarget,
  rerenderAll,
  setListChangedHandler,
  setPathEditTarget,
  summarise,
  syncAll,
  syncFigtation,
  withWriteGuard,
} from './sync'
import { list as categoriesList } from './categories'

const PANEL_SIZE_KEY = 'panelSize'
const DEFAULT_PANEL = { width: 360, height: 560 }

const readOnly = figma.editorType === 'dev'

const MUTATING_REQUESTS = new Set<UiRequest['t']>([
  'createFigtation',
  'updateFigtation',
  'deleteFigtation',
  'deleteFigtations',
  'duplicateFigtation',
  'reattach',
  'keepAsFreeNote',
  'enterPathEdit',
  'exitPathEdit',
  'setRoute',
  'resetRoute',
  'setCardSide',
  'resetWidth',
  'commitCategories',
  'deleteCategory',
  'setCategoryForMany',
  'refresh',
  'arrange',
  'importNative',
  'exportNative',
  'updateSettings',
])

// ---------------------------------------------------------------------------
// State assembly
// ---------------------------------------------------------------------------

function nodeInfo(node: SceneNode): SelectedNodeInfo {
  const type = nodeType(node)
  if (type !== '') {
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      annotatable: false,
      reason: 'This layer is part of a Figtation.',
    }
  }
  return { id: node.id, name: node.name, type: node.type, annotatable: true }
}

async function selectionContext(): Promise<SelectionContext> {
  const page = figma.currentPage
  const index = getIndex(page)
  const selection = page.selection

  const nodes: SelectedNodeInfo[] = selection.map(nodeInfo)
  const figtations: FigtationSummary[] = []
  const seen = new Set<string>()
  let activeFigtationId: string | null = null

  for (const node of selection) {
    const ownerId = index.ownerOf.get(node.id)
    if (ownerId !== undefined) {
      if (nodeType(node) === 'card') activeFigtationId = ownerId
      const card = index.byFigtationId.get(ownerId)
      if (card && !seen.has(ownerId)) {
        seen.add(ownerId)
        const summary = await summarise(card)
        if (summary) figtations.push(summary)
      }
      continue
    }
    for (const id of index.byTargetId.get(node.id) ?? []) {
      if (seen.has(id)) continue
      seen.add(id)
      const card = index.byFigtationId.get(id)
      if (!card) continue
      const summary = await summarise(card)
      if (summary) figtations.push(summary)
    }
  }

  return { nodes, figtations, activeFigtationId }
}

async function pluginState(): Promise<PluginState> {
  ensureSchema()
  await ensureCategories()
  return {
    editorType: figma.editorType,
    readOnly,
    schema: get(figma.root, KEYS.schema),
    categories: listCategories(),
    settings: readSettings(),
    selection: await selectionContext(),
    list: await listSummaries(figma.currentPage),
    pageName: figma.currentPage.name,
    pathEditFigtationId: pathEditTarget(),
  }
}

async function pushList(): Promise<void> {
  emit({ t: 'listChanged', payload: await listSummaries(figma.currentPage) })
}

async function pushSelection(): Promise<void> {
  emit({ t: 'selectionChanged', payload: await selectionContext() })
}

function routeStateOf(figtation: ReturnType<typeof readFigtation>): RouteState | null {
  if (!figtation) return null
  return {
    route: figtation.route,
    routeMode: figtation.routeMode,
    cardSide: figtation.cardSide,
    waypointCount: figtation.waypoints.length,
    anchor: figtation.anchor,
    widthOverride: figtation.widthOverride,
    pinned: figtation.pinned,
  }
}

// ---------------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------------

function cardOf(figtationId: string): FrameNode | null {
  return getIndex(figma.currentPage).byFigtationId.get(figtationId) ?? null
}

async function resyncOne(
  figtationId: string,
  source: 'plugin' | 'create' = 'plugin'
): Promise<void> {
  const card = cardOf(figtationId)
  if (!card) return
  await withWriteGuard(async () => {
    await syncFigtation(
      card,
      source,
      readSettings(),
      new Map(categoriesList().map((c) => [c.id, c]))
    )
  })
}

function clampSettings(patch: Partial<Settings>): Partial<Settings> {
  const result: Partial<Settings> = { ...patch }
  if (result.cardWidth !== undefined) {
    result.cardWidth = Math.min(
      SETTINGS_RANGES.cardWidth.max,
      Math.max(SETTINGS_RANGES.cardWidth.min, Math.round(result.cardWidth))
    )
  }
  if (result.connectorCornerRadius !== undefined) {
    result.connectorCornerRadius = Math.min(
      SETTINGS_RANGES.connectorCornerRadius.max,
      Math.max(SETTINGS_RANGES.connectorCornerRadius.min, result.connectorCornerRadius)
    )
  }
  if (result.arrangeGutter !== undefined) {
    result.arrangeGutter = Math.min(
      SETTINGS_RANGES.arrangeGutter.max,
      Math.max(SETTINGS_RANGES.arrangeGutter.min, Math.round(result.arrangeGutter))
    )
  }
  return result
}

async function handle(request: UiRequest): Promise<unknown> {
  if (readOnly && MUTATING_REQUESTS.has(request.t)) {
    throw new Error('Read-only in Dev mode — switch to Design mode to edit.')
  }

  switch (request.t) {
    case 'init':
    case 'getState':
      return pluginState()

    case 'createFigtation': {
      const ids = await createFigtations(request.targetIds, request.draft)
      await pushList()
      await pushSelection()
      return { ids }
    }

    case 'updateFigtation': {
      const card = cardOf(request.figtationId)
      if (!card) throw new Error('Annotation not found on this page.')
      patchFigtation(card, request.patch)
      await resyncOne(request.figtationId)
      await pushList()
      return null
    }

    case 'deleteFigtation':
      await deleteFigtations([request.figtationId])
      await pushList()
      await pushSelection()
      return null

    case 'deleteFigtations':
      await deleteFigtations(request.figtationIds)
      await pushList()
      await pushSelection()
      return null

    case 'duplicateFigtation': {
      const id = await duplicateFigtation(request.figtationId)
      await pushList()
      return { id }
    }

    case 'selectFigtation': {
      const card = cardOf(request.figtationId)
      if (!card) throw new Error('Annotation not found on this page.')
      figma.currentPage.selection = [card]
      if (request.zoom) figma.viewport.scrollAndZoomIntoView([card])
      return null
    }

    case 'selectTarget': {
      const card = cardOf(request.figtationId)
      const figtation = card ? readFigtation(card) : null
      if (!figtation || figtation.targetId === '') throw new Error('This annotation has no target.')
      const target = await figma.getNodeByIdAsync(figtation.targetId)
      if (!target || target.removed) throw new Error('The target no longer exists.')
      const scene = target as SceneNode
      figma.currentPage.selection = [scene]
      figma.viewport.scrollAndZoomIntoView([scene])
      return null
    }

    case 'reattach': {
      const card = cardOf(request.figtationId)
      if (!card) throw new Error('Annotation not found on this page.')
      const candidate = figma.currentPage.selection.find((node) => nodeType(node) === '')
      if (!candidate) throw new Error('Select the layer you want to attach this annotation to.')
      patchFigtation(card, { targetId: candidate.id, targetName: candidate.name, anchor: 'auto' })
      await resyncOne(request.figtationId, 'create')
      await pushList()
      return null
    }

    case 'keepAsFreeNote': {
      const card = cardOf(request.figtationId)
      if (!card) throw new Error('Annotation not found on this page.')
      patchFigtation(card, { targetId: '', anchor: 'auto', route: 'auto', waypoints: [] })
      await resyncOne(request.figtationId, 'create')
      await pushList()
      return null
    }

    case 'enterPathEdit': {
      const card = cardOf(request.figtationId)
      const figtation = card ? readFigtation(card) : null
      if (!card || !figtation) throw new Error('Annotation not found on this page.')
      if (figtation.connectorId === '') throw new Error('This annotation has no line to edit.')
      const connector = await figma.getNodeByIdAsync(figtation.connectorId)
      if (!connector || connector.removed) throw new Error('This annotation has no line to edit.')
      const vector = connector as VectorNode
      await withWriteGuard(async () => {
        vector.locked = false
      })
      figma.currentPage.selection = [vector]
      figma.viewport.scrollAndZoomIntoView([vector])
      setPathEditTarget(request.figtationId)
      toast('info', 'Press Enter to edit the line. Drag the handles, then click Done.')
      return null
    }

    case 'exitPathEdit': {
      const figtationId = pathEditTarget()
      setPathEditTarget(null)
      if (figtationId === null) return null
      const card = cardOf(figtationId)
      const figtation = card ? readFigtation(card) : null
      if (!card || !figtation) return null
      const connector = await figma.getNodeByIdAsync(figtation.connectorId)
      if (connector && !connector.removed && connector.type === 'VECTOR') {
        const target =
          figtation.targetId === '' ? null : await figma.getNodeByIdAsync(figtation.targetId)
        const targetBox = target && !target.removed ? boxOf(target as SceneNode) : null
        const cardBox = boxOf(card)
        let expected = null
        if (cardBox && targetBox) {
          expected = computeRoute({
            card: cardBox,
            target: targetBox,
            cardSide: figtation.cardSide,
            anchor: figtation.anchor,
            route: figtation.route,
            mode: figtation.routeMode,
            waypoints: figtation.waypoints,
            stub: CONNECTOR_METRICS.stub,
            snap: readSettings().snapWaypoints,
          }).anchorPoint
        }
        const readBack = readBackNetwork(connector, targetBox, expected)
        if (!readBack.ok) {
          toast('warn', readBack.error ?? 'Could not read the line back.')
        } else {
          const patch: Parameters<typeof patchFigtation>[1] = {
            waypoints: readBack.waypoints,
            tangents: readBack.tangents,
            route: readBack.waypoints.length > 0 ? 'custom' : 'auto',
          }
          if (readBack.anchor) patch.anchor = readBack.anchor
          patchFigtation(card, patch)
        }
        await withWriteGuard(async () => {
          connector.locked = true
        })
      }
      await resyncOne(figtationId)
      const updated = cardOf(figtationId)
      const state = routeStateOf(updated ? readFigtation(updated) : null)
      if (state) emit({ t: 'routeChanged', figtationId, payload: state })
      return null
    }

    case 'setRoute': {
      const card = cardOf(request.figtationId)
      if (!card) throw new Error('Annotation not found on this page.')
      patchFigtation(card, { routeMode: request.mode })
      await resyncOne(request.figtationId)
      return null
    }

    case 'resetRoute': {
      const card = cardOf(request.figtationId)
      if (!card) throw new Error('Annotation not found on this page.')
      patchFigtation(card, { route: 'auto', waypoints: [], tangents: [], anchor: 'auto' })
      await resyncOne(request.figtationId)
      const state = routeStateOf(readFigtation(card))
      if (state) emit({ t: 'routeChanged', figtationId: request.figtationId, payload: state })
      return null
    }

    case 'setCardSide': {
      const card = cardOf(request.figtationId)
      if (!card) throw new Error('Annotation not found on this page.')
      patchFigtation(card, { cardSide: request.side })
      await resyncOne(request.figtationId)
      return null
    }

    case 'resetWidth': {
      const card = cardOf(request.figtationId)
      if (!card) throw new Error('Annotation not found on this page.')
      patchFigtation(card, { widthOverride: null })
      await resyncOne(request.figtationId, 'create')
      return null
    }

    case 'probeTarget': {
      const node = await figma.getNodeByIdAsync(request.targetId)
      if (!node || node.removed) throw new Error('Layer not found.')
      const payload = await probeAll(node as SceneNode)
      emit({ t: 'probeResult', targetId: request.targetId, payload })
      return payload
    }

    case 'listCategories':
      return listCategories()

    case 'commitCategories': {
      const categories = commitCategories(request.categories)
      await syncAll('plugin')
      await pushList()
      return categories
    }

    case 'deleteCategory': {
      const page = figma.currentPage
      const index = refreshIndex(page)
      await withWriteGuard(async () => {
        for (const card of index.cards) {
          const figtation = readFigtation(card)
          if (!figtation || figtation.categoryId !== request.categoryId) continue
          patchFigtation(card, { categoryId: request.reassignTo ?? '' })
        }
      })
      const categories = removeCategory(request.categoryId)
      await syncAll('plugin')
      await pushList()
      return categories
    }

    case 'setCategoryForMany': {
      const index = getIndex(figma.currentPage)
      await withWriteGuard(async () => {
        for (const id of request.figtationIds) {
          const card = index.byFigtationId.get(id)
          if (!card) continue
          patchFigtation(card, { categoryId: request.categoryId })
        }
      })
      await syncAll('plugin')
      await pushList()
      return null
    }

    case 'refresh': {
      if (request.scope === 'one' && request.figtationId) {
        await resyncOne(request.figtationId)
        await pushList()
        return { count: 1 }
      }
      if (request.scope === 'file') await figma.loadAllPagesAsync()
      const result = await syncAll('sync')
      await pushList()
      toast('info', `Refreshed ${result.count} annotation${result.count === 1 ? '' : 's'}.`)
      return { count: result.count }
    }

    case 'arrange': {
      const result = await arrange(request.scope, request.options)
      await pushList()
      toast('info', `Arranged ${result.moved} annotation${result.moved === 1 ? '' : 's'}.`)
      return { count: result.moved }
    }

    case 'scanNative':
      return scanNative(request.scope)

    case 'importNative': {
      const result = await importNative(request.scope, request.deleteSource)
      await pushList()
      toast('info', `Imported ${result.imported} annotation${result.imported === 1 ? '' : 's'}.`)
      return result
    }

    case 'exportNative': {
      const layers = await exportImpact(request.scope)
      const result = await exportNative(request.scope)
      toast(
        'info',
        `Exported ${result.exported} annotation${result.exported === 1 ? '' : 's'} to ${layers} layer${layers === 1 ? '' : 's'}.` +
          (result.skipped > 0 ? ` Skipped ${result.skipped}.` : '')
      )
      return result
    }

    case 'updateSettings': {
      const previous = readSettings()
      const next: Settings = { ...previous, ...clampSettings(request.patch) }
      writeSettings(next)
      const needsRerender =
        next.theme !== previous.theme ||
        next.cardWidth !== previous.cardWidth ||
        next.showPropertyValues !== previous.showPropertyValues ||
        next.connectorDashed !== previous.connectorDashed ||
        next.connectorCornerRadius !== previous.connectorCornerRadius ||
        next.showEndpointDot !== previous.showEndpointDot ||
        next.connectorStyle !== previous.connectorStyle
      if (needsRerender) await rerenderAll()
      emit({ t: 'state', payload: await pluginState() })
      return next
    }

    case 'resizeUi': {
      const width = Math.max(300, Math.round(request.width))
      const height = Math.max(360, Math.round(request.height))
      figma.ui.resize(width, height)
      await figma.clientStorage.setAsync(PANEL_SIZE_KEY, { width, height })
      return null
    }
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

async function panelSize(): Promise<{ width: number; height: number }> {
  try {
    const stored: unknown = await figma.clientStorage.getAsync(PANEL_SIZE_KEY)
    if (typeof stored === 'object' && stored !== null) {
      const record = stored as Record<string, unknown>
      const width = record['width']
      const height = record['height']
      if (typeof width === 'number' && typeof height === 'number') {
        return { width, height }
      }
    }
  } catch {
    // clientStorage may be unavailable; fall through to the default.
  }
  return DEFAULT_PANEL
}

function registerListeners(): void {
  figma.on('documentchange', handleDocumentChange)
  figma.on('selectionchange', () => {
    void pushSelection().catch(() => undefined)
    // Leaving the selection ends path editing (PRD FR-5b).
    const editing = pathEditTarget()
    if (editing === null) return
    const card = cardOf(editing)
    const figtation = card ? readFigtation(card) : null
    const selectionIds = new Set(figma.currentPage.selection.map((node) => node.id))
    if (figtation && !selectionIds.has(figtation.connectorId)) {
      void handle({ t: 'exitPathEdit' }).catch(() => undefined)
    }
  })
  figma.on('currentpagechange', () => {
    invalidate()
    void (async () => {
      await syncAll('sync')
      emit({ t: 'state', payload: await pluginState() })
    })().catch(() => undefined)
  })
  figma.on('close', () => {
    // Never leave an unlocked connector behind (PRD FR-5b).
    if (readOnly) return
    try {
      lockAllConnectors(figma.currentPage)
    } catch {
      // Nothing more we can do while shutting down.
    }
  })
  setListChangedHandler(() => {
    void pushList().catch(() => undefined)
  })
}

function router(message: unknown): void {
  if (!isUiMessage(message)) return
  const { requestId, req } = message
  void (async () => {
    try {
      const payload = await handle(req)
      const response: MainEvent =
        payload === null || payload === undefined
          ? { t: 'ok', requestId }
          : { t: 'ok', requestId, payload }
      emit(response)
    } catch (error: unknown) {
      const message_ = error instanceof Error ? error.message : 'Something went wrong'
      emit({ t: 'error', requestId, message: message_ })
      figma.notify(message_, { error: true })
    }
  })()
}

async function openUi(): Promise<void> {
  const size = await panelSize()
  figma.showUI(__html__, { ...size, themeColors: false })
  figma.ui.onmessage = router
}

async function bootstrap(): Promise<void> {
  ensureSchema()
  await ensureCategories()

  if (!readOnly) {
    try {
      lockAllConnectors(figma.currentPage)
    } catch {
      // Sweep is best effort.
    }
  }

  const command = figma.command

  // Headless menu commands (PRD §4.3).
  if (command === 'refresh-page' && !readOnly) {
    const result = await syncAll('sync')
    figma.notify(`Refreshed ${result.count} annotation${result.count === 1 ? '' : 's'}`)
    figma.closePlugin()
    return
  }
  if (command === 'arrange' && !readOnly) {
    const settings = readSettings()
    const result = await arrange('page', {
      gutter: settings.arrangeGutter,
      side: settings.arrangeSide,
    })
    figma.notify(`Arranged ${result.moved} annotation${result.moved === 1 ? '' : 's'}`)
    figma.closePlugin()
    return
  }

  registerListeners()
  await openUi()

  if (readOnly) {
    emit({ t: 'state', payload: await pluginState() })
    return
  }

  const settings = readSettings()
  if (settings.autoRefreshOnOpen) await syncAll('sync')
  emit({ t: 'state', payload: await pluginState() })

  if (command === 'import-native') {
    const scan = await scanNative('page')
    toast(
      'info',
      `Found ${scan.annotationCount} native annotation${scan.annotationCount === 1 ? '' : 's'} on ${scan.layerCount} layer${scan.layerCount === 1 ? '' : 's'}.`
    )
  }
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Figtations failed to start'
  figma.notify(message, { error: true })
})

// Global safety net (NFR-5).
const globalScope = globalThis as unknown as {
  onunhandledrejection?: (event: unknown) => void
}
globalScope.onunhandledrejection = (): void => {
  figma.notify('Something went wrong in Figtations', { error: true })
}

// Referenced so the bundler keeps them even when unused by a code path above.
export const __internals = { DEFAULT_SETTINGS }
