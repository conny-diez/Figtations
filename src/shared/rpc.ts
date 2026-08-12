/**
 * Typed request/response protocol over postMessage (PRD §4.4).
 * Every request carries an id so the UI can resolve a promise.
 */
import type {
  ArrangeOptions,
  CardSide,
  FigtationCategory,
  FigtationDraft,
  FigtationSummary,
  NativeScanResult,
  ProbedProperty,
  PluginState,
  RouteMode,
  RouteState,
  SelectionContext,
  Settings,
} from './types'

export type UiRequest =
  | { t: 'init' }
  | { t: 'getState' }
  | { t: 'createFigtation'; targetIds: string[]; draft: FigtationDraft }
  | { t: 'updateFigtation'; figtationId: string; patch: Partial<FigtationDraft> }
  | { t: 'deleteFigtation'; figtationId: string }
  | { t: 'deleteFigtations'; figtationIds: string[] }
  | { t: 'duplicateFigtation'; figtationId: string }
  | { t: 'selectFigtation'; figtationId: string; zoom: boolean }
  | { t: 'selectTarget'; figtationId: string }
  | { t: 'revealNode'; nodeId: string }
  | { t: 'reattach'; figtationId: string }
  | { t: 'keepAsFreeNote'; figtationId: string }
  | { t: 'enterPathEdit'; figtationId: string }
  | { t: 'exitPathEdit' }
  | { t: 'setRoute'; figtationId: string; mode: RouteMode }
  | { t: 'resetRoute'; figtationId: string }
  | { t: 'setCardSide'; figtationId: string; side: CardSide }
  | { t: 'resetWidth'; figtationId: string }
  | { t: 'probeTarget'; targetId: string }
  | { t: 'listCategories' }
  | { t: 'commitCategories'; categories: FigtationCategory[] }
  | { t: 'deleteCategory'; categoryId: string; reassignTo: string | null }
  | { t: 'setCategoryForMany'; figtationIds: string[]; categoryId: string }
  | { t: 'refresh'; scope: 'page' | 'file' | 'one'; figtationId?: string }
  | { t: 'arrange'; scope: 'page' | 'selection'; options: ArrangeOptions }
  | { t: 'scanNative'; scope: 'page' | 'file' }
  | { t: 'importNative'; scope: 'page' | 'file'; deleteSource: boolean }
  | { t: 'exportNative'; scope: 'page' | 'file' }
  | { t: 'updateSettings'; patch: Partial<Settings> }
  | { t: 'resizeUi'; width: number; height: number; persist: boolean }

export type MainEvent =
  | { t: 'state'; payload: PluginState }
  | { t: 'selectionChanged'; payload: SelectionContext }
  | { t: 'listChanged'; payload: FigtationSummary[] }
  | { t: 'probeResult'; targetId: string; payload: ProbedProperty[] }
  | { t: 'labelChangedOnCanvas'; figtationId: string; label: string }
  | { t: 'routeChanged'; figtationId: string; payload: RouteState }
  | { t: 'pathEditMode'; figtationId: string | null }
  | { t: 'toast'; level: 'info' | 'warn' | 'error'; message: string }
  | { t: 'error'; requestId: string; message: string }
  | { t: 'ok'; requestId: string; payload?: unknown }

/** UI → sandbox envelope. */
export interface UiMessage {
  requestId: string
  req: UiRequest
}

// ---------------------------------------------------------------------------
// Type guards. postMessage payloads are `unknown`; nothing is trusted.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isUiMessage(value: unknown): value is UiMessage {
  if (!isRecord(value)) return false
  if (typeof value['requestId'] !== 'string') return false
  const req = value['req']
  return isRecord(req) && typeof req['t'] === 'string'
}

export function isMainEvent(value: unknown): value is MainEvent {
  return isRecord(value) && typeof value['t'] === 'string'
}

/** Response payload shapes, keyed by request type. */
export interface ResponseMap {
  init: PluginState
  getState: PluginState
  createFigtation: { ids: string[] }
  probeTarget: ProbedProperty[]
  listCategories: FigtationCategory[]
  scanNative: NativeScanResult
  importNative: { imported: number; skipped: number }
  exportNative: { exported: number; skipped: number }
  refresh: { count: number }
  arrange: { count: number }
}
