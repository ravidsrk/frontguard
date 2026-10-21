/**
 * Horizontal overflow measurement, loaded at runtime so it stays out of the
 * published bundles. The ceilings are 220KB for the library entry and 400KB
 * for the bin. A row is flagged only when a visible border box passes the
 * right edge and no ancestor clips that protrusion.
 */

function pageProbe() {
  const width = window.innerWidth || 0;
  const root = document.documentElement;
  const body = document.body;
  // `overflow-y: auto` on body makes the body the horizontal scroller, so the
  // document element's scrollWidth can stay at the viewport.
  const scrollWidth = Math.max(root ? root.scrollWidth || 0 : 0, body ? body.scrollWidth || 0 : 0);
  const elements = [];
  const nodes = document.querySelectorAll('body, body *');

  for (let i = 0; i < nodes.length && elements.length < 20; i++) {
    const el = nodes[i];
    if (!el || el === root || !shown(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const overflowPx = Math.round(rect.right - width);
    if (overflowPx < 1 || clipped(el, rect)) continue;
    elements.push({ selector: selectorFor(el), overflowPx });
  }

  return { innerWidth: width, scrollWidth, elements };

  function shown(el) {
    let node = el;
    while (node) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false;
      }
      node = node.parentElement;
    }
    return true;
  }

  function clipped(el, rect) {
    let node = el.parentElement;
    const body = document.body;
    while (node) {
      const overflowX = getComputedStyle(node).overflowX;
      const internal = node !== body && node !== root;
      const clips =
        overflowX === 'hidden' ||
        overflowX === 'clip' ||
        ((overflowX === 'scroll' || overflowX === 'auto') && internal);
      if (clips && rect.right > node.getBoundingClientRect().right + 1) return true;
      node = node.parentElement;
    }
    return false;
  }

  function selectorFor(el) {
    const testId = el.getAttribute('data-testid');
    if (testId) return `[data-testid="${testId.replace(/"/g, '')}"]`;
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return `#${el.id}`;
    return el.tagName.toLowerCase();
  }
}

export async function measureHorizontalOverflow(page) {
  const evaluate = page && page.evaluate;
  if (typeof evaluate !== 'function') return undefined;

  try {
    const raw = await evaluate.call(page, pageProbe);
    if (!raw || typeof raw !== 'object') return undefined;
    const innerWidth = Number(raw.innerWidth);
    const scrollWidth = Number(raw.scrollWidth);
    if (!Number.isFinite(innerWidth) || !Number.isFinite(scrollWidth)) return undefined;
    const elements = Array.isArray(raw.elements)
      ? raw.elements.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const selector = item.selector;
          const overflowPx = Number(item.overflowPx);
          if (typeof selector !== 'string' || !Number.isFinite(overflowPx)) return [];
          return [{ selector, overflowPx }];
        })
      : [];
    return { innerWidth, scrollWidth, elements };
  } catch {
    return undefined;
  }
}

export function overflowReports(shots) {
  const rows = [];
  for (const shot of shots) {
    const measured = shot.horizontalOverflow;
    if (!measured) continue;
    const flagged = measured.elements.length > 0;
    if (!flagged && measured.scrollWidth <= measured.innerWidth) continue;
    rows.push({
      route: shot.route.path,
      viewport: shot.viewport,
      browser: shot.browser,
      innerWidth: measured.innerWidth,
      scrollWidth: measured.scrollWidth,
      flagged,
      elements: measured.elements,
    });
  }
  return rows;
}
