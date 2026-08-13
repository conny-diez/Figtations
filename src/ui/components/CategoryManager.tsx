/** Category manager modal (PRD FR-4, screenshot 4). */
import { useMemo, useState } from 'react'
import { CATEGORY_HEX } from '../../shared/tokens'
import type { FigtationCategory, FigtationSummary } from '../../shared/types'
import { strings } from '../strings'
import { Button, Dot, IconButton, Input, Modal } from './primitives'
import { ColorSwatches } from './ColorSwatches'

interface Props {
  categories: FigtationCategory[]
  list: FigtationSummary[]
  onCommit: (categories: FigtationCategory[]) => void
  onDelete: (categoryId: string, reassignTo: string | null) => void
  onClose: () => void
}

interface Draft extends FigtationCategory {
  /** Row-local key so React keeps inputs stable while ids are still empty. */
  key: string
}

let keyCounter = 0

function toDrafts(categories: FigtationCategory[]): Draft[] {
  return categories.map((category) => {
    keyCounter += 1
    return { ...category, key: `${category.id}-${keyCounter}` }
  })
}

export function CategoryManager({
  categories,
  list,
  onCommit,
  onDelete,
  onClose,
}: Props): JSX.Element {
  const [drafts, setDrafts] = useState<Draft[]>(() => toDrafts(categories))
  const [openColorFor, setOpenColorFor] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Draft | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)

  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of list) {
      if (entry.categoryId === '') continue
      counts.set(entry.categoryId, (counts.get(entry.categoryId) ?? 0) + 1)
    }
    return counts
  }, [list])

  const similarLabels = useMemo(() => {
    const seen = new Map<string, number>()
    for (const draft of drafts) {
      const normalised = draft.label
        .trim()
        .toLowerCase()
        .replace(/[^a-z]/g, '')
      if (normalised === '') continue
      seen.set(normalised, (seen.get(normalised) ?? 0) + 1)
    }
    return seen
  }, [drafts])

  const update = (key: string, patch: Partial<Draft>): void => {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft))
    )
  }

  const addRow = (): void => {
    keyCounter += 1
    setDrafts((current) => [
      ...current,
      { id: '', label: '', color: 'blue', order: current.length, key: `new-${keyCounter}` },
    ])
  }

  const removeRow = (draft: Draft): void => {
    const used = usage.get(draft.id) ?? 0
    if (draft.id !== '' && used > 0) {
      setPendingDelete(draft)
      return
    }
    setDrafts((current) => current.filter((entry) => entry.key !== draft.key))
  }

  const move = (fromKey: string, toKey: string): void => {
    if (fromKey === toKey) return
    setDrafts((current) => {
      const fromIndex = current.findIndex((draft) => draft.key === fromKey)
      const toIndex = current.findIndex((draft) => draft.key === toKey)
      if (fromIndex < 0 || toIndex < 0) return current
      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      if (!moved) return current
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  if (pendingDelete) {
    const count = usage.get(pendingDelete.id) ?? 0
    const others = drafts.filter((draft) => draft.key !== pendingDelete.key && draft.id !== '')
    return (
      <Modal
        title={strings.categories.deleteInUse(count)}
        onClose={() => setPendingDelete(null)}
        footer={
          <Button variant="ghost" onClick={() => setPendingDelete(null)}>
            {strings.categories.cancel}
          </Button>
        }
      >
        <div className="stack">
          <Button
            full
            onClick={() => {
              onDelete(pendingDelete.id, null)
              setPendingDelete(null)
              onClose()
            }}
          >
            {strings.categories.removeFromThem}
          </Button>
          {others.map((other) => (
            <Button
              key={other.key}
              full
              onClick={() => {
                onDelete(pendingDelete.id, other.id)
                setPendingDelete(null)
                onClose()
              }}
            >
              {strings.categories.moveTo} {other.label}
            </Button>
          ))}
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title={strings.categories.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {strings.categories.cancel}
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              onCommit(
                drafts.map((draft, index) => ({
                  id: draft.id,
                  label: draft.label,
                  color: draft.color,
                  order: index,
                  ...(draft.nativeId ? { nativeId: draft.nativeId } : {}),
                }))
              )
            }
          >
            {strings.categories.done}
          </Button>
        </>
      }
    >
      <div className="cat-manager">
        <div className="cat-manager__toolbar">
          <IconButton label={strings.categories.add} onClick={addRow}>
            +
          </IconButton>
        </div>
        <ul className="cat-manager__rows">
          {drafts.map((draft) => {
            const normalised = draft.label
              .trim()
              .toLowerCase()
              .replace(/[^a-z]/g, '')
            const similar = (similarLabels.get(normalised) ?? 0) > 1
            return (
              <li
                key={draft.key}
                className={`cat-row${dragKey === draft.key ? ' is-dragging' : ''}`}
                draggable
                onDragStart={() => setDragKey(draft.key)}
                onDragEnd={() => setDragKey(null)}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (dragKey) move(dragKey, draft.key)
                }}
              >
                <span className="cat-row__grip" aria-hidden="true">
                  ⠿
                </span>
                <div className="cat-row__color">
                  <button
                    type="button"
                    className="cat-row__color-trigger"
                    aria-label={`Colour: ${draft.color}`}
                    onClick={() =>
                      setOpenColorFor((current) => (current === draft.key ? null : draft.key))
                    }
                  >
                    <Dot color={CATEGORY_HEX[draft.color]} />
                    <span aria-hidden="true">▾</span>
                  </button>
                  {openColorFor === draft.key && (
                    <div className="cat-row__palette">
                      <ColorSwatches
                        value={draft.color}
                        onChange={(color) => {
                          update(draft.key, { color })
                          setOpenColorFor(null)
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="cat-row__label">
                  <Input
                    value={draft.label}
                    ariaLabel={strings.categories.labelPlaceholder}
                    placeholder={strings.categories.labelPlaceholder}
                    onChange={(label) => update(draft.key, { label })}
                  />
                  {similar && <span className="hint">{strings.categories.similarName}</span>}
                </div>
                <IconButton label={`Delete ${draft.label}`} onClick={() => removeRow(draft)}>
                  −
                </IconButton>
              </li>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}
