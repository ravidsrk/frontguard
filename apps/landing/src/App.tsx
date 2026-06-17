import type { RouteRecord } from 'vite-react-ssg';
import { RootLayout } from './layouts/RootLayout';
import { MarketingLayout } from './layouts/MarketingLayout';
import { DocsLayout } from './layouts/DocsLayout';
import { DOCS_SLUGS } from './lib/docs';

/**
 * Route table shared by the SSG build and the client. Two shells nest under the
 * root: the marketing layout (Nav + Footer) for the five marketing routes, and
 * the docs layout (three-column shell) for /docs and /docs/:page. Pages are
 * lazily imported to preserve code-splitting; the dynamic docs route enumerates
 * its prerendered paths via getStaticPaths.
 */
export const routes: RouteRecord[] = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        element: <MarketingLayout />,
        children: [
          { index: true, lazy: () => import('./routes/landing') },
          { path: 'pricing', lazy: () => import('./routes/pricing') },
          { path: 'comparisons', lazy: () => import('./routes/comparisons') },
          { path: 'changelog', lazy: () => import('./routes/changelog') },
          { path: 'brand', lazy: () => import('./routes/brand') },
        ],
      },
      {
        path: 'docs',
        element: <DocsLayout />,
        children: [
          { index: true, lazy: () => import('./routes/docs-home') },
          {
            path: ':page',
            lazy: () => import('./routes/docs-page'),
            getStaticPaths: () => DOCS_SLUGS.map((slug) => `/docs/${slug}`),
          },
        ],
      },
    ],
  },
];

export default routes;
