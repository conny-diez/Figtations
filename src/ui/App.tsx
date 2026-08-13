/** Panel shell: tabs, footer, modals, toasts (PRD FR-7, FR-10, FR-11). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CardSide,
  FigtationCategory,
  NativeScanResult,
  PluginState,
  ProbedProperty,
  PropertyType,
  RouteMode,
  Settings,
} from '../shared/types'
import { onEvent, request } from './rpc'
import { strings } from './strings'
import { AnnotationList } from './components/AnnotationList'
import { CategoryManager } from './components/CategoryManager'
import { Editor } from './components/Editor'
import { Logo } from './components/Logo'
import { SettingsPanel } from './components/SettingsPanel'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import { Button, HintRow, ResizeHandle, Toasts, type ToastMessage } from './components/primitives'

type Tab = 'annotate' | 'all'

export function App(): JSX.Element {
  const [state, setState] = useState<PluginState | null>(null)
  const [tab, setTab] = useState<Tab>('annotate')
  const [probed, setProbed] = useState<ProbedProperty[]>([])
  const [probedFor, setProbedFor] = useState<string>('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [forcedFigtationId, setForcedFigtationId] = useState<string | null>(null)
  const toastId = useRef(0)

  const pushToast = useCallback((level: ToastMessage['level'], message: string) => {
    toastId.current += 1
    const id = toastId.current
    setToasts((current) => [...current, { id, level, message }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((entry) => entry.id !== id))
    }, 4000)
  }, [])

  useEffect(() => {
    const unsubscribe = onEvent((event) => {
      switch (event.t) {
        case 'state':
          setState(event.payload)
          break
        case 'selectionChanged':
          setState((current) => (current ? { ...current, selection: event.payload } : current))
          setForcedFigtationId(null)
          break
        case 'listChanged':
          setState((current) => (current ? { ...current, list: event.payload } : current))
          break
        case 'probeResult':
          setProbed(event.payload)
          setProbedFor(event.targetId)
          break
        case 'pathEditMode':
          setState((current) =>
            current ? { ...current, pathEditFigtationId: event.figtationId } : current
          )
          break
        case 'toast':
          pushToast(event.level, event.message)
          break
        case 'labelChangedOnCanvas':
          setState((current) =>
            current
              ? {
                  ...current,
                  list: current.list.map((entry) =>
                    entry.id === event.figtationId ? { ...entry, label: event.label } : entry
                  ),
                  selection: {
                    ...current.selection,
                    figtations: current.selection.figtations.map((entry) =>
                      entry.id === event.figtationId ? { ...entry, label: event.label } : entry
                    ),
                  },
                }
              : current
          )
          break
        default:
          break
      }
    })
    void request<PluginState>({ t: 'init' })
      .then(setState)
      .catch((error: unknown) => {
        pushToast('error', error instanceof Error ? error.message : 'Failed to start')
      })
    return unsubscribe
  }, [pushToast])

  const run = useCallback(
    async <T,>(promise: Promise<T>): Promise<T | null> => {
      try {
        return await promise
      } catch (error: unknown) {
        pushToast('error', error instanceof Error ? error.message : 'Something went wrong')
        return null
      }
    },
    [pushToast]
  )

  const refreshState = useCallback(async () => {
    const next = await run(request<PluginState>({ t: 'getState' }))
    if (next) setState(next)
  }, [run])

  const targets = useMemo(
    () => state?.selection.nodes.filter((node) => node.annotatable) ?? [],
    [state]
  )

  const editing = useMemo(() => {
    if (!state) return null
    if (forcedFigtationId) {
      return state.list.find((entry) => entry.id === forcedFigtationId) ?? null
    }
    const active = state.selection.activeFigtationId
    if (active) return state.selection.figtations.find((entry) => entry.id === active) ?? null
    return state.selection.figtations[0] ?? null
  }, [state, forcedFigtationId])

  // Live property values for whichever layer the editor is pointed at.
  const probeTargetId = editing?.targetId ?? targets[0]?.id ?? ''
  useEffect(() => {
    if (probeTargetId === '' || probeTargetId === probedFor) return
    void run(request<ProbedProperty[]>({ t: 'probeTarget', targetId: probeTargetId })).then(
      (result) => {
        if (result) {
          setProbed(result)
          setProbedFor(probeTargetId)
        }
      }
    )
  }, [probeTargetId, probedFor, run])

  // The theme lands on <html> so the tokens in styles.css and the native
  // controls (color-scheme) flip together.
  const panelTheme = state?.panelTheme ?? 'dark'
  useEffect(() => {
    document.documentElement.dataset['theme'] = panelTheme
  }, [panelTheme])

  if (!state) {
    return <div className="app app--loading">Loading…</div>
  }

  const readOnly = state.readOnly
  const pathEditing =
    state.pathEditFigtationId !== null && state.pathEditFigtationId === editing?.id
  /** A draft is on screen: the Editor shows its CTA instead of an edit form. */
  const creating = tab === 'annotate' && editing === null && targets.length > 0
  // DESIGN.md rule 8: procedural hints live at the end of the panel, in the
  // footer's own row, never inline and never coloured.
  const footerHint = pathEditing
    ? strings.editor.pathEditHint
    : creating
      ? strings.editor.createHint
      : null

  const patchEditing = (patch: {
    categoryId?: string
    label?: string
    props?: PropertyType[]
  }): void => {
    if (!editing) return
    void run(request({ t: 'updateFigtation', figtationId: editing.id, patch })).then(refreshState)
  }

  const create = (categoryId: string, label: string, props: PropertyType[]): void => {
    const ids = targets.map((node) => node.id)
    if (ids.length === 0) return
    void run(
      request<{ ids: string[] }>({
        t: 'createFigtation',
        targetIds: ids,
        draft: { categoryId, label, props },
      })
    ).then(async (result) => {
      await refreshState()
      const firstId = result?.ids[0]
      if (firstId) setForcedFigtationId(firstId)
    })
  }

  const annotateTab = (): JSX.Element => {
    const blocked = state.selection.nodes.filter((node) => !node.annotatable)
    if (!editing && targets.length === 0) {
      return (
        <div className="empty-state">
          <h2>{strings.emptySelection.title}</h2>
          <p>{strings.emptySelection.body}</p>
          {blocked.length > 0 && <p className="notice">{blocked[0]?.reason}</p>}
        </div>
      )
    }
    return (
      <>
        {state.selection.figtations.length > 1 && (
          <div className="chips">
            {state.selection.figtations.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={entry.id === editing?.id}
                className={`chip${entry.id === editing?.id ? ' is-active' : ''}`}
                onClick={() => setForcedFigtationId(entry.id)}
              >
                {entry.label || entry.targetName}
              </button>
            ))}
          </div>
        )}
        <Editor
          categories={state.categories}
          targets={targets}
          editing={editing}
          probed={probed}
          readOnly={readOnly}
          pathEditing={pathEditing}
          onCreate={create}
          onPatch={patchEditing}
          onEditCategories={() => setCategoriesOpen(true)}
          onSelectTarget={() => {
            if (editing) void run(request({ t: 'selectTarget', figtationId: editing.id }))
          }}
          onDuplicate={() => {
            if (editing) {
              void run(request({ t: 'duplicateFigtation', figtationId: editing.id })).then(
                refreshState
              )
            }
          }}
          onDelete={() => {
            if (editing) {
              void run(request({ t: 'deleteFigtation', figtationId: editing.id })).then(() => {
                setForcedFigtationId(null)
                void refreshState()
              })
            }
          }}
          onEnterPathEdit={() => {
            if (editing) void run(request({ t: 'enterPathEdit', figtationId: editing.id }))
          }}
          onExitPathEdit={() => {
            void run(request({ t: 'exitPathEdit' })).then(refreshState)
          }}
          onResetRoute={() => {
            if (editing) {
              void run(request({ t: 'resetRoute', figtationId: editing.id })).then(refreshState)
            }
          }}
          onSetRouteMode={(mode: RouteMode) => {
            if (editing) {
              void run(request({ t: 'setRoute', figtationId: editing.id, mode })).then(refreshState)
            }
          }}
          onSetCardSide={(side: CardSide) => {
            if (editing) {
              void run(request({ t: 'setCardSide', figtationId: editing.id, side })).then(
                refreshState
              )
            }
          }}
          onRevealNode={(nodeId) => {
            void run(request({ t: 'revealNode', nodeId }))
          }}
          onResetWidth={() => {
            if (editing) {
              void run(request({ t: 'resetWidth', figtationId: editing.id })).then(refreshState)
            }
          }}
        />
      </>
    )
  }

  return (
    <div className="app">
      <header className="appbar">
        <span className="appbar__mark">
          <Logo size={16} />
        </span>
        <span className="appbar__title">{strings.appName}</span>
        <span className="appbar__version">{strings.version}</span>
        <ThemeSwitcher
          value={state.panelTheme}
          onChange={(theme) => {
            setState((current) => (current ? { ...current, panelTheme: theme } : current))
            void request({ t: 'setPanelTheme', theme }).catch(() => undefined)
          }}
        />
        <button
          type="button"
          className="appbar__close"
          aria-label={strings.close}
          title={strings.close}
          onClick={() => {
            void request({ t: 'closePlugin' }).catch(() => undefined)
          }}
        >
          ✕
        </button>
      </header>

      {readOnly && <div className="banner">{strings.devModeBanner}</div>}

      <nav className="tabs" role="tablist" aria-label="Figtations">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'annotate'}
          className={`tab${tab === 'annotate' ? ' is-active' : ''}`}
          onClick={() => setTab('annotate')}
        >
          {strings.tabs.annotate}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'all'}
          className={`tab${tab === 'all' ? ' is-active' : ''}`}
          onClick={() => setTab('all')}
        >
          {strings.tabs.all}
        </button>
      </nav>

      <main className="content">
        {tab === 'annotate' ? (
          annotateTab()
        ) : (
          <AnnotationList
            list={state.list}
            categories={state.categories}
            readOnly={readOnly}
            onSelect={(id, zoom) => {
              void run(request({ t: 'selectFigtation', figtationId: id, zoom }))
            }}
            onEdit={(id) => {
              setForcedFigtationId(id)
              setTab('annotate')
            }}
            onSelectTarget={(id) => {
              void run(request({ t: 'selectTarget', figtationId: id }))
            }}
            onDuplicate={(id) => {
              void run(request({ t: 'duplicateFigtation', figtationId: id })).then(refreshState)
            }}
            onDelete={(ids) => {
              void run(request({ t: 'deleteFigtations', figtationIds: ids })).then(refreshState)
            }}
            onReattach={(id) => {
              void run(request({ t: 'reattach', figtationId: id })).then(refreshState)
            }}
            onKeepAsFreeNote={(id) => {
              void run(request({ t: 'keepAsFreeNote', figtationId: id })).then(refreshState)
            }}
            onSetCategory={(ids, categoryId) => {
              void run(request({ t: 'setCategoryForMany', figtationIds: ids, categoryId })).then(
                refreshState
              )
            }}
            onArrangeSelection={() => {
              void run(
                request({
                  t: 'arrange',
                  scope: 'selection',
                  options: {
                    gutter: state.settings.arrangeGutter,
                    side: state.settings.arrangeSide,
                  },
                })
              ).then(refreshState)
            }}
          />
        )}
      </main>

      <footer className="footer">
        <div className="footer__actions">
          <Button
            // DESIGN.md rule 1: one yellow per surface. While a draft is on screen
            // the CTA is Create, so Refresh steps back to secondary.
            variant={creating ? 'secondary' : 'primary'}
            disabled={readOnly}
            onClick={() => {
              void run(request({ t: 'refresh', scope: 'page' })).then(refreshState)
            }}
          >
            {strings.footer.refresh}
          </Button>
          <Button
            disabled={readOnly}
            onClick={() => {
              void run(
                request({
                  t: 'arrange',
                  scope: 'page',
                  options: {
                    gutter: state.settings.arrangeGutter,
                    side: state.settings.arrangeSide,
                  },
                })
              ).then(refreshState)
            }}
          >
            {strings.footer.arrange}
          </Button>
          <Button
            square
            ariaLabel={strings.footer.settings}
            title={strings.footer.settings}
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </Button>
          <span className="footer__counter">{strings.footer.counter(state.list.length)}</span>
        </div>
        {footerHint !== null && <HintRow>{footerHint}</HintRow>}
      </footer>

      {categoriesOpen && (
        <CategoryManager
          categories={state.categories}
          list={state.list}
          onClose={() => setCategoriesOpen(false)}
          onCommit={(categories: FigtationCategory[]) => {
            void run(request({ t: 'commitCategories', categories })).then(() => {
              setCategoriesOpen(false)
              void refreshState()
            })
          }}
          onDelete={(categoryId, reassignTo) => {
            void run(request({ t: 'deleteCategory', categoryId, reassignTo })).then(refreshState)
          }}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          settings={state.settings}
          readOnly={readOnly}
          cardCount={state.list.length}
          onClose={() => setSettingsOpen(false)}
          onChange={(patch: Partial<Settings>) => {
            void run(request({ t: 'updateSettings', patch })).then(refreshState)
          }}
          onScanNative={async (scope) => {
            const result = await run(request<NativeScanResult>({ t: 'scanNative', scope }))
            return result ?? { annotationCount: 0, layerCount: 0, pageCount: 0 }
          }}
          onImportNative={(scope, deleteSource) => {
            void run(request({ t: 'importNative', scope, deleteSource })).then(refreshState)
          }}
          onExportNative={(scope) => {
            void run(request({ t: 'exportNative', scope }))
          }}
        />
      )}

      <Toasts items={toasts} />

      <ResizeHandle
        label={strings.resizeHandle}
        onResize={(width, height, persist) => {
          void request({ t: 'resizeUi', width, height, persist }).catch(() => undefined)
        }}
      />
    </div>
  )
}
