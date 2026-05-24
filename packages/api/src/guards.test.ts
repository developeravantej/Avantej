import { describe, expect, it } from "bun:test";
import { ORPCError } from "@orpc/server";
import { PermissionDeniedError } from "@avantej-core/services";
import { guardBranchAccessible, mapToOrpcForbidden } from "./guards";

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

describe("guardBranchAccessible", () => {
	it("allows branch in scope", () => {
		expect(() =>
			guardBranchAccessible("branch-1", ["branch-1", "branch-2"]),
		).not.toThrow();
	});

	it("throws FORBIDDEN when branch is out of scope", () => {
		expect(() =>
			guardBranchAccessible("branch-x", ["branch-1"]),
		).toThrowError(
			expect.objectContaining({ code: "FORBIDDEN" }),
		);
	});

	it("skips when branchId is null", () => {
		expect(() => guardBranchAccessible(null, ["branch-1"])).not.toThrow();
	});
});
