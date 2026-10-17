/**
 * DOM element bounding-box and computed-style extraction for spatial diff attribution.
 *
 * Walks visible DOM elements in the rendered page prior to teardown so pixel
 * diff clusters can be attributed to specific CSS selectors (`[data-testid]`,
 * `#id`, `tag.class1.class2`, or `parent > tag`) and computed style properties.
 *
 * @module render/dom-elements
 */

/** Bounding box and metadata of a visible DOM element captured from the page. */
export interface DOMElementBox {
  /** Concise, grounded CSS selector for the element. */
  selector: string;
  /** Lowercase HTML/SVG tag name (e.g. `'button'`, `'div'`). */
  tagName: string;
  /** Element `id` attribute if present. */
  id?: string;
  /** Value of `data-testid` / `data-test-id` / `data-cy` if present. */
  testId?: string;
  /** Truncated visible text content preview (up to 80 chars). */
  textPreview?: string;
  /** Document-space bounding box in pixels. */
  bbox: { x: number; y: number; width: number; height: number };
  /** Key computed CSS styles for root-cause diagnosis. */
  styles?: {
    color?: string;
    backgroundColor?: string;
    fontSize?: string;
    fontWeight?: string;
    display?: string;
    visibility?: string;
    opacity?: string;
  };
}

/** A DOM element attributed to a spatial diff cluster with overlap metrics. */
export interface ClusteredDOMElement extends DOMElementBox {
  /** Intersection-over-Union (IoU) between the diff cluster and element bounding box (0–1). */
  iou: number;
  /** Fraction of the diff cluster area covered by this element (0–1). */
  coverage: number;
}

/**
 * Extracts bounding boxes, grounded CSS selectors, and computed styles for
 * visible DOM elements on a Playwright page.
 *
 * Safely guards `page.evaluate` in a `try / catch` block and validates the
 * return value so mocked Playwright pages in unit tests never fail.
 *
 * @param page        - Playwright `Page` instance (or test mock)
 * @param maxElements - Maximum number of DOM elements to extract (default: 500)
 * @returns Array of visible DOM element boxes in document coordinates
 */
export async function extractDomElementBoxes(
  page: unknown,
  maxElements = 500,
): Promise<DOMElementBox[]> {
  if (!page || typeof (page as { evaluate?: unknown }).evaluate !== 'function') {
    return [];
  }

  try {
    const evaluateFn = (page as {
      evaluate: (
        fn: (limit: number) => DOMElementBox[],
        arg: number,
      ) => Promise<unknown>;
    }).evaluate;

    const raw = await evaluateFn.call(
      page,
      (limit: number): DOMElementBox[] => {
        if (typeof document === 'undefined' || !document.querySelectorAll) {
          return [];
        }

        const SKIP_TAGS = new Set([
          'SCRIPT',
          'STYLE',
          'META',
          'LINK',
          'HEAD',
          'TITLE',
          'NOSCRIPT',
          'BR',
          'WBR',
          'TEMPLATE',
        ]);

        const scrollX = typeof window !== 'undefined' ? window.scrollX || 0 : 0;
        const scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
        const elements = document.querySelectorAll('*');
        const results: DOMElementBox[] = [];

        for (let i = 0; i < elements.length; i++) {
          if (results.length >= limit) break;
          const el = elements[i] as HTMLElement;
          if (!el || SKIP_TAGS.has(el.tagName)) continue;

          const computed =
            typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
              ? window.getComputedStyle(el)
              : null;
          if (computed) {
            if (
              computed.display === 'none' ||
              computed.visibility === 'hidden' ||
              computed.opacity === '0'
            ) {
              continue;
            }
          }

          if (typeof el.getBoundingClientRect !== 'function') continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 4 || rect.height < 4) continue;

          const tagName = el.tagName.toLowerCase();
          const testId =
            el.getAttribute('data-testid') ||
            el.getAttribute('data-test-id') ||
            el.getAttribute('data-cy') ||
            undefined;
          const rawId = el.id ? el.id.trim() : '';
          const id = rawId.length > 0 ? rawId : undefined;

          // Build a concise grounded selector
          let selector = tagName;
          if (testId) {
            selector = `[data-testid="${testId.replace(/"/g, '\\"')}"]`;
          } else if (id && /^[a-zA-Z][\w-]*$/.test(id)) {
            selector = `#${id}`;
          } else {
            const classAttr =
              typeof el.className === 'string'
                ? el.className
                : el.getAttribute('class') || '';
            const safeClasses = classAttr
              .split(/\s+/)
              .map((c) => c.trim())
              .filter((c) => c.length > 0 && /^[a-zA-Z_-][\w-]*$/.test(c))
              .slice(0, 2);

            if (safeClasses.length > 0) {
              selector = `${tagName}.${safeClasses.join('.')}`;
            } else if (el.parentElement) {
              const parent = el.parentElement;
              const parentTag = parent.tagName.toLowerCase();
              const parentId =
                parent.id && /^[a-zA-Z][\w-]*$/.test(parent.id)
                  ? `#${parent.id}`
                  : parentTag;
              selector = `${parentId} > ${tagName}`;
            }
          }

          const rawText = (el.textContent || '').replace(/\s+/g, ' ').trim();
          const textPreview =
            rawText.length > 0 ? rawText.slice(0, 80) : undefined;

          const box: DOMElementBox = {
            selector,
            tagName,
            ...(id ? { id } : {}),
            ...(testId ? { testId } : {}),
            ...(textPreview ? { textPreview } : {}),
            bbox: {
              x: Math.round(rect.left + scrollX),
              y: Math.round(rect.top + scrollY),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            ...(computed
              ? {
                  styles: {
                    color: computed.color,
                    backgroundColor: computed.backgroundColor,
                    fontSize: computed.fontSize,
                    fontWeight: computed.fontWeight,
                    display: computed.display,
                    visibility: computed.visibility,
                    opacity: computed.opacity,
                  },
                }
              : {}),
          };

          results.push(box);
        }

        return results;
      },
      maxElements,
    );

    return Array.isArray(raw) ? (raw as DOMElementBox[]) : [];
  } catch {
    return [];
  }
}
