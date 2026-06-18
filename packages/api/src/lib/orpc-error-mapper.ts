/**
 * oRPC error mapper — translates raw PostgreSQL driver errors into typed
 * ORPCError instances with human-readable messages.
 *
 * Typical use: wrap a service call inside a router handler's try/catch and
 * pass any caught error through `mapPgError(err)`. If the error is a
 * recognised PG SQLSTATE, you get back an `ORPCError` to throw; otherwise
 * `mapPgError` returns `null` and the caller can fall through to its
 * default error path.
 *
 * Currently handles:
 *   - 23P01 exclusion_violation  (e.g. trainer / room overlap, J3)
 *   - 23503 foreign_key_violation (RESTRICT-style delete blocks)
 *
 * Add codes here rather than scattering string-matching across routers.
 */

import { ORPCError } from "@orpc/server";

/**
 * Shape of pg / @neondatabase driver errors. They carry a top-level
 * `code` (SQLSTATE) plus optional `constraint`, `table`, `detail` fields.
 */
type PgLikeError = {
	code?: string;
	constraint?: string;
	table?: string;
	detail?: string;
	message?: string;
};

function isPgError(err: unknown): err is PgLikeError {
	if (!err || typeof err !== "object") return false;
	const e = err as Record<string, unknown>;
	return typeof e.code === "string";
}

/**
 * Try to find a PG-shaped error inside the given error, walking the standard
 * `cause` chain. Returns the deepest PG error found, or `null`.
 */
function findPgError(err: unknown): PgLikeError | null {
	let cur: unknown = err;
	for (let i = 0; i < 8 && cur; i++) {
		if (isPgError(cur)) return cur;
		if (cur && typeof cur === "object" && "cause" in cur) {
			cur = (cur as { cause: unknown }).cause;
			continue;
		}
		break;
	}
	return null;
}

/**
 * Pretty-print the subject of an exclusion violation when we recognise the
 * constraint name. Falls back to a generic message.
 */
function exclusionMessage(constraint: string | undefined): string {
	switch (constraint) {
		case "appointments_trainer_no_overlap":
			return "Conflict: trainer is already booked for an overlapping time.";
		case "appointments_room_no_overlap":
			return "Conflict: room is already booked for an overlapping time.";
		default:
			return "Conflict: another booking overlaps this time slot.";
	}
}

function fkRestrictMessage(
	constraint: string | undefined,
	detail: string | undefined,
): string {
	if (detail) {
		// PG detail is usually like: Key (id)=(...) is still referenced from table "x".
		return `Cannot delete — ${detail}`;
	}
	if (constraint) {
		return `Cannot delete — referenced by constraint "${constraint}".`;
	}
	return "Cannot delete — referenced by other rows.";
}

/**
 * Map a (possibly nested) PG error to a typed ORPCError. Returns `null` if
 * the error is not a recognised PG code so callers can fall through.
 */
export function mapPgError(err: unknown): ORPCError<string, unknown> | null {
	const pg = findPgError(err);
	if (!pg) return null;
	switch (pg.code) {
		case "23P01":
			return new ORPCError("CONFLICT", {
				message: exclusionMessage(pg.constraint),
			});
		case "23503":
			return new ORPCError("CONFLICT", {
				message: fkRestrictMessage(pg.constraint, pg.detail),
			});
		default:
			return null;
	}
}

/**
 * Convenience wrapper. Runs `fn`, and if it throws a PG error this mapper
 * recognises, re-throws it as a typed ORPCError. Otherwise the original
 * error is re-thrown so callers / outer try-catches see it unchanged.
 */
export async function withPgErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		const mapped = mapPgError(err);
		if (mapped) throw mapped;
		throw err;
	}
}
