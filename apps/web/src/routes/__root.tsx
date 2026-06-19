import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { NotFound } from '../components/NotFound'
import appCss from '../styles.css?url'

// Workers SSR handles routing — no Cloudflare Pages _redirects SPA fallback needed.

export const Route = createRootRoute({
  notFoundComponent: NotFound,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#0d0c0b' },
      { name: 'author', content: 'Ravindra Kumar' },
      {
        name: 'keywords',
        content:
          'visual regression testing, AI visual testing, Playwright, Storybook visual testing, frontend testing, CSS regression, screenshot testing, open source visual testing, MCP server',
      },
      { name: 'referrer', content: 'strict-origin-when-cross-origin' },
      { httpEquiv: 'X-Content-Type-Options', content: 'nosniff' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/favicon.ico', type: 'image/x-icon' },
      { rel: 'icon', href: '/logo-32.png', type: 'image/png', sizes: '32x32' },
      { rel: 'icon', href: '/logo-16.png', type: 'image/png', sizes: '16x16' },
      { rel: 'apple-touch-icon', href: '/logo-180.png' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
