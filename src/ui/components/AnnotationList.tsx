/** Tab "All": search, filters, bulk actions, orphan states (PRD FR-7). */
import { useMemo, useState } from 'react'
import { CATEGORY_HEX } from '../../shared/tokens'
import type { FigtationCategory, FigtationSummary } from '../../shared/types'
import { strings } from '../strings'
import { Button, Dot, Input, Segmented } from './primitives'

type Sort = 'canvas' | 'category'

interface Props {
  list: FigtationSummary[]
  categories: FigtationCategory[]
  readOnly: boolean
  onSelect: (id: string, zoom: boolean) => void
  onEdit: (id: string) => void
  onSelectTarget: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (ids: string[]) => void
  onReattach: (id: string) => void
  onKeepAsFreeNote: (id: string) => void
  onSetCategory: (ids: string[], categoryId: string) => void
  onArrangeSelection: (ids: string[]) => void
}

export function AnnotationList(props: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [activeCategories, setActiveCategories] = useState<string[]>([])
  const [orphansOnly, setOrphansOnly] = useState(false)
  const [sort, setSort] = useState<Sort>('canvas')
  const [selected, setSelected] = useState<string[]>([])

  const categoryById = useMemo(
    () => new Map(props.categories.map((category) => [category.id, category])),
    [props.categories]
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const categorySet = new Set(activeCategories)
    const result = props.list.filter((entry) => {
      if (orphansOnly && entry.state !== 'detached' && entry.state !== 'off-page') return false
      if (categorySet.size > 0 && !categorySet.has(entry.categoryId)) return false
      if (needle === '') return true
      return (
        entry.label.toLowerCase().includes(needle) ||
        entry.targetName.toLowerCase().includes(needle)
      )
    })
    if (sort === 'category') {
      return [...result].sort((a, b) => {
        const orderA = categoryById.get(a.categoryId)?.order ?? 999
        const orderB = categoryById.get(b.categoryId)?.order ?? 999
        return orderA - orderB || a.y - b.y
      })
    }
    return result
  }, [props.list, query, activeCategories, orphansOnly, sort, categoryById])

  const toggleCategory = (id: string): void => {
    setActiveCategories((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    )
  }

  const toggleSelected = (id: string): void => {
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    )
  }

  return (
    <div className="list">
      <Input
        value={query}
        onChange={setQuery}
        ariaLabel={strings.list.search}
        placeholder={strings.list.search}
      />

      <div className="chips">
        {props.categories.map((category) => (
          <button
            key={category.id}
            type="button"
            aria-pressed={activeCategories.includes(category.id)}
            className={`chip${activeCategories.includes(category.id) ? ' is-active' : ''}`}
            onClick={() => toggleCategory(category.id)}
          >
            <Dot color={CATEGORY_HEX[category.color]} />
            {category.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={orphansOnly}
          className={`chip${orphansOnly ? ' is-active' : ''}`}
          onClick={() => setOrphansOnly((value) => !value)}
        >
          {strings.list.orphans}
        </button>
      </div>

      <Segmented
        ariaLabel="Sort order"
        value={sort}
        options={[
          { value: 'canvas', label: strings.list.sortCanvas },
          { value: 'category', label: strings.list.sortCategory },
        ]}
        onChange={setSort}
      />

      {selected.length > 1 && (
        <div className="bulk-bar">
          <select
            aria-label={strings.list.setCategory}
            className="input"
            defaultValue=""
            onChange={(event) => {
              props.onSetCategory(selected, event.target.value)
            }}
          >
            <option value="">{strings.editor.noCategory}</option>
            {props.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
          <Button disabled={props.readOnly} onClick={() => props.onArrangeSelection(selected)}>
            {strings.list.arrangeSelected}
          </Button>
          <Button
            variant="danger"
            disabled={props.readOnly}
            onClick={() => {
              props.onDelete(selected)
              setSelected([])
            }}
          >
            {strings.list.deleteSelected}
          </Button>
        </div>
      )}

      {props.list.length === 0 ? (
        <p className="empty">{strings.list.empty}</p>
      ) : filtered.length === 0 ? (
        <p className="empty">{strings.list.noMatches}</p>
      ) : (
        <ul className="list__rows">
          {filtered.map((entry) => {
            const category = categoryById.get(entry.categoryId) ?? null
            const isSelected = selected.includes(entry.id)
            return (
              <li
                key={entry.id}
                className={`list-row${isSelected ? ' is-selected' : ''}${
                  entry.state === 'detached' ? ' is-detached' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  aria-label={`Select ${entry.label || entry.targetName}`}
                  onChange={() => toggleSelected(entry.id)}
                />
                <button
                  type="button"
                  className="list-row__main"
                  onClick={() => props.onSelect(entry.id, false)}
                  onDoubleClick={() => props.onSelect(entry.id, true)}
                >
                  {category && <Dot color={CATEGORY_HEX[category.color]} />}
                  <span className="list-row__label">{entry.label || '—'}</span>
                  <span className="list-row__meta">
                    {entry.state === 'detached'
                      ? strings.list.detached
                      : entry.state === 'off-page'
                        ? `${strings.list.offPage} · ${entry.pageName ?? ''}`
                        : entry.state === 'free'
                          ? strings.list.freeNote
                          : entry.targetName}
                    {' · '}
                    {strings.list.props(entry.propCount)}
                  </span>
                </button>
                <span className="list-row__actions">
                  <Button variant="ghost" onClick={() => props.onEdit(entry.id)}>
                    Edit
                  </Button>
                  {entry.state === 'detached' ? (
                    <>
                      <Button
                        variant="ghost"
                        disabled={props.readOnly}
                        onClick={() => props.onReattach(entry.id)}
                      >
                        {strings.list.reattach}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={props.readOnly}
                        onClick={() => props.onKeepAsFreeNote(entry.id)}
                      >
                        {strings.list.keepAsFreeNote}
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" onClick={() => props.onSelectTarget(entry.id)}>
                      {strings.editor.selectTarget}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    disabled={props.readOnly}
                    onClick={() => props.onDuplicate(entry.id)}
                  >
                    {strings.editor.duplicate}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={props.readOnly}
                    onClick={() => props.onDelete([entry.id])}
                  >
                    {strings.editor.delete}
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
