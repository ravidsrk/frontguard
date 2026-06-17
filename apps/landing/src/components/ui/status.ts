/** The terminal language: status keys, their glyphs, and color classes. */
export type Status = 'pass' | 'warning' | 'regression' | 'new';

export const STATUS_GLYPH: Record<Status, string> = {
  pass: '✓',
  warning: '⚠',
  regression: '✘',
  new: '★',
};

export const STATUS_COLOR_CLASS: Record<Status, string> = {
  pass: 'text-pass',
  warning: 'text-warning',
  regression: 'text-regression',
  new: 'text-new',
};
