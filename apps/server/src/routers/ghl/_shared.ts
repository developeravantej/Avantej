/**
 * Shared helpers for the GHL router.
 */

export function getEnvVar(key: string): string | undefined {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const cloudflare = require("cloudflare:workers");
		return cloudflare.env?.[key];
	} catch {
		return process.env[key];
	}
}
