import type { ReactElement } from 'react';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';

/**
 * Route components render <Seo> (vite-react-ssg's <Head>, a react-helmet-async
 * Helmet) which needs a HelmetProvider in the tree — the real app gets one from
 * ViteReactSSG on both the client and the SSG pass. This render supplies the
 * same provider so route components can be unit-tested in isolation. Tests
 * import `render` plus the Testing Library helpers they use from here.
 */
export function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return rtlRender(ui, { wrapper: HelmetProvider, ...options });
}

export { screen, within, fireEvent, waitFor } from '@testing-library/react';
