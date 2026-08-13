/**
 * Panel theme switch (DESIGN.md §4): a pill with two 17px circles, moon for
 * dark, dot for light.
 *
 * This is the *panel's* theme. `Settings.theme` is a different thing — it is the
 * theme of the cards drawn on the canvas, which belongs to the document and is
 * shared with everyone in the file. The panel theme is one person's preference,
 * so it lives in `clientStorage`, next to the panel size.
 */
import type { PanelTheme } from '../../shared/types'
import { strings } from '../strings'

interface Props {
  value: PanelTheme
  onChange: (theme: PanelTheme) => void
}

export function ThemeSwitcher({ value, onChange }: Props): JSX.Element {
  return (
    <div className="themeswitch" role="radiogroup" aria-label={strings.theme.label}>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'dark'}
        aria-label={strings.theme.dark}
        title={strings.theme.dark}
        className={`themeswitch__side${value === 'dark' ? ' is-active' : ''}`}
        onClick={() => onChange('dark')}
      >
        <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path d="M10.2 7.6A4.6 4.6 0 0 1 4.4 1.8 4.6 4.6 0 1 0 10.2 7.6Z" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'light'}
        aria-label={strings.theme.light}
        title={strings.theme.light}
        className={`themeswitch__side${value === 'light' ? ' is-active' : ''}`}
        onClick={() => onChange('light')}
      >
        <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <circle cx="6" cy="6" r="3.4" fill="currentColor" />
        </svg>
      </button>
    </div>
  )
}
