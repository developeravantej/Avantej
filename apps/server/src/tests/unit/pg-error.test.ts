import { describe, test, expect } from "bun:test";
import {
	getPgErrorCode,
	handleDbError,
} from "@avantej-core/services/lib/pg-error";

function makePgError(
	code: string,
	message = "db error",
): Error & { code: string } {
	const err = new Error(message) as Error & { code: string };
	err.code = code;
	return err;
}

describe("handleDbError", () => {
	test("maps PG code 23503 (FK violation) to ORPCError BAD_REQUEST", () => {
		const err = makePgError("23503");
		expect(() => handleDbError(err, "MyContext")).toThrow(
			expect.objectContaining({ code: "BAD_REQUEST" }),
		);
	});

	test("maps PG code 23505 (unique violation) to ORPCError CONFLICT", () => {
		const err = makePgError("23505");
		expect(() => handleDbError(err, "MyContext")).toThrow(
			expect.objectContaining({ code: "CONFLICT" }),
		);
	});

	test("re-throws non-PG errors as-is", () => {
		const original = new Error("network timeout");
		expect(() => handleDbError(original, "MyContext")).toThrow(original);
	});

	test("re-throws plain objects (non-Error) as-is", () => {
		const original = { message: "some raw throw" };
		expect(() => handleDbError(original, "MyContext")).toThrow();
	});

	test("includes context string in BAD_REQUEST message for 23503", () => {
		const err = makePgError("23503");
		expect(() => handleDbError(err, "OrderService")).toThrow(
			expect.objectContaining({
				code: "BAD_REQUEST",
				message: expect.stringContaining("OrderService"),
			}),
		);
	});

	test("includes context string in CONFLICT message for 23505", () => {
		const err = makePgError("23505");
		expect(() => handleDbError(err, "OrderService")).toThrow(
			expect.objectContaining({
				code: "CONFLICT",
				message: expect.stringContaining("OrderService"),
			}),
		);
	});

	test("walks Drizzle-wrapped error (code on .cause) to CONFLICT for 23505", () => {
		// Drizzle throws DrizzleQueryError; the real pg code lives on `.cause`.
		const wrapped = new Error("Failed query: insert into …") as Error & {
			cause: unknown;
		};
		wrapped.cause = makePgError("23505", "duplicate key value");
		expect(() => handleDbError(wrapped, "MyContext")).toThrow(
			expect.objectContaining({ code: "CONFLICT" }),
		);
	});

	test("walks a nested .cause chain to find the pg code", () => {
		const inner = makePgError("23503", "fk violation");
		const mid = new Error("mid") as Error & { cause: unknown };
		mid.cause = inner;
		const outer = new Error("outer") as Error & { cause: unknown };
		outer.cause = mid;
		expect(() => handleDbError(outer, "MyContext")).toThrow(
			expect.objectContaining({ code: "BAD_REQUEST" }),
		);
	});
});

describe("getPgErrorCode", () => {
	test("returns top-level code when present", () => {
		expect(getPgErrorCode(makePgError("23505"))).toBe("23505");
	});

	test("returns the code from a wrapped .cause", () => {
		const wrapped = new Error("wrapper") as Error & { cause: unknown };
		wrapped.cause = makePgError("23514");
		expect(getPgErrorCode(wrapped)).toBe("23514");
	});

	test("returns undefined when no pg code exists in the chain", () => {
		expect(getPgErrorCode(new Error("plain"))).toBeUndefined();
		expect(getPgErrorCode({ message: "raw" })).toBeUndefined();
		expect(getPgErrorCode(undefined)).toBeUndefined();
	});

	test("stops at bounded depth on a self-referential cause cycle", () => {
		const a = new Error("a") as Error & { cause: unknown };
		a.cause = a; // cycle
		expect(getPgErrorCode(a)).toBeUndefined();
	});
});
