import { useEffect, useRef, useState } from 'react';

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Docs', href: '#getting-started' },
  { label: 'GitHub', href: 'https://github.com/ravidsrk/frontguard' },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Focus management: move focus into mobile menu when opened
  useEffect(() => {
    if (mobileOpen && mobileMenuRef.current) {
      const firstLink = mobileMenuRef.current.querySelector('a');
      firstLink?.focus();
    }
  }, [mobileOpen]);

  // Close mobile menu on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        scrolled
          ? 'border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-xl'
          : 'bg-transparent'
      }`}
    >
      <nav aria-label="Main navigation" className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
        <a
          href="/"
          className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-[var(--color-text)]"
        >
          <img src="/logo-48.png" alt="" width={28} height={28} className="rounded-sm" aria-hidden="true" />
          <span className="font-[family-name:var(--font-mono)] text-lg font-medium text-[var(--color-accent)]">
            frontguard
          </span>
        </a>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
              {...(link.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {link.label}
            </a>
          ))}
          <a
            href="#getting-started"
            className="touch-manipulation rounded-lg bg-[var(--color-cta)] px-4 py-2 text-sm font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-cta-hover)]"
          >
            Get Started
          </a>
        </div>

        {/* Mobile menu button — min 44x44 touch target */}
        <button
          ref={menuButtonRef}
          onClick={() => setMobileOpen(!mobileOpen)}
          className="touch-manipulation flex h-11 w-11 items-center justify-center md:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {mobileOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </>
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          ref={mobileMenuRef}
          role="menu"
          className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 px-6 pb-6 backdrop-blur-xl md:hidden"
        >
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                role="menuitem"
                onClick={() => setMobileOpen(false)}
                className="touch-manipulation rounded-lg px-3 py-3 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text)]"
                {...(link.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {link.label}
              </a>
            ))}
            <a
              href="#getting-started"
              role="menuitem"
              onClick={() => setMobileOpen(false)}
              className="touch-manipulation mt-2 inline-block rounded-lg bg-[var(--color-cta)] px-4 py-3 text-center text-sm font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-cta-hover)]"
            >
              Get Started
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
