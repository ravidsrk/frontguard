#!/usr/bin/env node
/**
 * Keep the cloud-api OpenAPI bundle aligned with the public web contract.
 * Source of truth: apps/web/public/openapi.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'apps/web/public/openapi.json')
const target = path.join(root, 'packages/cloud-api/src/openapi.json')

if (!fs.existsSync(source)) {
  console.error(`sync-openapi: missing source ${source}`)
  process.exit(1)
}

const spec = fs.readFileSync(source, 'utf8')
const previous = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
if (spec === previous) {
  process.exit(0)
}

fs.writeFileSync(target, spec)
console.log(`sync-openapi: updated ${path.relative(root, target)}`)
