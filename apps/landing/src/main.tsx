// Self-hosted fonts (Space Grotesk + JetBrains Mono) — bundled by Vite so the
// type is applied without a runtime Google Fonts request.
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';

import { ViteReactSSG } from 'vite-react-ssg';
import { routes } from './App';

/**
 * vite-react-ssg entry. The build (`vite-react-ssg build`) prerenders every
 * route in the table to static HTML; on the client it hydrates the same tree.
 */
export const createRoot = ViteReactSSG({ routes });
