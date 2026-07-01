import { describe, expect, test } from "bun:test";
import { mapCfDomainStatus } from "./cf-domain-status";

describe("mapCfDomainStatus", () => {
	test("null/undefined → pending", () => {
		expect(mapCfDomainStatus(null)).toBe("pending");
		expect(mapCfDomainStatus(undefined)).toBe("pending");
	});

	test("aggregate status active/verified → verified", () => {
		expect(mapCfDomainStatus({ status: "active" })).toBe("verified");
		expect(mapCfDomainStatus({ status: "verified" })).toBe("verified");
		expect(mapCfDomainStatus({ status: "VERIFIED" })).toBe("verified");
	});

	test("aggregate status failed/error/moved → failed", () => {
		expect(mapCfDomainStatus({ status: "failed" })).toBe("failed");
		expect(mapCfDomainStatus({ status: "error" })).toBe("failed");
		expect(mapCfDomainStatus({ status: "moved" })).toBe("failed");
	});

	// The live-observed shape: CF list/get returns no `status` field and no
	// per-record validation, only `enabled`. For a zone in our account that means
	// ready-to-send → verified (regression guard: previously mapped to verifying,
	// which stranded default-tier domains and blocked dispatch).
	test("enabled with no status/records → verified", () => {
		expect(mapCfDomainStatus({ enabled: true })).toBe("verified");
	});

	test("not enabled, no signal → pending", () => {
		expect(mapCfDomainStatus({ enabled: false })).toBe("pending");
		expect(mapCfDomainStatus({})).toBe("pending");
	});

	test("dns_records all valid → verified", () => {
		expect(
			mapCfDomainStatus({
				dns_records: [{ status: "valid" }, { status: "active" }],
			}),
		).toBe("verified");
	});

	test("dns_records still propagating → verifying", () => {
		expect(
			mapCfDomainStatus({
				dns_records: [{ status: "valid" }, { status: "pending" }],
			}),
		).toBe("verifying");
	});

	test("dns_records with a hard failure → failed", () => {
		expect(
			mapCfDomainStatus({
				dns_records: [{ status: "valid" }, { status: "failed" }],
			}),
		).toBe("failed");
	});
});
