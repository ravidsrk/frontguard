import fs from 'node:fs'
import path from 'node:path'

const AGENTS_MD = path.resolve(process.cwd(), 'public/agents.md')

describe('agents.md', () => {
  const readAgentsMd = () => fs.readFileSync(AGENTS_MD, 'utf8')

  it('exists and documents the public agent surfaces', () => {
    const content = readAgentsMd()

    expect(content.trim().length).toBeGreaterThan(0)
    expect(content).toContain('https://api.frontguard.dev')
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
})
