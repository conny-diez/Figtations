/** Searchable property picker (PRD FR-1 #3, FR-3). */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProbedProperty, PropertyType } from '../../shared/types'
import { strings } from '../strings'
import { IconButton, Input } from './primitives'

interface Props {
  probed: ProbedProperty[]
  selected: PropertyType[]
  onAdd: (type: PropertyType) => void
  onClose: () => void
}

export function PropertyPicker({ probed, selected, onAdd, onClose }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const containerRef = useRef<HTMLDivElement>(null)

  // A click outside or Escape closes it. Without this the picker could only be
  // dismissed by picking something, which made it feel stuck.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return probed
      .filter((entry) => entry.available)
      .filter(
        (entry) =>
          needle === '' ||
          entry.key.toLowerCase().includes(needle) ||
          entry.type.toLowerCase().includes(needle)
      )
  }, [probed, query])

  return (
    <div className="picker" ref={containerRef}>
      <div className="picker__head">
        <Input
          value={query}
          onChange={setQuery}
          ariaLabel={strings.editor.propertySearch}
          placeholder={strings.editor.propertySearch}
          autoFocus
        />
        <IconButton label={strings.editor.closePicker} onClick={onClose}>
          ×
        </IconButton>
      </div>
      {matches.length === 0 ? (
        <p className="empty">{strings.editor.noProperties}</p>
      ) : (
        <ul className="picker__list">
          {matches.map((entry) => {
            const already = selectedSet.has(entry.type)
            return (
              <li key={entry.type}>
                <button
                  type="button"
                  className="picker__item"
                  disabled={already}
                  aria-disabled={already}
                  onClick={() => {
                    onAdd(entry.type)
                    onClose()
                  }}
                >
                  <span>{entry.key}</span>
                  <span className="picker__value">{entry.value}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
