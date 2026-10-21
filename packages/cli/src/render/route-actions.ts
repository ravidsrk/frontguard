/**
 * Declarative pre-capture interactions shared by screenshot capture and the
 * accessibility audit, so both see the same page state.
 *
 * @module render/route-actions
 */

import type { Page } from 'playwright';
import type { RouteAction } from '../core/types.js';

/**
 * Executes declarative pre-capture interaction steps on a Playwright page.
 */
export async function executeRouteActions(
  page: Page,
  actions: RouteAction[],
  timeoutMs: number,
): Promise<void> {
  for (const action of actions) {
    switch (action.type) {
      case 'click':
        await page.click(action.selector, { timeout: timeoutMs });
        break;
      case 'hover':
        await page.hover(action.selector, { timeout: timeoutMs });
        break;
      case 'fill':
        await page.fill(action.selector, action.value, { timeout: timeoutMs });
        break;
      case 'press':
        if (action.selector) {
          await page.press(action.selector, action.key, { timeout: timeoutMs });
        } else {
          await page.keyboard.press(action.key);
        }
        break;
      case 'waitForSelector':
        await page.waitForSelector(action.selector, {
          state: action.state ?? 'visible',
          timeout: timeoutMs,
        });
        break;
      case 'wait': {
        const clampedMs = Math.min(Math.max(0, action.ms), 30_000);
        if (typeof page.waitForTimeout === 'function') {
          await page.waitForTimeout(clampedMs);
        } else {
          await new Promise((r) => setTimeout(r, clampedMs));
        }
        break;
      }
    }
  }
}
