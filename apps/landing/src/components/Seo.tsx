import { Head } from 'vite-react-ssg';

const SITE = 'https://frontguard.dev';

/**
 * Per-route document metadata.
 *
 * The SSG build (`vite-react-ssg build`) renders each route with
 * `renderToString`, where React 19's client-side metadata hoisting never runs —
 * bare `<title>`/`<meta>` tags would serialize inside `#root` in the body, so
 * every prerendered `<head>` would keep the homepage defaults and self-
 * canonicalize to `/`. vite-react-ssg collects `Head` (react-helmet-async)
 * output during prerender and injects it into the real `<head>`, and wraps the
 * client tree in `HelmetProvider`, so the same tags hoist correctly on
 * hydration too. The route-varying tags (title/description/canonical/OG/Twitter)
 * live here and are intentionally absent from `index.html` to avoid duplicates.
 */
export function Seo({
  title,
  description,
  path,
}: {
  title: string;
  description?: string;
  path: string;
}) {
  const canonical = `${SITE}${path === '/' ? '' : path}`;
  return (
    <Head>
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={title} />
      <meta property="og:url" content={canonical} />
      {description && <meta property="og:description" content={description} />}
      <meta name="twitter:title" content={title} />
      {description && <meta name="twitter:description" content={description} />}
    </Head>
  );
}

export default Seo;
