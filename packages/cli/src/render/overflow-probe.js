/**
 * Horizontal overflow measurement, loaded at runtime so it stays out of the
 * published bundles. The ceilings are 220KB for the library entry and 400KB
 * for the bin. A row is flagged only when a visible border box passes the
 * right edge and no ancestor that contains the element clips that protrusion.
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
    // Visibility is this element's computed value. A `visibility: visible`
    // child of a hidden parent is visible. Opacity and display hide descendants.
    const own = getComputedStyle(el);
    if (own.visibility === 'hidden' || own.visibility === 'collapse') return false;
    let node = el;
    while (node) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || Number(style.opacity) === 0) return false;
      node = node.parentElement;
    }
    return true;
  }

  function clipped(el, rect) {
    const position = getComputedStyle(el).position;
    // In-flow boxes are clipped by ancestor overflow. Absolute and fixed boxes
    // escape it until an ancestor is their containing block; a later overflow
    // still clips. The contained flag is set before the overflow test so a
    // containing block that itself overflows does clip.
    let contained = position !== 'absolute' && position !== 'fixed';
    let node = el.parentElement;
    const body = document.body;
    while (node) {
      const style = getComputedStyle(node);
      if (!contained) {
        contained = position === 'fixed' ? holdsFixed(style) : style.position !== 'static' || holdsFixed(style);
      }
      if (contained) {
        const overflowX = style.overflowX;
        const internal = node !== body && node !== root;
        const clips =
          overflowX === 'hidden' ||
          overflowX === 'clip' ||
          ((overflowX === 'scroll' || overflowX === 'auto') && internal);
        // `contain: paint` clips to the padding edge while overflow-x stays visible.
        // `content` and `strict` include paint. `layout` does not clip.
        const paints = listed(style.contain, ['paint', 'strict', 'content']);
        if ((clips || paints) && rect.right > node.getBoundingClientRect().right + 1) return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function holdsFixed(style) {
    if (style.transform !== 'none' || style.filter !== 'none') return true;
    // `translate`, `rotate`, and `scale` contain fixed boxes even when the
    // computed `transform` stays `none`.
    if (style.translate && style.translate !== 'none') return true;
    if (style.rotate && style.rotate !== 'none') return true;
    if (style.scale && style.scale !== 'none') return true;
    const backdrop = style.backdropFilter || style.webkitBackdropFilter;
    if (backdrop && backdrop !== 'none') return true;
    if (style.perspective && style.perspective !== 'none') return true;
    if (listed(style.contain, ['paint', 'layout', 'strict', 'content'])) return true;
    if (listed(style.willChange, ['transform', 'translate', 'rotate', 'scale', 'filter', 'perspective', 'contain'])) return true;
    return Boolean(style.containerType && style.containerType !== 'normal');
  }

  function listed(value, names) {
    if (!value || value === 'none' || value === 'auto') return false;
    const parts = value.split(/[,\s]+/);
    for (let i = 0; i < parts.length; i++) {
      if (names.indexOf(parts[i]) !== -1) return true;
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
