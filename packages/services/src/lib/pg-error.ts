import { ORPCError } from "@orpc/server";

/**
 * Extract a PostgreSQL error `code` (e.g. "23505" unique-violation) from an
 * error that may be wrapped. Drizzle throws `DrizzleQueryError`, whose generic
 * message ("Failed query: …") does NOT carry the pg `.code` — the real pg error
 * lives on `.cause`, sometimes nested. Walk the cause chain and return the first
 * string `code` found. Prefer this over inspecting only the top-level `err.code`
 * or brittle `err.message.includes("duplicate key")` checks, which silently miss
 * the wrapped case and let the raw error surface as a 500.
 */
export function getPgErrorCode(err: unknown): string | undefined {
	let current: unknown = err;
	// Bound the walk so a self-referential cause chain can't loop forever.
	for (let depth = 0; current != null && depth < 5; depth++) {
		if (typeof current === "object") {
			const code = (current as { code?: unknown }).code;
			if (typeof code === "string" && code.length > 0) {
				return code;
			}
			current = (current as { cause?: unknown }).cause;
		} else {
			break;
		}
	}
	return undefined;
}

/**
 * Handles PostgreSQL constraint violation errors and maps them to typed ORPCErrors.
 * Throws ORPCError for known PG error codes, re-throws unknown errors.
 *
 * Uses {@link getPgErrorCode} so Drizzle-wrapped errors (real code on `.cause`)
 * are mapped too, not just errors carrying `.code` at the top level.
 */
export function handleDbError(err: unknown, context: string): never {
	const code = getPgErrorCode(err);
	if (code === "23503") {
		throw new ORPCError("BAD_REQUEST", {
			message: `${context}: referenced record not found`,
		});
	}
	if (code === "23505") {
		throw new ORPCError("CONFLICT", {
			message: `${context}: duplicate record`,
		});
	}
	if (code === "23514") {
		throw new ORPCError("BAD_REQUEST", {
			message: `${context}: check constraint violation`,
		});
	}
	throw err;
}
