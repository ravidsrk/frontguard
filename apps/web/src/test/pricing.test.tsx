import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { afterEach, vi } from 'vitest'
import { getRouter } from '../router'

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
}

async function renderPricing() {
  const router = getRouter()
  await act(async () => {
    await router.navigate({ to: '/pricing' })
  })
  return render(<RouterProvider router={router} />)
}

describe('/pricing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setClipboard(undefined)
  })

  it('renders three tier prices from the product floor', async () => {
    await renderPricing()
    const prices = screen.getAllByTestId('tier-price').map((el) => el.textContent)
    expect(prices).toEqual(['$0', '$29', "Let's talk"])
  })

  it('renders floor-correct CTAs with external-link hygiene', async () => {
    await renderPricing()

    const install = screen.getByRole('link', { name: /npm install @frontguard\/cli/i })
    expect(install).toHaveAttribute('href', '/#install')
    expect(install).not.toHaveAttribute('target')

    const waitlist = screen.getByRole('link', { name: /join the waitlist/i })
    expect(waitlist).toHaveAttribute(
      'href',
      'mailto:hello@frontguard.dev?subject=Pro%20waitlist',
    )
    expect(waitlist).toHaveAttribute('target', '_blank')
    expect(waitlist).toHaveAttribute('rel', 'noopener noreferrer')

    const contact = screen.getByRole('link', { name: /contact us/i })
    expect(contact).toHaveAttribute(
      'href',
      'mailto:hello@frontguard.dev?subject=Enterprise%20Frontguard',
    )
    expect(contact).toHaveAttribute('target', '_blank')
  })

  it('flags Pro as most popular', async () => {
    await renderPricing()
    expect(screen.getByText(/most popular/i)).toBeInTheDocument()
  })

  it('renders all eight FAQ questions as native details accordions', async () => {
    await renderPricing()
    const questions = [
      'How do I install Frontguard?',
      'How does Frontguard handle cross-OS rendering differences?',
      'Can I self-host the cloud?',
      'What environment variables does Frontguard read?',
      'OpenAI or Anthropic — which should I use?',
      'Does Frontguard work with Storybook?',
      'Is there an MCP server for in-IDE agents?',
      "What's the data retention policy for screenshots?",
    ]
    for (const q of questions) {
      expect(screen.getByText(q)).toBeInTheDocument()
    }
    expect(document.querySelectorAll('details')).toHaveLength(8)
  })

  it('renders nine compare-plans matrix rows with production monitoring floor values', async () => {
    await renderPricing()
    const matrix = screen.getByTestId('compare-matrix')
    expect(within(matrix).getAllByTestId('matrix-row')).toHaveLength(9)
    expect(within(matrix).getByText('Production monitoring scheduler')).toBeInTheDocument()
    const row = within(matrix).getByText('Production monitoring scheduler').closest('[data-testid="matrix-row"]')
    expect(row?.textContent).toContain('CLI')
    expect(row?.textContent).toContain('—')
    expect(row?.textContent).toContain('✓')
  })

  it('copies the install command from the CTA band', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })

    await renderPricing()
    fireEvent.click(
      screen.getByRole('button', { name: /copy command: npm install @frontguard\/cli/i }),
    )

    expect(await screen.findByText('copied ✓')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith('npm install @frontguard/cli')
  })
})