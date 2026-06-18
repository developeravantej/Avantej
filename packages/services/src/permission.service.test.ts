import { describe, expect, it } from "bun:test";
import { PermissionDeniedError } from "./permission.service";

describe("PermissionDeniedError", () => {
	it("includes resource, action, and role in message", () => {
		const err = new PermissionDeniedError("sales", "read", "staff");
		expect(err.message).toContain("sales:read");
		expect(err.message).toContain("staff");
		expect(err.name).toBe("PermissionDeniedError");
	});
});
