/*
  Static content for the /brand styleguide. Kept beside the page so the swatch
  tables stay a single source of truth: each neutral/status swatch carries both
  the foundation token (its Tailwind `bg-*` utility) and the documented hex, so
  the page is literally driven by the @theme tokens in index.css and a test can
  assert the two never drift apart.
*/
import type { Status } from '../../components/ui/status';

export interface NeutralSwatch {
  /** Foundation token name, shown as the swatch caption. */
  token: string;
  /** Tailwind utility that paints the swatch from the @theme token. */
  bgClass: string;
  /** Documented hex, shown as text (swatches are never color-only — a11y). */
  hex: string;
}

/** "CANVAS & INK — warm neutrals": the six core surface/ink tokens. */
export const NEUTRALS: NeutralSwatch[] = [
  { token: 'canvas', bgClass: 'bg-canvas', hex: '#0d0c0b' },
  { token: 'panel', bgClass: 'bg-panel', hex: '#131210' },
  { token: 'raised', bgClass: 'bg-raised', hex: '#1f1c19' },
  { token: 'border', bgClass: 'bg-border', hex: '#322d28' },
  { token: 'ink-mid', bgClass: 'bg-ink-mid', hex: '#b8b0a6' },
  { token: 'ink-hi', bgClass: 'bg-ink-hi', hex: '#f5f1ea' },
];

export interface StatusSwatch {
  status: Status;
  label: string;
  hex: string;
}

/** "STATUS PALETTE — the terminal language": the four CLI-borrowed statuses. */
export const STATUSES: StatusSwatch[] = [
  { status: 'pass', label: 'pass', hex: '#4fb477' },
  { status: 'warning', label: 'warning', hex: '#e8862e' },
  { status: 'regression', label: 'regression', hex: '#e5484d' },
  { status: 'new', label: 'new', hex: '#5b8def' },
];

export interface VoicePrinciple {
  key: string;
  /** Token color class for the label (pass / amber / new). */
  colorClass: string;
  body: string;
}

/** 04 / VOICE — the three principles. */
export const VOICE: VoicePrinciple[] = [
  {
    key: 'HONEST',
    colorClass: 'text-pass',
    body: "Lead with the real problem — false positives and flake. Skeptical engineers smell hype. Don't oversell.",
  },
  {
    key: 'PRECISE',
    colorClass: 'text-amber',
    body: 'Specifics over adjectives. "Restore flex-direction: column at <768px" beats "fixes your layout."',
  },
  {
    key: 'LOWERCASE',
    colorClass: 'text-new',
    body: 'The wordmark and commands stay lowercase, like the CLI. Terminal-native, never shouty.',
  },
];

/** 05 / MESSAGING — what to say. */
export const SAY: string[] = [
  'Name the real problem: false positives, flake, muted channels.',
  'Quote the classifier: "intentional change, not a regression."',
  'Lead with BYOK, MIT, and self-hostable — earn trust with facts.',
  'Publish real numbers, including where it gets things wrong.',
];

/** 05 / MESSAGING — what not to say. */
export const DONT: string[] = [
  'Promise "zero false positives" or "100% accuracy."',
  'Call it magic, autonomous, or a silver bullet.',
  'Bury that AI is optional and runs on your own key.',
  'Shout in title case or pile on exclamation marks.',
];

export interface TypeScaleRow {
  /** Mono label, e.g. "DISPLAY / 52". */
  label: string;
  sample: string;
  /** Specimen styling for the sample (font/size/weight/tracking). */
  sampleClass: string;
}

/** 03 / TYPOGRAPHY — the named scale specimens. */
export const TYPE_SCALE: TypeScaleRow[] = [
  {
    label: 'DISPLAY / 52',
    sample: 'Ship with confidence',
    sampleClass: 'font-sans font-bold text-[clamp(1.75rem,5vw,2.375rem)] text-ink-hi tracking-[-0.035em]',
  },
  {
    label: 'HEADING / 38',
    sample: 'Detect, understand, fix',
    sampleClass: 'font-sans font-semibold text-[clamp(1.375rem,4vw,1.6875rem)] text-ink-hi tracking-[-0.02em]',
  },
  {
    label: 'BODY / 16',
    sample: 'Renders every page and explains what changed and why.',
    sampleClass: 'font-sans text-[16px] text-ink-mid',
  },
  {
    label: 'MONO / 13',
    sample: '$ npx frontguard run --url localhost:3000',
    sampleClass: 'font-mono text-[13px] text-amber',
  },
];
