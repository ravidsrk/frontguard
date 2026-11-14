#!/usr/bin/env node
/**
 * Keep the cloud-api OpenAPI bundle aligned with the public web contract.
 * Source of truth: apps/web/public/openapi.json
 *
 *   node scripts/sync-openapi.mjs           # copy the web contract onto cloud-api
 *   node scripts/sync-openapi.mjs --check   # exit 1 if the two differ (npm run check:openapi)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'apps/web/public/openapi.json')
const target = path.join(root, 'packages/cloud-api/src/openapi.json')
const check = process.argv.includes('--check')

if (!fs.existsSync(source)) {
  console.error(`sync-openapi: missing source ${source}`)
  process.exit(1)
}

const spec = fs.readFileSync(source, 'utf8')
const previous = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
if (spec === previous) {
  if (check) console.log(`sync-openapi: ${path.relative(root, target)} matches ${path.relative(root, source)}`)
  process.exit(0)
}

if (check) {
  console.error(
    `sync-openapi: ${path.relative(root, target)} differs from ${path.relative(root, source)}. ` +
      'Run: node scripts/sync-openapi.mjs',
  )
  process.exit(1)
}

fs.writeFileSync(target, spec)
console.log(`sync-openapi: updated ${path.relative(root, target)}`)
