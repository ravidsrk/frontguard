import pkg from '../package.json';

/**
 * Canonical product version for the cloud-api, sourced from package.json so
 * every version string the service emits tracks releases automatically.
 *
 * Importing this single constant — instead of hardcoding a SemVer literal —
 * is what keeps the `/health` response, the HTML report footer, and the OTLP
 * metrics scope in lockstep with the published package (cloud-9, P2-3). The
 * `version-drift.test.ts` guard fails the build if any SemVer literal under
 * `src/` ever disagrees with package.json again.
 */
export const PACKAGE_VERSION: string = (pkg as { version: string }).version;
