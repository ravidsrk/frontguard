import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { TopBar } from '../components/ui/TopBar';
import { DOCS_NAV } from '../lib/docs';

/**
 * Docs three-column shell: sidebar nav (256px) + content (1fr) + page-owned TOC
 * slot (224px). On mobile the sidebar becomes a toggleable drawer. Active page
 * state is derived from the URL via react-router NavLink.
 */
export function DocsLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas">
      <TopBar onToggleSidebar={() => setSidebarOpen((v) => !v)} />
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 lg:grid-cols-[256px_minmax(0,1fr)]">
        <aside
          aria-label="Docs navigation"
          className={[
            // Mobile: a drawer toggled by the top-bar hamburger. Desktop: always
            // shown. Uses class-based show/hide (not the `hidden` attribute) so
            // the `lg:block` override actually wins under Tailwind v4.
            sidebarOpen ? 'block' : 'hidden',
            'border-b border-border-faint px-7 py-6 lg:block lg:border-b-0 lg:border-r',
          ].join(' ')}
        >
          <nav className="flex flex-col gap-6">
            {DOCS_NAV.map((group) => (
              <div key={group.section}>
                <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint">
                  {group.section}
                </div>
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <li key={item.slug}>
                      <NavLink
                        to={`/docs/${item.slug}`}
                        onClick={() => setSidebarOpen(false)}
                        className={({ isActive }) =>
                          [
                            'block border-l py-1.5 pl-3 text-[14px] transition-colors duration-[180ms]',
                            isActive
                              ? 'border-amber text-amber'
                              : 'border-border-faint text-ink-soft hover:text-ink-hi',
                          ].join(' ')
                        }
                      >
                        {item.title}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main id="main-content" className="min-w-0 px-7 py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DocsLayout;
