/**
 * Loads the horizontal-overflow probe from a file that is not bundled.
 *
 * The library entry and the published bin both include this module. The probe
 * itself ships as `overflow-probe.js` next to the built entry so the 220KB
 * and 400KB ceilings still hold. A missing probe leaves the shot unreported.
 *
 * @module render/horizontal-overflow
 */

import type {
  HorizontalOverflowMeasure,
  HorizontalOverflowReport,
  ScreenshotResult,
} from '../core/types.js';

type Shot = Pick<ScreenshotResult, 'route' | 'viewport' | 'browser' | 'horizontalOverflow'>;

interface ProbeModule {
  measureHorizontalOverflow(page: unknown): Promise<HorizontalOverflowMeasure | undefined>;
  overflowReports(shots: readonly Shot[]): HorizontalOverflowReport[];
}

let probe: ProbeModule | undefined;
let loading: Promise<ProbeModule | undefined> | undefined;

async function loadProbe(): Promise<ProbeModule | undefined> {
  if (probe) return probe;
  if (loading) return loading;
  loading = (async () => {
    let dir = import.meta.url;
    for (let depth = 0; depth < 4 && !probe; depth++) {
      const slash = dir.lastIndexOf('/');
      if (slash <= 0) break;
      dir = dir.slice(0, slash);
      try {
        probe = (await import(new URL('overflow-probe.js', `${dir}/`).href)) as ProbeModule;
      } catch {
        // Not in this directory. The bin lives one level down from the file.
      }
    }
    return probe;
  })();
  return loading;
}

/**
 * Measure horizontal overflow on a Playwright page. Returns undefined when
 * the page cannot be evaluated. A failure here must not fail the screenshot.
 */
export async function measureHorizontalOverflow(
  page: unknown,
): Promise<HorizontalOverflowMeasure | undefined> {
  const api = await loadProbe();
  return api?.measureHorizontalOverflow(page);
}

/** Report rows for shots that scroll horizontally or have a visible protrusion. */
export async function overflowReports(shots: readonly Shot[]): Promise<HorizontalOverflowReport[]> {
  const api = await loadProbe();
  return api ? api.overflowReports(shots) : [];
}
