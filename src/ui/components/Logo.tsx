/**
 * The Figtations mark: an annotation card on a leader line with a dot at the
 * anchor — the product in one glyph.
 *
 * The originals live in `assets/figtations-logo-{dark,light}.svg`. The only
 * difference between them is the neutral stroke (`#ECECEF` on dark, `#333333`
 * on light), so here it is `currentColor` and one component covers both: set
 * `color` on the parent. The two accent fills are brand colours and stay fixed.
 */
interface LogoProps {
  size?: number
}

export function Logo({ size = 40 }: LogoProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="46"
        y="31"
        width="68"
        height="66"
        rx="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
      />
      <rect x="60" y="50" width="38" height="9" rx="4.5" fill="#FFDD00" />
      <rect x="60" y="69" width="24" height="9" rx="4.5" fill="#FF8A00" />
      <line
        x1="28"
        y1="64"
        x2="46"
        y2="64"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <circle cx="17" cy="64" r="11" fill="#FFDD00" />
    </svg>
  )
}
