const SITE = 'https://frontguard.dev';

/**
 * Per-route document metadata using React 19 native hoisting (no react-helmet).
 * React lifts these <title>/<meta>/<link> tags to <head> on the client; the
 * global tags in index.html provide crawl-time defaults.
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
    <>
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      <link rel="canonical" href={canonical} />
    </>
  );
}

export default Seo;
