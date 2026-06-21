import { act, render, screen } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from '../router'

const NEUTRALS = [
  { name: 'canvas', hex: '#0d0c0b' },
  { name: 'panel', hex: '#131210' },
  { name: 'raised', hex: '#1f1c19' },
  { name: 'border', hex: '#322d28' },
  { name: 'ink-mid', hex: '#b8b0a6' },
  { name: 'ink-hi', hex: '#f5f1ea' },
]

async function renderBrand() {
  const router = getRouter()
  await act(async () => {
    await router.navigate({ to: '/brand' })
  })
  return render(<RouterProvider router={router} />)
}

describe('/brand', () => {
  it('renders the page title and five numbered sections', async () => {
    await renderBrand()
    expect(
      // jsdom 29 renders <br> as display:inline, so the accessible name has no
      // space at the line break; tolerate the missing whitespace.
      screen.getByRole('heading', { level: 1, name: /the frontguard\s*brand system/i }),
    ).toBeInTheDocument()
    for (const label of [
      '01 / THE MARK',
      '02 / COLOR',
      '03 / TYPOGRAPHY',
      '04 / VOICE',
      '05 / MESSAGING',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: label })).toBeInTheDocument()
    }
  })

  it('renders six neutral swatches with exact hex tokens', async () => {
    await renderBrand()
    const swatches = screen.getAllByTestId('neutral-swatch')
    expect(swatches).toHaveLength(6)
    for (const token of NEUTRALS) {
      expect(screen.getByText(token.hex)).toBeInTheDocument()
      expect(screen.getByText(token.name)).toBeInTheDocument()
    }
  })

  it('renders amber accent and four status swatches', async () => {
    await renderBrand()
    const amber = screen.getByTestId('amber-swatch')
    expect(amber).toHaveTextContent('Frontguard Amber')
    expect(amber).toHaveTextContent('#E8862E')
    expect(amber).toHaveTextContent('oklch(0.72 0.18 50)')

    const statuses = screen.getAllByTestId('status-swatch')
    expect(statuses).toHaveLength(4)
    for (const hex of ['#4fb477', '#e8862e', '#e5484d', '#5b8def']) {
      expect(screen.getByText(hex)).toBeInTheDocument()
    }
  })

  it('renders the type scale and primary tagline', async () => {
    await renderBrand()
    const scale = screen.getByTestId('type-scale')
    expect(scale).toHaveTextContent('DISPLAY / 52')
    expect(scale).toHaveTextContent('HEADING / 38')
    expect(scale).toHaveTextContent('BODY / 16')
    expect(scale).toHaveTextContent('MONO / 13')
    expect(screen.getByText('Catch the regression, not the noise.')).toBeInTheDocument()
    expect(screen.getByText('SAY')).toBeInTheDocument()
    expect(screen.getByText("DON'T")).toBeInTheDocument()
  })
})