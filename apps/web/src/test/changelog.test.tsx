import { act, render, screen, within } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { RELEASES } from '../routes/changelog/-releases'
import { getRouter } from '../router'

async function renderChangelog() {
  const router = getRouter()
  await act(async () => {
    await router.navigate({ to: '/changelog' })
  })
  return render(<RouterProvider router={router} />)
}

describe('/changelog', () => {
  it('renders exactly three releases newest-first', async () => {
    await renderChangelog()
    expect(RELEASES.map((r) => r.version)).toEqual(['Unreleased', '0.2.0', '0.1.0'])
    expect(screen.getAllByTestId('release')).toHaveLength(3)
    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument()
    expect(screen.getByText('LATEST RELEASE')).toBeInTheDocument()
    expect(screen.getByText('INITIAL RELEASE')).toBeInTheDocument()
  })

  it('renders dated releases in time elements and undated on main as plain text', async () => {
    await renderChangelog()
    const latest = screen.getByText('2026-06-03')
    expect(latest.tagName).toBe('TIME')
    expect(latest).toHaveAttribute('datetime', '2026-06-03')

    const initial = screen.getByText('2026-01-01')
    expect(initial.tagName).toBe('TIME')
    expect(initial).toHaveAttribute('datetime', '2026-01-01')

    expect(screen.getByText('on main').tagName).not.toBe('TIME')
  })

  it('renders truthful change groups including SECURITY and TESTING on 0.1.0', async () => {
    await renderChangelog()
    expect(screen.getAllByText('ADDED').length).toBe(3)
    expect(screen.getByText('CHANGED')).toBeInTheDocument()
    expect(screen.getByText('SECURITY')).toBeInTheDocument()
    expect(screen.getByText('TESTING')).toBeInTheDocument()
    expect(screen.getByText('395 tests across 26 test files')).toBeInTheDocument()
    expect(screen.getByText('Storybook integration')).toBeInTheDocument()
    expect(screen.getByText('frontguard doctor')).toBeInTheDocument()
    expect(screen.getByText('pixelmatch diffing (0–100%)')).toBeInTheDocument()

    const initial = screen.getByRole('article', { name: /the core engine/i })
    expect(within(initial).getByText('SECURITY')).toBeInTheDocument()
    expect(within(initial).getByText('TESTING')).toBeInTheDocument()
    expect(within(initial).queryByText('CHANGED')).not.toBeInTheDocument()
  })

  it('renders version labels and changed items in the page output', async () => {
    const { container } = await renderChangelog()
    expect(screen.getByText('0.2.0')).toBeInTheDocument()
    expect(screen.getByText('docs migrated VitePress → Fumadocs')).toBeInTheDocument()
    expect(container.textContent).toContain('Unreleased')
    expect(container.textContent).toContain('reporters render a11y/perf/3rd-party sections')
  })
})