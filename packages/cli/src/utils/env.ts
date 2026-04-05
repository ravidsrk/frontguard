/**
 * Validate that required environment variables are set.
 * Logs warnings for optional but recommended vars.
 */
export function validateEnv(options: {
  required?: string[];
  recommended?: string[];
}): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const key of options.required ?? []) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  for (const key of options.recommended ?? []) {
    if (!process.env[key]) {
      // Only warn, don't fail
      if (process.env.FRONTGUARD_DEBUG) {
        console.error(`[frontguard] Warning: ${key} not set. Some features may be unavailable.`);
      }
    }
  }

  return { valid: missing.length === 0, missing };
}
