import { StrictMode } from 'react';
import { Outlet } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';

/**
 * App root. Provides the skip link and wraps the whole route tree in the ported
 * ErrorBoundary (the SSG entry owns the actual createRoot/StrictMode container,
 * so we re-establish StrictMode + ErrorBoundary here at the top of the tree).
 */
export function RootLayout() {
  return (
    <StrictMode>
      <a
        href="#main-content"
        className="sr-only z-[100] bg-amber px-4 py-2 font-mono text-[13px] text-canvas focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </StrictMode>
  );
}

export default RootLayout;
