import { render, screen, within } from './test-utils';
import { MemoryRouter } from 'react-router-dom';
import { Component as Changelog } from '../routes/changelog';
import { RELEASES } from '../routes/changelog/releases';
import { FOOTER_COLUMNS } from '../lib/site';

function renderChangelog() {
  return render(
    <MemoryRouter initialEntries={['/changelog']}>
      <Changelog />
    </MemoryRouter>,
  );
}

describe('/changelog', () => {
  it('renders the hero heading', () => {
    renderChangelog();
    expect(screen.getByRole('heading', { level: 1, name: /what's new in frontguard/i })).toBeInTheDocument();
  });

  it('renders exactly the three CHANGELOG releases as semantic articles', () => {
    renderChangelog();
    expect(screen.getAllByTestId('release')).toHaveLength(3);
    // Each release is an <article> labelled by its title heading (a11y).
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByRole('heading', { level: 2, name: /storybook, opentelemetry & a native slack app/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /the "earn trust" release/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /the core engine/i })).toBeInTheDocument();
  });

  it('colors each version number by release status', () => {
    renderChangelog();
    expect(screen.getByText('Unreleased')).toHaveClass('text-amber'); // in-progress
    expect(screen.getByText('0.2.0')).toHaveClass('text-pass'); // latest
    expect(screen.getByText('0.1.0')).toHaveClass('text-ink-soft'); // initial
  });

  it('renders the correct status chip per release with status-colored text', () => {
    renderChangelog();
    expect(screen.getByText('IN PROGRESS')).toHaveClass('text-amber');
    expect(screen.getByText('LATEST RELEASE')).toHaveClass('text-pass');
    expect(screen.getByText('INITIAL RELEASE')).toHaveClass('text-ink-soft');
  });

  it('color-codes the change groups: ADDED green / CHANGED blue / SECURITY amber / TESTING purple', () => {
    renderChangelog();
    // ADDED appears once per release; all should be the green pass color.
    const added = screen.getAllByText('ADDED');
    expect(added).toHaveLength(3);
    added.forEach((el) => expect(el).toHaveClass('text-pass'));
    // CHANGED is unique to 0.2.0, SECURITY + TESTING unique to 0.1.0.
    expect(screen.getByText('CHANGED')).toHaveClass('text-new');
    expect(screen.getByText('SECURITY')).toHaveClass('text-amber');
    expect(screen.getByText('TESTING')).toHaveClass('text-code-keyword');
  });

  it('keeps a sticky version-meta column for every release', () => {
    renderChangelog();
    const metas = screen.getAllByTestId('release-meta');
    expect(metas).toHaveLength(3);
    metas.forEach((meta) => {
      expect(meta).toHaveClass('md:sticky');
      expect(meta).toHaveClass('md:top-[88px]');
    });
  });

  it('collapses the 168px/1fr grid to a single stacked column below md', () => {
    renderChangelog();
    screen.getAllByTestId('release').forEach((article) => {
      expect(article).toHaveClass('grid-cols-1');
      expect(article).toHaveClass('md:grid-cols-[168px_1fr]');
    });
  });

  it('renders dated releases inside <time> and the undated Unreleased row as plain text', () => {
    renderChangelog();
    const latest = screen.getByText('2026-06-03');
    expect(latest.tagName).toBe('TIME');
    expect(latest).toHaveAttribute('datetime', '2026-06-03');

    const initial = screen.getByText('2026-01-01');
    expect(initial.tagName).toBe('TIME');
    expect(initial).toHaveAttribute('datetime', '2026-01-01');

    // "Unreleased" has no real date, so it must not be a <time> element.
    expect(screen.getByText('on main').tagName).not.toBe('TIME');
  });

  it('renders truthful change content sourced from CHANGELOG.md', () => {
    renderChangelog();
    expect(screen.getByText('Storybook integration')).toBeInTheDocument();
    expect(screen.getByText('frontguard doctor')).toBeInTheDocument();
    expect(screen.getByText('Plugin architecture')).toBeInTheDocument();
    expect(screen.getByText('395 tests')).toBeInTheDocument();
  });

  it('composes each line as bold term + continuation with the source separator (no forced em-dash)', () => {
    renderChangelog();
    // CHANGED entries continue with a plain space, not " — ".
    const term = screen.getByText('Documentation site');
    expect(term.tagName).toBe('STRONG');
    expect(term.parentElement?.textContent).toBe(
      'Documentation site migrated from VitePress to Fumadocs (Next.js + MDX).',
    );
  });

  it('applies external-link hygiene to the Keep a Changelog and source links', () => {
    renderChangelog();
    const kacl = screen.getByRole('link', { name: /keep a changelog/i });
    expect(kacl).toHaveAttribute('href', 'https://keepachangelog.com');
    expect(kacl).toHaveAttribute('target', '_blank');
    expect(kacl).toHaveAttribute('rel', 'noopener noreferrer');

    const source = screen.getByRole('link', { name: /view full changelog on github/i });
    expect(source).toHaveAttribute('href', 'https://github.com/ravidsrk/frontguard/blob/main/CHANGELOG.md');
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('scopes the SECURITY + TESTING groups to the initial release only', () => {
    renderChangelog();
    const initial = screen.getByRole('article', { name: /the core engine/i });
    expect(within(initial).getByText('SECURITY')).toBeInTheDocument();
    expect(within(initial).getByText('TESTING')).toBeInTheDocument();
    expect(within(initial).queryByText('CHANGED')).not.toBeInTheDocument();
  });
});

describe('changelog data + footer floor', () => {
  it('orders releases newest-first', () => {
    expect(RELEASES.map((r) => r.version)).toEqual(['Unreleased', '0.2.0', '0.1.0']);
  });

  it('points the footer Changelog link at the internal /changelog route (floor: external link now internal)', () => {
    const product = FOOTER_COLUMNS.find((c) => c.title === 'Product');
    const changelogLink = product?.links.find((l) => l.label === 'Changelog');
    expect(changelogLink).toBeDefined();
    expect(changelogLink?.to).toBe('/changelog');
    expect(changelogLink?.external).toBeFalsy();
  });
});
