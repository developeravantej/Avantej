import { describe, expect, it } from "bun:test";
import { ORPCError } from "@orpc/server";
import { PermissionDeniedError } from "@avantej-core/services";
import { mapToOrpcForbidden } from "./guards";

describe("mapToOrpcForbidden", () => {
	it("maps PermissionDeniedError to ORPCError FORBIDDEN", () => {
		try {
			mapToOrpcForbidden(
				new PermissionDeniedError("reports", "read", "staff"),
			);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(ORPCError);
			expect((error as ORPCError).code).toBe("FORBIDDEN");
		}
	});

	it("maps legacy permission denied messages", () => {
		try {
			mapToOrpcForbidden(
				new Error("Permission denied: staff role does not have sales:read permission"),
			);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(ORPCError);
		}
	});

	it("rethrows unrelated errors", () => {
		expect(() => mapToOrpcForbidden(new Error("db down"))).toThrow("db down");
	});
});
