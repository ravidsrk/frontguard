import { describe, it, expect, afterEach } from 'vitest';
import { discoverRoutesFromFilesystem } from '../../src/discovery/filesystem.js';
import { createTempDir, writeFiles } from '../fixtures/helpers.js';

describe('discoverRoutesFromFilesystem', () => {
  let tempDir: string;
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it('discovers Next.js App Router routes', () => {
    ({ dir: tempDir, cleanup } = createTempDir());
    writeFiles(tempDir, {
      'next.config.js': 'module.exports = {};',
      'app/layout.tsx': 'export default function Layout({ children }) { return children; }',
      'app/page.tsx': 'export default function Home() { return <div>Home</div>; }',
      'app/checkout/page.tsx': 'export default function Checkout() { return <div>Checkout</div>; }',
      'app/about/page.tsx': 'export default function About() { return <div>About</div>; }',
    });

    const routes = discoverRoutesFromFilesystem(tempDir);

    expect(routes).not.toBeNull();
    const paths = routes!.map((r) => r.path);
    expect(paths).toContain('/checkout');
    expect(paths).toContain('/about');
    expect(paths).toContain('/');

    // All routes should have discoveredVia = 'filesystem'
    for (const route of routes!) {
      expect(route.discoveredVia).toBe('filesystem');
    }
  });

  it('discovers Next.js Pages Router routes', () => {
    ({ dir: tempDir, cleanup } = createTempDir());
    writeFiles(tempDir, {
      'next.config.js': 'module.exports = {};',
      'pages/index.tsx': 'export default function Home() {}',
      'pages/about.tsx': 'export default function About() {}',
      'pages/contact.tsx': 'export default function Contact() {}',
    });

    const routes = discoverRoutesFromFilesystem(tempDir);

    expect(routes).not.toBeNull();
    const paths = routes!.map((r) => r.path);
    expect(paths).toContain('/about');
    expect(paths).toContain('/contact');
    expect(paths).toContain('/');
  });

  it('returns null when no framework is detected', () => {
    ({ dir: tempDir, cleanup } = createTempDir());
    writeFiles(tempDir, {
      'index.html': '<html><body>Hello</body></html>',
      'style.css': 'body { color: red; }',
    });

    const routes = discoverRoutesFromFilesystem(tempDir);
    expect(routes).toBeNull();
  });

  it('skips dynamic segments like [id]', () => {
    ({ dir: tempDir, cleanup } = createTempDir());
    writeFiles(tempDir, {
      'next.config.js': 'module.exports = {};',
      'app/layout.tsx': 'export default function Layout({ children }) { return children; }',
      'app/page.tsx': 'export default function Home() {}',
      'app/products/page.tsx': 'export default function Products() {}',
      'app/products/[id]/page.tsx': 'export default function Product() {}',
      'app/blog/[...slug]/page.tsx': 'export default function Blog() {}',
    });

    const routes = discoverRoutesFromFilesystem(tempDir);

    expect(routes).not.toBeNull();
    const paths = routes!.map((r) => r.path);

    // Static routes should be found
    expect(paths).toContain('/products');
    expect(paths).toContain('/');

    // Dynamic segments should NOT be present
    const dynamicRoutes = paths.filter((p) => p.includes('['));
    expect(dynamicRoutes).toHaveLength(0);
  });

  it('skips internal framework files like layout and _app', () => {
    ({ dir: tempDir, cleanup } = createTempDir());
    writeFiles(tempDir, {
      'next.config.js': 'module.exports = {};',
      'pages/index.tsx': 'export default function Home() {}',
      'pages/_app.tsx': 'export default function App() {}',
      'pages/_document.tsx': 'export default function Doc() {}',
      'pages/dashboard.tsx': 'export default function Dashboard() {}',
    });

    const routes = discoverRoutesFromFilesystem(tempDir);

    expect(routes).not.toBeNull();
    const paths = routes!.map((r) => r.path);
    expect(paths).toContain('/dashboard');
    expect(paths).toContain('/');

    // _app and _document should not be routes
    const internalRoutes = paths.filter((p) => p.includes('_app') || p.includes('_document'));
    expect(internalRoutes).toHaveLength(0);
  });

  it('discovers routes from src/app for Next.js App Router', () => {
    ({ dir: tempDir, cleanup } = createTempDir());
    writeFiles(tempDir, {
      'next.config.js': 'module.exports = {};',
      'src/app/layout.tsx': 'export default function Layout({ children }) { return children; }',
      'src/app/page.tsx': 'export default function Home() {}',
      'src/app/settings/page.tsx': 'export default function Settings() {}',
    });

    const routes = discoverRoutesFromFilesystem(tempDir);

    expect(routes).not.toBeNull();
    const paths = routes!.map((r) => r.path);
    expect(paths).toContain('/');
    expect(paths).toContain('/settings');
  });

  it('returns root route even if no page file exists at root', () => {
    ({ dir: tempDir, cleanup } = createTempDir());
    writeFiles(tempDir, {
      'next.config.js': 'module.exports = {};',
      'app/layout.tsx': 'export default function Layout({ children }) { return children; }',
      'app/pricing/page.tsx': 'export default function Pricing() {}',
    });

    const routes = discoverRoutesFromFilesystem(tempDir);

    expect(routes).not.toBeNull();
    const paths = routes!.map((r) => r.path);
    // Root route should be auto-added
    expect(paths).toContain('/');
    expect(paths).toContain('/pricing');
  });
});
