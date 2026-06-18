import { describe, test, expect } from "bun:test";
import { handleDbError } from "@avantej-core/services/lib/pg-error";

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
});
