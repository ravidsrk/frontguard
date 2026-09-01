import fs from 'node:fs'
import path from 'node:path'

const AGENTS_MD = path.resolve(process.cwd(), 'public/agents.md')

describe('agents.md', () => {
  const readAgentsMd = () => fs.readFileSync(AGENTS_MD, 'utf8')

  it('exists and documents the public agent surfaces', () => {
    const content = readAgentsMd()

    expect(content.trim().length).toBeGreaterThan(0)
    expect(content).toContain('Pre-release cloud status')
    expect(content).toContain('https://your-frontguard-api.example.com')
    expect(content).not.toContain('call `https://api.frontguard.dev` directly')
    for (const tool of [
      'recent_runs',
      'list_regressions',
      'get_suggested_fix',
      'accept_baseline',
    ]) {
      expect(content).toContain(tool)
    }
  })

  it('does not expose internal routes or obvious secrets', () => {
    const content = readAgentsMd()
    const forbiddenPaths = ['/auth', '/dashboard', '/v1/billing', '/v1/keys']

    for (const route of forbiddenPaths) {
      expect(content).not.toContain(route)
    }

    expect(content).not.toMatch(/fg_live_[A-Za-z0-9]{12,}/)
    expect(content).not.toMatch(/fg_test_[A-Za-z0-9]{12,}/)
    expect(content).not.toMatch(/sk-[A-Za-z0-9]{20,}/)
  })

  it('does not claim cloud approval promotes screenshots', () => {
    const content = readAgentsMd()
    expect(content).toContain('does not yet promote screenshots')
    expect(content).not.toContain('Promote every screenshot')
  })

  it('scopes bearer auth to agent routes and identifies public and signature-authenticated surfaces', () => {
    const content = readAgentsMd()
    expect(content).toContain('agent-facing `/v1`')
    expect(content).toContain('`GET /health` and `GET /openapi.json` are public')
    expect(content).toContain('`Stripe-Signature` verification rather than Bearer auth')
    expect(content).not.toContain('All `/v1/*` reads and writes')
    expect(content).not.toContain('/health` is the only unauthenticated endpoint')
  })
})
