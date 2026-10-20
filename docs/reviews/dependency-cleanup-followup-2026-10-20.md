# Follow-up dependency PR review: 2026-10-20

The Dependabot scan triggered by the configuration change in #323 opened nine
more PRs. Reviewed them against `main` at `a770dbb`. Seven updates are combined
here; two need separate compatibility work.

| PR | Disposition | Review finding |
| --- | --- | --- |
| [#324](https://github.com/ravidsrk/frontguard/pull/324) | Defer axe-core/playwright 4.14.0 | The published package requires Node >=22.12.0, while the CLI declares >=22. Restrict the CLI range to `~4.13.0` so fresh installs of this tree retain 4.13. Deliberately align the CLI engine, doctor and documentation requirements before adopting 4.14. The repository's higher development minimum does not change the published CLI contract. |
| [#325](https://github.com/ravidsrk/frontguard/pull/325) | Accept better-sqlite3 13.0.3 | The major release changes native bindings to N-API and supports Node 22. Verify real files produced by the CLI's old 11.10.0 driver, including saved fix patterns, rather than relying on the optional-driver fallback. |
| [#326](https://github.com/ravidsrk/frontguard/pull/326) | Accept Daytona SDK 0.225.0 with adapter fixes | The adapter's cast hid a call to `remove()`, which is absent from both SDK versions. Use the SDK's actual types and `delete()` API. Preserve the filesystem receiver when calling `uploadFile()`. Regression tests cover both operations. |
| [#327](https://github.com/ravidsrk/frontguard/pull/327) | Defer pixelmatch 8.0.0 | Keep the deterministic gate on 7.2.0 until the renderer fingerprint work in #303 and the migration evidence required by #284 are ready. A green dependency PR does not supply those measurements. |
| [#328](https://github.com/ravidsrk/frontguard/pull/328) | Accept tsx 4.23.15 | Patch changes address module loading and CJS interoperability. Config-loader tests and version-sync checks exercise the repository's use. |
| [#329](https://github.com/ravidsrk/frontguard/pull/329) | Accept ESLint 10.13.0 | The existing source passes the updated linter and typescript-eslint integration. No rules are disabled. |
| [#330](https://github.com/ravidsrk/frontguard/pull/330) | Accept testing-library/dom 10.4.2 | Patch update retains the DOM peer contract used by jest-dom and React Testing Library. Web tests pass. |
| [#331](https://github.com/ravidsrk/frontguard/pull/331) | Accept Vite 8.3.4 | Build, CSS and development-server fixes. Verify the production Worker build, hydrated routes and docs navigation. |
| [#332](https://github.com/ravidsrk/frontguard/pull/332) | Accept Wrangler 4.151.1 | Verify the local Worker using this exact version. The Cloudflare Vite plugin separately pins Wrangler 4.151.0; that transitive pin remains intact. |

## Native storage verification

Created two on-disk databases before replacing better-sqlite3 11.10.0 with
13.0.3. The test imports the native driver directly and checks its package
version, so a fallback cannot mask a failed native install.

- Reopened a table containing Unicode text and a binary blob; both values were
  identical. A new transaction succeeded and SQLite's integrity check was `ok`.
- Reopened a `FixPatternDB` file with one accepted fix recorded three times.
  Its patch, route, viewport and acceptance count survived. Recording it again
  increased the count from three to four, and the integrity check was `ok`.
- The embedded SQLite version changed from 3.49.2 to 3.53.4. The check ran on
  Linux ARM64 with Node 22.23.3; it does not establish compatibility on every
  supported platform. The [captured result](sqlite-upgrade-2026-10-20.json)
  records that scope.

## Validation

Clean installation, dependency-tree validation, workspace build, lint,
typecheck, version synchronization, documentation links and production audit
pass. Production audit reports zero vulnerabilities. The targeted Daytona and
storage tests pass (23 tests). The full workspace suite passes all 2,105 tests,
including the browser integration tests, with no skips.

The production Worker smoke check covers `/`, `/docs`, `/pricing`, `/privacy`,
`/terms` and `/status`, plus client-side docs navigation. Every route returns
200 with a heading and no browser page errors under Chromium 156.0.8078.4.

Daytona verification uses SDK types and offline adapter tests. No paid sandbox
was provisioned. This change neither deploys the gated cloud API nor changes
the pixel comparison or baseline approval policies.
