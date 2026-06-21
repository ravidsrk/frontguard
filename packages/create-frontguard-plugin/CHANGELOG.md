# create-frontguard-plugin

## 0.2.2

### Patch Changes

- 3ef6b88: Production-close remediation release (0.2.1). Republishes npm artifacts with fixes from adversarial-fresh remediation PRs #73–#104 — config loader, MCP, Storybook, supply chain, docs hygiene, marketing claims. Patch semver; no breaking API changes.
- Upgrade the entire dependency stack to latest (majors included): TypeScript 6, ESLint 10, Zod 4, better-sqlite3 12, commander 15, jsdom 29, @types/node 26, React 19, Playwright 1.61, plus the minor/dev group and a security sweep (0 npm-audit advisories). No breaking change to the packages' public APIs; internal dependency bumps only.
