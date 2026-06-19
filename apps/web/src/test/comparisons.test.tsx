import { act, render, screen, within } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { MATRIX, VENDORS } from '../routes/comparisons/-data'
import { getRouter } from '../router'

async function renderComparisons() {
  const router = getRouter()
  await act(async () => {
    await router.navigate({ to: '/comparisons' })
  })
  return render(<RouterProvider router={router} />)
}

describe('/comparisons', () => {
  it('renders the hero heading', async () => {
    await renderComparisons()
    expect(
      screen.getByRole('heading', { level: 1, name: /frontguard vs\. everyone else/i }),
    ).toBeInTheDocument()
  })

  it('renders the four alternatives strip with exact statuses', async () => {
    await renderComparisons()
    const items = screen.getAllByTestId('alternative')
    expect(items).toHaveLength(4)
    expect(within(items[0]).getByText('↗ pricing cliff')).toBeInTheDocument()
    expect(within(items[1]).getByText('◐ Storybook-locked')).toBeInTheDocument()
    expect(within(items[2]).getByText('✕ low activity')).toBeInTheDocument()
    expect(within(items[3]).getByText('✕ archived')).toBeInTheDocument()
  })

  it('renders a 15-row × 6-vendor matrix with exact floor values', async () => {
    await renderComparisons()
    expect(VENDORS).toHaveLength(6)
    for (const vendor of VENDORS) {
      expect(screen.getByRole('columnheader', { name: vendor })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('rowheader')).toHaveLength(MATRIX.length)
    expect(MATRIX).toHaveLength(15)

    for (const row of MATRIX) {
      expect(screen.getByRole('rowheader', { name: row.capability })).toBeInTheDocument()
    }

    expect(screen.getByText('$29/mo')).toBeInTheDocument()
    expect(screen.getByText('$199/mo')).toBeInTheDocument()
    expect(screen.getByText('$179/mo')).toBeInTheDocument()
    expect(screen.getByText('Spend cap')).toBeInTheDocument()
    expect(screen.getByText('$0.008')).toBeInTheDocument()
    expect(screen.getByText('✕ quiet')).toBeInTheDocument()
  })

  it('renders four head-to-head cards and four migration links', async () => {
    await renderComparisons()
    expect(screen.getAllByRole('article')).toHaveLength(4)
    const migrations = screen.getAllByTestId('migration')
    expect(migrations).toHaveLength(4)
    migrations.forEach((card) => {
      expect(card).toHaveAttribute('target', '_blank')
      expect(card).toHaveAttribute('rel', 'noopener noreferrer')
      expect(card.getAttribute('href')).toContain('docs.frontguard.dev')
    })
  })

  it('links matrix sources to docs/research.md', async () => {
    await renderComparisons()
    const link = screen.getByRole('link', { name: /docs\/research\.md/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('/blob/main/docs/research.md'))
  })

  it('renders vendor column headers and price cells in the page output', async () => {
    const { container } = await renderComparisons()
    expect(screen.getByRole('columnheader', { name: 'Chromatic' })).toBeInTheDocument()
    expect(screen.getByText('$179/mo')).toBeInTheDocument()
    expect(container.textContent).toContain('Percy')
    expect(container.textContent).toContain('$0.008')
  })
})