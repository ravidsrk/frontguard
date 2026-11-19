/**
 * Loads the optional Stage 5.5 fix-generation + sandbox-verification bundle
 * from a sibling file so `dist/index.js` stays lean when `generateFixes` is off.
 */
import type * as FixStage from './fix-stage.js';

export async function loadFixStage(): Promise<typeof FixStage> {
  let dir = import.meta.url;
  for (let n = 0; n < 4; n++) {
    const slash = dir.lastIndexOf('/');
    if (slash <= 0) break;
    dir = dir.slice(0, slash);
    for (const file of ['fix-stage.js', 'sandbox/fix-stage.js', 'sandbox/fix-stage.ts']) {
      try {
        return (await import(new URL(file, `${dir}/`).href)) as typeof FixStage;
      } catch {
        // Built dist and source layouts both resolve relative to the entry.
      }
    }
  }
  throw new Error('Could not load fix-stage module');
}
