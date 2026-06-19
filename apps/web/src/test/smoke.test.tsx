import { act, render, screen } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { routeTree } from '../routeTree.gen'
import { getRouter } from '../router'
import { Nav } from '../components/Nav'
import { Shield } from '../components/Shield'

describe('apps/web smoke', () => {
  it('imports router, route tree, and shared components', () => {
    expect(getRouter()).toBeDefined()
    expect(routeTree).toBeDefined()
    expect(Nav).toBeTypeOf('function')
    expect(Shield).toBeTypeOf('function')
  })

  it('renders Shield mark with clip-path', () => {
    const { container } = render(<Shield />)
    expect(container.innerHTML).toContain(
      'polygon(0% 0%, 100% 0%, 100% 62%, 50% 100%, 0% 62%)',
    )
  })

  it('renders home route with shared chrome', async () => {
    const router = getRouter()
    await act(async () => {
      await router.navigate({ to: '/' })
    })
    render(<RouterProvider router={router} />)
    expect(screen.getAllByText('frontguard').length).toBeGreaterThan(0)
    expect(screen.getByText('docs')).toBeInTheDocument()
    expect(screen.getByText('★ Star')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Catch the regression,\s*not the noise/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/MIT License/)).toBeInTheDocument()
  })
})