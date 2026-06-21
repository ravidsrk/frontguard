import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileErrors, validate } from '@readme/openapi-parser'

type OperationObject = {
  security?: Array<Record<string, string[]>>
  responses?: Record<string, unknown>
}

type PathItemObject = Record<string, OperationObject | unknown>

type OpenApiDocument = {
  paths: Record<string, PathItemObject>
  components?: {
    securitySchemes?: Record<string, Record<string, unknown>>
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OPENAPI_PATH = path.resolve(__dirname, '../../public/openapi.json')
const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'])

const EXPECTED_PATHS = [
  '/health',
  '/v1/baselines/{runId}/approve',
  '/v1/dashboard',
  '/v1/monitors',
  '/v1/monitors/{id}',
  '/v1/monitors/{id}/runs',
  '/v1/monitors/{id}/snooze',
  '/v1/monitors/{id}/test-alert',
  '/v1/reports/{id}',
  '/v1/run',
  '/v1/runs',
  '/v1/runs/{id}',
  '/v1/screenshots/{runId}',
  '/v1/screenshots/{runId}/{id}/raw',
  '/v1/teams',
  '/v1/teams/invitations/accept',
  '/v1/teams/{id}',
  '/v1/teams/{id}/activity',
  '/v1/teams/{id}/invitations',
  '/v1/teams/{id}/members/{userId}',
  '/v1/teams/{id}/members/{userId}/reviewer',
  '/v1/teams/{id}/projects',
  '/v1/teams/{id}/projects/{projectId}',
  '/v1/teams/{id}/usage',
  '/v1/teams/{teamId}/projects/{projectId}/baseline',
  '/v1/teams/{teamId}/projects/{projectId}/runs',
  '/v1/teams/{teamId}/projects/{projectId}/runs/{runId}/review',
  '/v1/teams/{teamId}/projects/{projectId}/runs/{runId}/reviews',
  '/v1/usage',
]

const EXPECTED_METHODS: Record<string, string[]> = {
  '/health': ['get'],
  '/v1/baselines/{runId}/approve': ['post'],
  '/v1/dashboard': ['get'],
  '/v1/monitors': ['get', 'post'],
  '/v1/monitors/{id}': ['delete', 'get', 'patch'],
  '/v1/monitors/{id}/runs': ['get'],
  '/v1/monitors/{id}/snooze': ['post'],
  '/v1/monitors/{id}/test-alert': ['post'],
  '/v1/reports/{id}': ['get'],
  '/v1/run': ['post'],
  '/v1/runs': ['get'],
  '/v1/runs/{id}': ['delete', 'get'],
  '/v1/screenshots/{runId}': ['get'],
  '/v1/screenshots/{runId}/{id}/raw': ['get'],
  '/v1/teams': ['get', 'post'],
  '/v1/teams/invitations/accept': ['post'],
  '/v1/teams/{id}': ['delete', 'get', 'patch'],
  '/v1/teams/{id}/activity': ['get'],
  '/v1/teams/{id}/invitations': ['post'],
  '/v1/teams/{id}/members/{userId}': ['delete', 'patch'],
  '/v1/teams/{id}/members/{userId}/reviewer': ['patch'],
  '/v1/teams/{id}/projects': ['get', 'post'],
  '/v1/teams/{id}/projects/{projectId}': ['delete'],
  '/v1/teams/{id}/usage': ['get'],
  '/v1/teams/{teamId}/projects/{projectId}/baseline': ['get'],
  '/v1/teams/{teamId}/projects/{projectId}/runs': ['get'],
  '/v1/teams/{teamId}/projects/{projectId}/runs/{runId}/review': ['post'],
  '/v1/teams/{teamId}/projects/{projectId}/runs/{runId}/reviews': ['get'],
  '/v1/usage': ['get'],
}

function readSpec(): OpenApiDocument {
  return JSON.parse(fs.readFileSync(OPENAPI_PATH, 'utf8')) as OpenApiDocument
}

function operations(pathItem: PathItemObject): OperationObject[] {
  return Object.entries(pathItem)
    .filter(([method]) => HTTP_METHODS.has(method))
    .map(([, operation]) => operation as OperationObject)
}

describe('public OpenAPI contract', () => {
  it('is valid OpenAPI 3.1', async () => {
    const result = await validate(readSpec())
    if (!result.valid) {
      throw new Error(compileErrors(result))
    }
    expect(result.specification).toBe('OpenAPI')
  })

  it('declares bearerAuth and applies it to every /v1 operation only', () => {
    const spec = readSpec()
    expect(spec.components?.securitySchemes?.bearerAuth).toEqual(
      expect.objectContaining({
        type: 'http',
        scheme: 'bearer',
      }),
    )

    for (const [route, pathItem] of Object.entries(spec.paths)) {
      for (const operation of operations(pathItem)) {
        if (route.startsWith('/v1/')) {
          expect(operation.security, `${route} must require bearerAuth`).toEqual([{ bearerAuth: [] }])
        } else {
          expect(operation.security, `${route} must remain public`).toEqual([])
        }
      }
    }
  })

  it('includes only the agent-facing route surface', () => {
    const paths = Object.keys(readSpec().paths).sort()
    expect(paths).toEqual([...EXPECTED_PATHS].sort())
  })

  it('documents the real HTTP methods and common /v1 guard responses', () => {
    const spec = readSpec()

    for (const [route, expectedMethods] of Object.entries(EXPECTED_METHODS)) {
      const methods = Object.keys(spec.paths[route])
        .filter((method) => HTTP_METHODS.has(method))
        .sort()
      expect(methods, `${route} methods`).toEqual([...expectedMethods].sort())

      if (route.startsWith('/v1/')) {
        for (const method of methods) {
          const responses = (spec.paths[route][method] as OperationObject).responses
          expect(responses, `${method.toUpperCase()} ${route} responses`).toEqual(
            expect.objectContaining({
              '401': expect.any(Object),
              '429': expect.any(Object),
              '503': expect.any(Object),
            }),
          )
        }
      }
    }
  })

  it('excludes internal auth, billing, key-bootstrap, and browser dashboard paths', () => {
    const forbidden = ['/auth', '/v1/billing', '/v1/keys', '/dashboard']
    for (const route of Object.keys(readSpec().paths)) {
      for (const prefix of forbidden) {
        expect(route === prefix || route.startsWith(`${prefix}/`), `${route} must not expose ${prefix}`).toBe(false)
      }
    }
  })
})
