/**
 * Card editor (PRD FR-1, FR-5b). There is no "Save": the first property or a
 * non-empty label creates the Figtation, everything after that edits it live.
 */
import { useEffect, useMemo, useState } from 'react'
import { CATEGORY_HEX } from '../../shared/tokens'
import type {
  CardSide,
  FigtationCategory,
  FigtationSummary,
  ProbedProperty,
  PropertyType,
  RouteMode,
  SelectedNodeInfo,
} from '../../shared/types'
import { strings } from '../strings'
import { CategorySelect } from './CategorySelect'
import { PropertyPicker } from './PropertyPicker'
import { Button, IconButton, Pill, Segmented, Textarea } from './primitives'

const SIDE_OPTIONS: ReadonlyArray<{ value: CardSide; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
]

const ROUTE_OPTIONS: ReadonlyArray<{ value: RouteMode; label: string }> = [
  { value: 'straight', label: strings.editor.straight },
  { value: 'elbow', label: strings.editor.elbow },
]

export interface EditorProps {
  categories: FigtationCategory[]
  /** Annotatable nodes in the current selection. */
  targets: SelectedNodeInfo[]
  /** The Figtation being edited, or null in create mode. */
  editing: FigtationSummary | null
  probed: ProbedProperty[]
  readOnly: boolean
  pathEditing: boolean
  onCreate: (categoryId: string, label: string, props: PropertyType[]) => void
  onPatch: (patch: { categoryId?: string; label?: string; props?: PropertyType[] }) => void
  onEditCategories: () => void
  onSelectTarget: () => void
  onDuplicate: () => void
  onDelete: () => void
  onEnterPathEdit: () => void
  onExitPathEdit: () => void
  onResetRoute: () => void
  onSetRouteMode: (mode: RouteMode) => void
  onSetCardSide: (side: CardSide) => void
  onResetWidth: () => void
}

export function Editor(props: EditorProps): JSX.Element {
  const { editing, readOnly } = props
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '')
  const [label, setLabel] = useState(editing?.label ?? '')
  const [props_, setProps] = useState<PropertyType[]>(editing?.props ?? [])
  const [pickerOpen, setPickerOpen] = useState(false)

  const editingId = editing?.id ?? null
  const targetKey = props.targets.map((node) => node.id).join(',')
  // Compared by value, not identity: every state push from the sandbox creates a
  // fresh array, and resetting on identity would wipe what the user is typing.
  const propsKey = (editing?.props ?? []).join(',')
  const editingCategoryId = editing?.categoryId ?? ''
  const editingLabel = editing?.label ?? ''

  useEffect(() => {
    setCategoryId(editingCategoryId)
    setLabel(editingLabel)
    setProps(propsKey === '' ? [] : (propsKey.split(',') as PropertyType[]))
    setPickerOpen(false)
  }, [editingId, targetKey, editingCategoryId, editingLabel, propsKey])

  const byType = useMemo(() => {
    const map = new Map<PropertyType, ProbedProperty>()
    for (const entry of props.probed) map.set(entry.type, entry)
    return map
  }, [props.probed])

  const category = props.categories.find((entry) => entry.id === categoryId) ?? null

  /**
   * Edits to an existing Figtation apply immediately. In create mode nothing is
   * written to the canvas — the draft is local until the CTA is pressed.
   */
  const commit = (next: { categoryId?: string; label?: string; props?: PropertyType[] }): void => {
    if (editingId) props.onPatch(next)
  }

  /** A draft needs something to show before it may become a card. */
  const draftReady = label.trim() !== '' || props_.length > 0

  const submitDraft = (): void => {
    if (readOnly || !draftReady || props.targets.length === 0) return
    props.onCreate(categoryId, label, props_)
  }

  const addProperty = (type: PropertyType): void => {
    if (props_.includes(type)) return
    const next = [...props_, type]
    setProps(next)
    commit({ props: next })
  }

  const removeProperty = (type: PropertyType): void => {
    const next = props_.filter((entry) => entry !== type)
    setProps(next)
    commit({ props: next })
  }

  const moveProperty = (type: PropertyType, delta: number): void => {
    const index = props_.indexOf(type)
    const target = index + delta
    if (index < 0 || target < 0 || target >= props_.length) return
    const next = [...props_]
    next.splice(index, 1)
    next.splice(target, 0, type)
    setProps(next)
    commit({ props: next })
  }

  const multi = props.targets.length > 1

  return (
    <div className="editor">
      {multi && !editingId && (
        <p className="notice">{strings.editor.multiSelection(props.targets.length)}</p>
      )}

      {editing && editing.state === 'detached' && (
        <p className="notice notice--danger">{strings.list.detached}</p>
      )}
      {editing && editing.state === 'off-page' && (
        <p className="notice notice--warn">
          {strings.list.offPage}
          {editing.pageName ? ` · ${editing.pageName}` : ''}
        </p>
      )}

      <label className="field">
        <span className="field__label">{strings.editor.category}</span>
        <CategorySelect
          categories={props.categories}
          value={categoryId}
          disabled={readOnly}
          onEditCategories={props.onEditCategories}
          onChange={(next) => {
            setCategoryId(next)
            commit({ categoryId: next })
          }}
        />
      </label>

      <label className="field">
        <span className="field__label">Label</span>
        <Textarea
          value={label}
          ariaLabel="Annotation label"
          placeholder={strings.editor.labelPlaceholder}
          disabled={readOnly}
          onChange={setLabel}
          onBlur={() => {
            if (label !== (editing?.label ?? '')) commit({ label })
          }}
          {...(editingId ? {} : { onSubmit: submitDraft })}
        />
      </label>

      <div className="field">
        <span className="field__label">Properties</span>
        {props_.length === 0 && <p className="empty">{strings.editor.noProperties}</p>}
        <ul className="prop-list">
          {props_.map((type, index) => {
            const probed = byType.get(type)
            return (
              <li key={type} className="prop-row">
                <span className="prop-row__key">{probed?.key ?? type}</span>
                <span className="prop-row__value">
                  {probed?.swatch && (
                    <span
                      className="prop-row__swatch"
                      style={{ backgroundColor: probed.swatch }}
                      aria-hidden="true"
                    />
                  )}
                  {probed?.variable ? (
                    <span className="token-chip">{probed.variable}</span>
                  ) : (
                    (probed?.value ?? '—')
                  )}
                </span>
                <span className="prop-row__actions">
                  <IconButton
                    label={`Move ${probed?.key ?? type} up`}
                    disabled={readOnly || index === 0}
                    onClick={() => moveProperty(type, -1)}
                  >
                    ↑
                  </IconButton>
                  <IconButton
                    label={`Move ${probed?.key ?? type} down`}
                    disabled={readOnly || index === props_.length - 1}
                    onClick={() => moveProperty(type, 1)}
                  >
                    ↓
                  </IconButton>
                  <IconButton
                    label={`Remove ${probed?.key ?? type}`}
                    disabled={readOnly}
                    onClick={() => removeProperty(type)}
                  >
                    −
                  </IconButton>
                </span>
              </li>
            )
          })}
        </ul>
        {pickerOpen ? (
          <PropertyPicker
            probed={props.probed}
            selected={props_}
            onAdd={addProperty}
            onClose={() => setPickerOpen(false)}
          />
        ) : (
          <Button disabled={readOnly} onClick={() => setPickerOpen(true)}>
            {strings.editor.addProperty}
          </Button>
        )}
      </div>

      {!editingId && (
        <div className="cta">
          <Button variant="primary" full disabled={readOnly || !draftReady} onClick={submitDraft}>
            {multi
              ? strings.editor.createMany(props.targets.length)
              : strings.editor.createAnnotation}
          </Button>
          <p className="hint">
            {draftReady ? strings.editor.createHint : strings.editor.createDisabledHint}
          </p>
        </div>
      )}

      {editing && (
        <>
          {category && (
            <div className="field">
              <span className="field__label">Preview</span>
              <Pill color={CATEGORY_HEX[category.color]}>{category.label}</Pill>
            </div>
          )}

          <div className="field">
            <span className="field__label">{strings.editor.line}</span>
            <Segmented
              ariaLabel={strings.editor.line}
              value={editing.routeMode}
              options={ROUTE_OPTIONS}
              disabled={readOnly}
              onChange={props.onSetRouteMode}
            />
            <span className="field__label">{strings.editor.exitSide}</span>
            <Segmented
              ariaLabel={strings.editor.exitSide}
              value={editing.cardSide}
              options={SIDE_OPTIONS}
              disabled={readOnly}
              onChange={props.onSetCardSide}
            />
            {props.pathEditing ? (
              <>
                <p className="notice">{strings.editor.pathEditHint}</p>
                <Button variant="primary" full onClick={props.onExitPathEdit}>
                  {strings.editor.done}
                </Button>
              </>
            ) : (
              <div className="row">
                <Button
                  disabled={readOnly || editing.state !== 'ok'}
                  onClick={props.onEnterPathEdit}
                >
                  {strings.editor.editLine}
                </Button>
                <Button
                  disabled={readOnly || editing.route === 'auto'}
                  onClick={props.onResetRoute}
                >
                  {strings.editor.resetLine}
                </Button>
              </div>
            )}
          </div>

          {editing.widthOverride !== null && (
            <div className="row">
              <span className="text-secondary">{strings.editor.customWidth}</span>
              <Button disabled={readOnly} onClick={props.onResetWidth}>
                {strings.editor.resetWidth}
              </Button>
            </div>
          )}

          <div className="row">
            <Button disabled={editing.state === 'detached'} onClick={props.onSelectTarget}>
              {strings.editor.selectTarget}
            </Button>
            <Button disabled={readOnly} onClick={props.onDuplicate}>
              {strings.editor.duplicate}
            </Button>
            <Button variant="danger" disabled={readOnly} onClick={props.onDelete}>
              {strings.editor.delete}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
