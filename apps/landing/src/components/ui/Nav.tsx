import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Logo } from './Logo';
import { GitHubStars } from './GitHubStars';
import { NAV_LINKS } from '../../lib/site';

/**
 * Sticky translucent marketing nav. Preserves the floor's scroll-state,
 * mobile hamburger, Escape-to-close, and focus management; links are re-pointed
 * to routes via react-router.
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Move focus into the menu when it opens.
  useEffect(() => {
    if (mobileOpen && menuRef.current) {
      menuRef.current.querySelector('a')?.focus();
    }
  }, [mobileOpen]);

  // Escape closes the menu and returns focus to the toggle.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'font-mono text-[13px] transition-colors duration-[180ms]',
      isActive ? 'text-amber' : 'text-ink-mid hover:text-ink-hi',
    ].join(' ');

  return (
    <header
      className={[
        'fixed inset-x-0 top-0 z-50 backdrop-blur-[12px] transition-[background-color,border-color] duration-300',
        scrolled
          ? 'border-b border-border-faint bg-canvas/85'
          : 'border-b border-transparent bg-canvas/60',
      ].join(' ')}
    >
      <nav aria-label="Main navigation" className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-7">
        <Link to="/" aria-label="Frontguard home" className="flex items-center">
          <Logo variant="primary" height={26} />
        </Link>

        <div className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={linkClass}>
              {link.label}
            </NavLink>
          ))}
          <GitHubStars />
        </div>

        <button
          ref={buttonRef}
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="flex h-11 w-11 items-center justify-center text-ink-hi lg:hidden cursor-pointer"
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

      <div
        id="mobile-menu"
        ref={menuRef}
        hidden={!mobileOpen}
        className="border-b border-border-faint bg-canvas lg:hidden"
      >
        <div className="flex flex-col gap-1 px-7 pb-6 pt-2">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                [
                  'px-2 py-3 font-mono text-[14px] transition-colors',
                  isActive ? 'text-amber' : 'text-ink-mid hover:text-ink-hi',
                ].join(' ')
              }
            >
              {link.label}
            </NavLink>
          ))}
          <div className="mt-2" onClick={() => setMobileOpen(false)}>
            <GitHubStars className="w-full justify-center" />
          </div>
        </div>
      </div>
    </header>
  );
}

export default Nav;
