import { ORPCError } from "@orpc/server";

/**
 * Handles PostgreSQL constraint violation errors and maps them to typed ORPCErrors.
 * Throws ORPCError for known PG error codes, re-throws unknown errors.
 */
export function handleDbError(err: unknown, context: string): never {
	if (err instanceof Error && "code" in err) {
		const code = (err as any).code as string;
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
	}
	throw err;
}
