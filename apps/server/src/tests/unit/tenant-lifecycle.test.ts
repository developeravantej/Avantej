import { describe, expect, test } from "bun:test";
import {
	assertTransition,
	isAppBlocked,
} from "@/services/tenant-lifecycle.service";

/**
 * Pure-logic coverage for the C3 tenant lifecycle state machine (ADR-0024).
 * The DB-mutating transitionTenant / middleware wiring is exercised end-to-end
 * elsewhere; this guards the gate predicate + the legal-transition table — the
 * parts that decide whether a tenant is locked out and which admin ops are legal.
 */

describe("isAppBlocked (403 gate predicate)", () => {
	test("suspended and cancelled are app-blocked", () => {
		expect(isAppBlocked("suspended")).toBe(true);
		expect(isAppBlocked("cancelled")).toBe(true);
	});

	test("active / trial / past_due / unpaid / null are NOT blocked", () => {
		for (const status of [
			"active",
			"trial",
			"trialing",
			"past_due",
			"unpaid",
			null,
			undefined,
			"",
		]) {
			expect(isAppBlocked(status as string)).toBe(false);
		}
	});
});

describe("assertTransition (ADR-0024 legal-transition table)", () => {
	test("suspend is legal from any non-deleted state", () => {
		for (const from of ["trial", "active", "past_due", "suspended"]) {
			expect(() => assertTransition(from, "suspended")).not.toThrow();
		}
	});

	test("force-cancel is legal from any non-deleted state", () => {
		for (const from of [
			"trial",
			"active",
			"past_due",
			"suspended",
			"cancelled",
		]) {
			expect(() => assertTransition(from, "cancelled")).not.toThrow();
		}
	});

	test("resume / reTrial → active: legal from trial, suspended, active, past_due", () => {
		// reTrial clears prior suspension/past_due (ADR-0024 L115) and applies to
		// already-active tenants (L118-122) — the widened allowlist.
		for (const from of ["trial", "suspended", "active", "past_due"]) {
			expect(() => assertTransition(from, "active")).not.toThrow();
		}
	});

	test("cancelled → active is ILLEGAL (recovery requires a fresh subscription)", () => {
		expect(() => assertTransition("cancelled", "active")).toThrow();
	});

	test("webhook-only / non-admin targets are not governed here → illegal", () => {
		expect(() => assertTransition("active", "past_due")).toThrow();
		expect(() => assertTransition("active", "trial")).toThrow();
		expect(() => assertTransition("cancelled", "deleted")).toThrow();
	});
});
