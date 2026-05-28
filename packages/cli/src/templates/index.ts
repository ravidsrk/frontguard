/**
 * Framework templates for `frontguard init`.
 *
 * Each template carries the metadata needed to generate a sensible starter
 * config: the default dev-server port, the typical dev command, and a set of
 * routes that are likely to exist in a fresh project of that framework.
 *
 * @module templates
 */

/** Rich metadata describing a detected framework. */
export interface FrameworkInfo {
  /** Canonical framework name (e.g. `'Next.js'`). */
  name: string;
  /** Default dev-server port. */
  defaultPort: number;
  /** Command that starts the dev server. */
  devCommand: string;
  /** Routes commonly present in a fresh project. */
  typicalRoutes: string[];
  /** Whether routes are conventionally auto-discoverable (file-system routing). */
  fileSystemRouting: boolean;
  /** One-line note rendered as a comment in the generated config. */
  note: string;
}

/**
 * Framework metadata keyed by the canonical framework name returned by
 * {@link detectFramework}. The `generic` entry is the fallback.
 */
export const FRAMEWORK_TEMPLATES: Record<string, FrameworkInfo> = {
  'Next.js': {
    name: 'Next.js',
    defaultPort: 3000,
    devCommand: 'next dev',
    typicalRoutes: ['/', '/about'],
    fileSystemRouting: true,
    note: 'Next.js — routes are file-system based (pages/ or app/). Use discover for auto-crawl.',
  },
  Remix: {
    name: 'Remix',
    defaultPort: 3000,
    devCommand: 'remix dev',
    typicalRoutes: ['/', '/about'],
    fileSystemRouting: true,
    note: 'Remix — routes live in app/routes. Use discover for auto-crawl.',
  },
  Nuxt: {
    name: 'Nuxt',
    defaultPort: 3000,
    devCommand: 'nuxt dev',
    typicalRoutes: ['/', '/about'],
    fileSystemRouting: true,
    note: 'Nuxt — routes are file-system based (pages/). Use discover for auto-crawl.',
  },
  SvelteKit: {
    name: 'SvelteKit',
    defaultPort: 5173,
    devCommand: 'vite dev',
    typicalRoutes: ['/', '/about'],
    fileSystemRouting: true,
    note: 'SvelteKit — routes live in src/routes. Use discover for auto-crawl.',
  },
  Astro: {
    name: 'Astro',
    defaultPort: 4321,
    devCommand: 'astro dev',
    typicalRoutes: ['/', '/about'],
    fileSystemRouting: true,
    note: 'Astro — routes are file-system based (src/pages).',
  },
  Gatsby: {
    name: 'Gatsby',
    defaultPort: 8000,
    devCommand: 'gatsby develop',
    typicalRoutes: ['/', '/about'],
    fileSystemRouting: true,
    note: 'Gatsby — routes are file-system based (src/pages).',
  },
  Angular: {
    name: 'Angular',
    defaultPort: 4200,
    devCommand: 'ng serve',
    typicalRoutes: ['/'],
    fileSystemRouting: false,
    note: 'Angular — define routes explicitly; they are not file-system based.',
  },
  Vite: {
    name: 'Vite',
    defaultPort: 5173,
    devCommand: 'vite',
    typicalRoutes: ['/'],
    fileSystemRouting: false,
    note: 'Vite — single-page app; define routes explicitly.',
  },
  'Create React App': {
    name: 'Create React App',
    defaultPort: 3000,
    devCommand: 'react-scripts start',
    typicalRoutes: ['/'],
    fileSystemRouting: false,
    note: 'Create React App — single-page app; define routes explicitly.',
  },
  generic: {
    name: 'generic',
    defaultPort: 3000,
    devCommand: 'npm run dev',
    typicalRoutes: ['/', '/about', '/contact'],
    fileSystemRouting: false,
    note: 'No framework detected — using sensible defaults.',
  },
};

/**
 * Returns the {@link FrameworkInfo} for a framework name, falling back to the
 * `generic` template when the name is unknown or `null`.
 */
export function getFrameworkInfo(framework: string | null | undefined): FrameworkInfo {
  if (framework && FRAMEWORK_TEMPLATES[framework]) {
    return FRAMEWORK_TEMPLATES[framework];
  }
  return FRAMEWORK_TEMPLATES.generic;
}
