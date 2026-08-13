/**
 * The Figtations mark (DESIGN.md §5): a bracket with two bands — the annotation
 * and its target, in one glyph.
 *
 * The originals live in `assets/figtations-mark-{dark,light,mono}.svg`. Dark and
 * light differ only in the bracket and the second band, so here the bracket is
 * `currentColor` and the cold band is `--tone-700`; both follow the theme with
 * no second copy of the geometry.
 *
 * The bright band is the one accent the mark is allowed (DESIGN.md rule 1 grants
 * the logo exactly one).
 *
 * At 24px and below the design calls for its own drawing rather than a scaled
 * one: stroke 6 instead of 4, tighter bands, a cropped viewBox. Hairlines that
 * thin do not survive the pixel grid.
 */
interface LogoProps {
  size?: number
}

/** Below this the small-size drawing takes over (DESIGN.md §5). */
const SMALL_SIZE_LIMIT = 24

export function Logo({ size = 16 }: LogoProps): JSX.Element {
  const small = size <= SMALL_SIZE_LIMIT
  return (
    <svg
      width={size}
      height={size}
      viewBox={small ? '7 9 49 46' : '0 0 64 64'}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="currentColor" strokeWidth={small ? 6 : 4} strokeLinecap="round">
        <line x1="12" y1="14" x2="12" y2="50" />
        <line x1="12" y1="14" x2="20" y2="14" />
        <line x1="12" y1="50" x2="20" y2="50" />
      </g>
      {small ? (
        <>
          <rect x="31" y="21" width="23" height="7" rx="3.5" fill="var(--cta)" />
          <rect x="31" y="36" width="14" height="7" rx="3.5" fill="var(--tone-700)" />
        </>
      ) : (
        <>
          <rect x="30" y="22" width="24" height="6" rx="3" fill="var(--cta)" />
          <rect x="30" y="36" width="15" height="6" rx="3" fill="var(--tone-700)" />
        </>
      )}
    </svg>
  )
}
