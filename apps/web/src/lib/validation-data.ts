/*
  Real validation harness numbers — mirrors validation/results/landing-payload.json.
  NEVER hand-edit figures; regenerate via validation/aggregate-results.mjs --landing.
*/

export interface ValidationRepo {
  name: string
  category: string
  bootSucceeded: boolean
  recheckPass: number
  recheckFalsePositive: number
  recheckError: number
  pixelFalsePositiveRate: number | null
  skipReason?: string
}

export interface ValidationPayload {
  runDate: string
  cliVersion: string
  aiEnabled: boolean
  aggregate: {
    reposAttempted: number
    reposBooted: number
    reposSkipped: number
    recheckRouteCount: number
    recheckPositiveCount: number
    pixelFalsePositiveRate: number
  }
  repos: ValidationRepo[]
}

export const VALIDATION: ValidationPayload = {
  runDate: '2026-06-16',
  cliVersion: '0.2.0',
  aiEnabled: false,
  aggregate: {
    reposAttempted: 5,
    reposBooted: 2,
    reposSkipped: 3,
    recheckRouteCount: 43,
    recheckPositiveCount: 0,
    pixelFalsePositiveRate: 0,
  },
  repos: [
    {
      name: 'chakra-ui-docs',
      category: 'component library docs',
      bootSucceeded: true,
      recheckPass: 21,
      recheckFalsePositive: 0,
      recheckError: 3,
      pixelFalsePositiveRate: 0,
    },
    {
      name: 'tailwind-dashboard',
      category: 'Tailwind dashboard',
      bootSucceeded: true,
      recheckPass: 18,
      recheckFalsePositive: 0,
      recheckError: 1,
      pixelFalsePositiveRate: 0,
    },
    {
      name: 'taxonomy',
      category: 'Next.js app',
      bootSucceeded: false,
      recheckPass: 0,
      recheckFalsePositive: 0,
      recheckError: 0,
      pixelFalsePositiveRate: null,
      skipReason:
        'next 13.3.2-canary dev server failed to load config under Node 22; contentlayer dev succeeded but next dev crashed',
    },
    {
      name: 'medusa-storefront',
      category: 'e-commerce storefront',
      bootSucceeded: false,
      recheckPass: 0,
      recheckFalsePositive: 0,
      recheckError: 0,
      pixelFalsePositiveRate: null,
      skipReason:
        'requires a running Medusa backend and NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY — not provisioned in this harness run',
    },
    {
      name: 'nextra-docs',
      category: 'docs site',
      bootSucceeded: false,
      recheckPass: 0,
      recheckFalsePositive: 0,
      recheckError: 0,
      pixelFalsePositiveRate: null,
      skipReason:
        "monorepo's root `pnpm dev` builds every package but does not bind a dev server on :3000 within the 120 s timeout",
    },
  ],
}

export function formatPercent(rate: number | null): string {
  return rate === null ? 'n/a' : `${Math.round(rate * 100)}%`
}

export function partitionRepos(payload: ValidationPayload = VALIDATION) {
  return {
    booted: payload.repos.filter((r) => r.bootSucceeded),
    skipped: payload.repos.filter((r) => !r.bootSucceeded),
  }
}

export const VALIDATION_GATE = { minAccuracy: 0.7, maxFalsePositiveRate: 0.15 } as const

export const VALIDATION_RESULTS_URL =
  'https://github.com/ravidsrk/frontguard/blob/main/validation/results-v0.2.md'
export const VALIDATION_METHODOLOGY_URL =
  'https://github.com/ravidsrk/frontguard/blob/main/validation/README.md'