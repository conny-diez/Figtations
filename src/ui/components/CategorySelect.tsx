/** Category dropdown (PRD FR-4, screenshot 5). */
import { useEffect, useRef, useState } from 'react'
import { CATEGORY_HEX } from '../../shared/tokens'
import type { FigtationCategory } from '../../shared/types'
import { strings } from '../strings'
import { Dot } from './primitives'

interface Props {
  categories: FigtationCategory[]
  value: string
  onChange: (categoryId: string) => void
  onEditCategories: () => void
  disabled?: boolean
}

export function CategorySelect({
  categories,
  value,
  onChange,
  onEditCategories,
  disabled,
}: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [focusIndex, setFocusIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const options = [{ id: '', label: strings.editor.noCategory }, ...categories]
  const selected = categories.find((category) => category.id === value) ?? null

  useEffect(() => {
    if (!open) return
    const onDocumentClick = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [open])

  const commit = (id: string): void => {
    onChange(id)
    setOpen(false)
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (!open) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setFocusIndex((index) => Math.min(options.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setFocusIndex((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = options[focusIndex]
      if (option) commit(option.id)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="select" ref={containerRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value_) => !value_)}
      >
        {selected ? (
          <>
            <Dot color={CATEGORY_HEX[selected.color]} />
            <span>{selected.label}</span>
          </>
        ) : (
          <span className="text-secondary">{strings.editor.noCategory}</span>
        )}
        <span className="select__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <ul className="select__menu" role="listbox" aria-label={strings.editor.category}>
          {options.map((option, index) => {
            const category = 'color' in option ? option : null
            return (
              <li key={option.id === '' ? '__none' : option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.id === value}
                  className={`select__option${index === focusIndex ? ' is-focused' : ''}`}
                  onMouseEnter={() => setFocusIndex(index)}
                  onClick={() => commit(option.id)}
                >
                  <span className="select__check" aria-hidden="true">
                    {option.id === value ? '✓' : ''}
                  </span>
                  {category && <Dot color={CATEGORY_HEX[category.color]} />}
                  <span>{option.label}</span>
                </button>
              </li>
            )
          })}
          <li className="select__footer">
            <button
              type="button"
              className="select__option"
              onClick={() => {
                setOpen(false)
                onEditCategories()
              }}
            >
              {strings.editor.editCategories}
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
