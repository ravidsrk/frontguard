# Route Discovery

Frontguard discovers pages in your app using three modes: auto-crawl, filesystem detection, and manual configuration.

## Auto-crawl (default)

Starts at your base URL and follows links to discover all reachable pages.

```typescript
export default defineConfig({
  discovery: {
    mode: 'auto',
    maxPages: 50,          // Stop after 50 pages
    excludePatterns: [
      '/admin/*',          // Skip admin routes
      '/api/*',            // Skip API endpoints
    ],
  },
});
```

The crawler respects `robots.txt`, skips external links, and handles SPAs by waiting for client-side navigation.

## Filesystem detection

Reads your framework's file-based routing to discover pages without crawling.

```typescript
export default defineConfig({
  discovery: {
    mode: 'filesystem',
    framework: 'nextjs',   // or 'nuxt', 'sveltekit', 'astro', 'remix'
  },
});
```

**Supported frameworks:**

| Framework | Route directory | Dynamic routes |
|-----------|----------------|----------------|
| Next.js (App Router) | `app/` | ✅ Provide examples via `dynamicParams` |
| Next.js (Pages) | `pages/` | ✅ |
| Nuxt | `pages/` | ✅ |
| SvelteKit | `src/routes/` | ✅ |
| Astro | `src/pages/` | ✅ |
| Remix | `app/routes/` | ✅ |

For dynamic routes (e.g., `/blog/[slug]`), provide example values:

```typescript
discovery: {
  mode: 'filesystem',
  framework: 'nextjs',
  dynamicParams: {
    '/blog/[slug]': ['hello-world', 'getting-started'],
    '/users/[id]': ['1', '42'],
  },
},
```

## Manual configuration

Explicitly list the pages to test.

```typescript
export default defineConfig({
  discovery: {
    mode: 'manual',
    routes: [
      '/',
      '/about',
      '/pricing',
      '/blog',
      '/blog/hello-world',
      '/contact',
    ],
  },
});
```

## Combining modes

You can auto-discover and then add or exclude specific pages:

```typescript
discovery: {
  mode: 'auto',
  includeRoutes: ['/hidden-page'],   // Always include these
  excludePatterns: ['/admin/*'],      // Always exclude these
},
```

## Authentication

For pages behind login, provide auth configuration:

```typescript
auth: {
  type: 'cookie',
  login: async (page) => {
    await page.goto('/login');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'password');
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
  },
},
```

This runs once before discovery and screenshots. The session persists across all pages.
