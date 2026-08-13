/** The eight-colour palette (PRD FR-4, screenshot 3). */
import { CATEGORY_HEX } from '../../shared/tokens'
import { CATEGORY_COLORS, type CategoryColor } from '../../shared/types'

interface Props {
  value: CategoryColor
  onChange: (color: CategoryColor) => void
  disabled?: boolean
}

export function ColorSwatches({ value, onChange, disabled }: Props): JSX.Element {
  return (
    <div className="swatches" role="radiogroup" aria-label="Category colour">
      {CATEGORY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={color === value}
          aria-label={color}
          title={color}
          disabled={disabled}
          className={`swatch${color === value ? ' is-active' : ''}`}
          style={{ backgroundColor: CATEGORY_HEX[color] }}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  )
}
