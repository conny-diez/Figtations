/** Panel primitives (PRD §8). Plain CSS, no framework dependency. */
import { useEffect, useRef, type ReactNode } from 'react'
import { clampPanelSize } from '../../../shared/types'

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  /**
   * `primary` is the yellow CTA. DESIGN.md rule 1 allows exactly one per visible
   * surface — a modal counts as its own surface, the panel behind it does not.
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'dashed'
  disabled?: boolean
  title?: string
  ariaLabel?: string
  type?: 'button' | 'submit'
  full?: boolean
  /** Icon-only button: a fixed square instead of label-driven width. */
  square?: boolean
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled = false,
  title,
  ariaLabel,
  type = 'button',
  full = false,
  square = false,
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={`btn btn--${variant}${full ? ' btn--full' : ''}${square ? ' btn--square' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  )
}

interface IconButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  /** `danger` turns the hover state red — used for destructive row actions. */
  tone?: 'default' | 'danger'
  children: ReactNode
}

export function IconButton({
  label,
  onClick,
  disabled,
  tone = 'default',
  children,
}: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={`icon-btn${tone === 'danger' ? ' icon-btn--danger' : ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

interface InputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  ariaLabel: string
  onBlur?: () => void
  autoFocus?: boolean
}

export function Input({
  value,
  onChange,
  placeholder,
  disabled,
  ariaLabel,
  onBlur,
  autoFocus,
}: InputProps): JSX.Element {
  return (
    <input
      className="input"
      type="text"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      autoFocus={autoFocus}
    />
  )
}

interface TextareaProps {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  /** Fired on Cmd/Ctrl+Enter. Plain Enter stays a newline — labels are multi-line. */
  onSubmit?: () => void
  placeholder?: string
  disabled?: boolean
  ariaLabel: string
  rows?: number
}

export function Textarea({
  value,
  onChange,
  onBlur,
  onSubmit,
  placeholder,
  disabled,
  ariaLabel,
  rows = 3,
}: TextareaProps): JSX.Element {
  return (
    <textarea
      className="textarea"
      value={value}
      rows={rows}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      onKeyDown={(event) => {
        if (!onSubmit) return
        if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
        event.preventDefault()
        onSubmit()
      }}
    />
  )
}

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}

/**
 * 32×18 switch (DESIGN.md §4). The native checkbox stays in the markup and only
 * loses its paint: it keeps the label association, the focus behaviour and the
 * screen-reader semantics that a div would have to re-implement.
 */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps): JSX.Element {
  return (
    <label className="toggle">
      <span className="toggle__label">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__knob" />
      </span>
    </label>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  ariaLabel: string
  disabled?: boolean
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
}: SegmentedProps<T>): JSX.Element {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={`segmented__item${option.value === value ? ' is-active' : ''}`}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  label: string
  disabled?: boolean
}

/** DESIGN.md §4: 20 bars, filled ones grow with the index. */
const SLIDER_STEPS = 20

/**
 * Stepped slider (DESIGN.md §4). The bars are the picture; the native range sits
 * on top at zero opacity and keeps the dragging, the arrow keys and the
 * announced value. Painting bars on top of a real input is the only way to get
 * both — a range element cannot be styled into 20 separate marks.
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  disabled,
}: SliderProps): JSX.Element {
  const span = max - min
  const filled = span <= 0 ? 0 : Math.round(((value - min) / span) * SLIDER_STEPS)

  return (
    <div className={`slider${disabled ? ' slider--disabled' : ''}`}>
      <div className="slider__head">
        <span className="field__label">{label}</span>
        <span className="slider__value">{value}</span>
      </div>
      <div className="slider__track">
        {Array.from({ length: SLIDER_STEPS }, (_, index) => (
          <span
            key={index}
            className={`slider__bar${index < filled ? ' is-filled' : ''}`}
            style={index < filled ? { height: `${6 + index * 0.6}px` } : undefined}
          />
        ))}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    </div>
  )
}

/**
 * Procedural hint (DESIGN.md §4 footer, rule 8): an `i` circle and 10px text in
 * `text/low`. Never coloured — a hint is not a warning.
 */
export function HintRow({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p className="hint-row">
      <span className="hint-row__icon" aria-hidden="true">
        i
      </span>
      <span>{children}</span>
    </p>
  )
}

interface PillProps {
  color: string
  children: ReactNode
}

export function Pill({ color, children }: PillProps): JSX.Element {
  return (
    <span className="pill" style={{ backgroundColor: color }}>
      {children}
    </span>
  )
}

export function Dot({ color }: { color: string }): JSX.Element {
  return <span className="dot" style={{ backgroundColor: color }} aria-hidden="true" />
}

interface ModalProps {
  title: string
  children: ReactNode
  footer: ReactNode
  onClose: () => void
}

export function Modal({ title, children, footer, onClose }: ModalProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <header className="modal__header">
          <h2>{title}</h2>
        </header>
        <div className="modal__body">{children}</div>
        <footer className="modal__footer">{footer}</footer>
      </div>
    </div>
  )
}

interface ResizeHandleProps {
  onResize: (width: number, height: number, persist: boolean) => void
  label: string
}

/**
 * Bottom-right grip that resizes the plugin window (PRD FR-7). Figma windows are
 * not natively resizable — a plugin has to drag its own corner and call
 * `figma.ui.resize`.
 */
export function ResizeHandle({ onResize, label }: ResizeHandleProps): JSX.Element {
  const drag = useRef<{ width: number; height: number; frame: number | null } | null>(null)

  const flush = (persist: boolean): void => {
    const current = drag.current
    if (!current) return
    const { width, height } = clampPanelSize(current.width, current.height)
    onResize(width, height, persist)
  }

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-label={label}
      title={label}
      onPointerDown={(event) => {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { width: window.innerWidth, height: window.innerHeight, frame: null }
      }}
      onPointerMove={(event) => {
        const current = drag.current
        if (!current) return
        // Deltas, not absolute coordinates: the iframe resizes underneath the
        // pointer while dragging, which moves the coordinate origin with it.
        const next = clampPanelSize(
          current.width + event.movementX,
          current.height + event.movementY
        )
        current.width = next.width
        current.height = next.height
        if (current.frame !== null) return
        current.frame = window.requestAnimationFrame(() => {
          current.frame = null
          flush(false)
        })
      }}
      onPointerUp={(event) => {
        const current = drag.current
        if (!current) return
        if (current.frame !== null) window.cancelAnimationFrame(current.frame)
        event.currentTarget.releasePointerCapture(event.pointerId)
        flush(true)
        drag.current = null
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path d="M11 5 L5 11 M11 9 L9 11" stroke="currentColor" strokeWidth="1" fill="none" />
      </svg>
    </div>
  )
}

export interface ToastMessage {
  id: number
  level: 'info' | 'warn' | 'error'
  message: string
}

export function Toasts({ items }: { items: ToastMessage[] }): JSX.Element {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast toast--${item.level}`}>
          {item.message}
        </div>
      ))}
    </div>
  )
}
