import type { TextSnapshotDiff, TextSnapshotKind } from './types.js';

/** One trailing newline and CRLF do not count as a text change. */
export function normalizeTextSnapshot(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n$/, '');
}

export function diffTextSnapshot(baseline: string | null, current: string): TextSnapshotDiff['status'] {
  if (baseline === null) return 'new';
  return normalizeTextSnapshot(baseline) === normalizeTextSnapshot(current) ? 'match' : 'mismatch';
}

function clipText(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 77)}...` : flat;
}

export function recordTextSnapshots(
  storage: {
    textPath(key: string, ext: string): string;
    readText(key: string, ext: string): string | null;
    writeText(key: string, ext: string, text: string): void;
  },
  key: string,
  items: Array<{ kind: TextSnapshotKind; ext: string; body: string }>,
  write: boolean,
): TextSnapshotDiff[] {
  return items.map((item) => {
    const path = storage.textPath(key, item.ext);
    const body = normalizeTextSnapshot(item.body);
    if (write) {
      storage.writeText(key, item.ext, body);
      return { kind: item.kind, status: 'new', path };
    }
    const previous = storage.readText(key, item.ext);
    if (previous === null) return { kind: item.kind, status: 'new', path };
    if (previous === body) return { kind: item.kind, status: 'match', path };
    return {
      kind: item.kind,
      status: 'mismatch',
      path,
      excerpt: `was ${clipText(previous)} now ${clipText(body)}`,
    };
  });
}
