import { render, screen } from './test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactElement } from 'react';
import { Component as Landing } from '../routes/landing';
import { Component as Pricing } from '../routes/pricing';
import { Component as Comparisons } from '../routes/comparisons';
import { Component as Changelog } from '../routes/changelog';
import { Component as Brand } from '../routes/brand';
import { Component as DocsHome } from '../routes/docs-home';
import { Component as DocsPage } from '../routes/docs-page';

function renderAt(ui: ReactElement, path = '/') {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

describe('route stubs render', () => {
  it('/ renders the landing hero', () => {
    renderAt(<Landing />);
    expect(screen.getByRole('heading', { name: /catch the regression, not the noise/i })).toBeInTheDocument();
  });

  it('/pricing renders', () => {
    renderAt(<Pricing />);
    expect(screen.getByRole('heading', { name: /pricing that respects open source/i })).toBeInTheDocument();
  });

  it('/comparisons renders', () => {
    renderAt(<Comparisons />);
    expect(screen.getByRole('heading', { name: /frontguard vs\. everyone else/i })).toBeInTheDocument();
  });

  it('/changelog renders', () => {
    renderAt(<Changelog />);
    expect(screen.getByRole('heading', { name: /what's new in frontguard/i })).toBeInTheDocument();
  });

  it('/brand renders the three lockups', () => {
    renderAt(<Brand />);
    expect(screen.getByRole('heading', { name: /the frontguard brand system/i })).toBeInTheDocument();
    expect(screen.getAllByTestId('brand-mark').length).toBeGreaterThanOrEqual(3);
  });

  it('/docs renders the docs home', () => {
    renderAt(<DocsHome />);
    expect(screen.getByRole('heading', { name: /frontguard documentation/i })).toBeInTheDocument();
  });

  it('/docs/:page renders the resolved page from the slug', () => {
    render(
      <MemoryRouter initialEntries={['/docs/installation']}>
        <Routes>
          <Route path="/docs/:page" element={<DocsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Installation' })).toBeInTheDocument();
  });

  it('/docs/:page shows a not-found for an unknown slug', () => {
    render(
      <MemoryRouter initialEntries={['/docs/nope']}>
        <Routes>
          <Route path="/docs/:page" element={<DocsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });
});
