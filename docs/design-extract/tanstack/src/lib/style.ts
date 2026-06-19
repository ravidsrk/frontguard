import type { CSSProperties } from 'react'

/**
 * Parse a plain CSS declaration string into a React style object.
 *
 *   s('background: #0d0c0b; color: #fff')  ->  { background: '#0d0c0b', color: '#fff' }
 *
 * This lets the design be authored with the exact CSS strings from the source
 * mockups instead of hand-camelCasing hundreds of style objects. Kebab-case
 * properties are converted to camelCase; custom properties (--x) are preserved.
 */
export function s(css: string): CSSProperties {
  const out: Record<string, string> = {}
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':')
    if (i === -1) continue
    const prop = decl.slice(0, i).trim()
    const value = decl.slice(i + 1).trim()
    if (!prop || !value) continue
    const key = prop.startsWith('--')
      ? prop
      : prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    out[key] = value
  }
  return out as CSSProperties
}

/** Frontguard palette — single source of truth for colors used in TS logic. */
export const C = {
  bg: '#0d0c0b',
  panel: '#131210',
  panel2: '#121110',
  panel3: '#161412',
  ink: '#f5f1ea',
  body: '#b8b0a6',
  body2: '#c8c0b6',
  body3: '#d8d0c5',
  mute: '#8c847a',
  mute2: '#7c746b',
  mute3: '#6b645c',
  mute4: '#564f48',
  line: '#211e1b',
  line2: '#2a2622',
  line3: '#322d28',
  amber: '#e8862e',
  amberHi: '#f59b45',
  green: '#4fb477',
  blue: '#5b8def',
  red: '#e5484d',
  purple: '#c678dd',
} as const
