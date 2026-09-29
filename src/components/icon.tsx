import type { CSSProperties } from 'react';

/**
 * Renders one of the Figma-exported SVGs from /public/icons.
 * The SVG is used as a CSS mask, so it takes on the surrounding text colour
 * (currentColor) — one file serves both the active (white) and inactive (grey) states.
 */
export function Icon({
  name,
  size = 18,
  className = '',
}: {
  /** file name without ".svg", e.g. "icon-26" */
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`icon ${className}`}
      style={
        {
          width: size,
          height: size,
          '--icon': `url(/icons/${name}.svg)`,
        } as CSSProperties
      }
    />
  );
}

/** Map of icon names → exported files in public/icons (taken from the Figma frames). */
export const icons = {
  register: 'icon-26',
  checkIn: 'icon-45',
  programme: 'icon-7',
  partners: 'icon-91',
  attendance: 'icon-9',
  chevronDown: 'icon-4',
  star: 'icon-54',
  pin: 'icon-55',
  pinSmall: 'icon-56',
  sessionChevron: 'margin-3',
  emptyAttendance: 'icon-43',
  goToScanner: 'icon-44',
} as const;
