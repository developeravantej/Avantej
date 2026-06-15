/**
 * Notification Dispatch — Unit Tests (pure decision helpers)
 *
 * `runNotificationEmailDispatch` is IO-heavy (per-org tenant DB transactions,
 * FOR UPDATE SKIP LOCKED claiming, Resend). The claim/lock behaviour belongs
 * in an integration spec against a live branch. What CAN and SHOULD be pinned
 * here are the pure decision rules the dispatcher relies on — each one a
 * security or correctness invariant called out in the service header:
 *
 *   - sanitizeEmailSubject  (SI-010: CRLF header-injection guard)
 *   - escapeHtml            (HTML body escaping)
 *   - resolveBatchSize      (SI-001: batch cap precedence + invalid-env guard)
 *   - isEmailEnabled        (NAP-02: opt-out default)
 *   - isStaleNotification   (NAP-08: >24h stale-row warning threshold)
 *
 * Run: bun test src/services/notification-dispatch.service.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
	escapeHtml,
	isEmailEnabled,
	isStaleNotification,
	resolveBatchSize,
	sanitizeEmailSubject,
} from "./notification-dispatch.service";

describe("sanitizeEmailSubject — SI-010 CRLF injection guard", () => {
	test("passes a clean subject through unchanged", () => {
		expect(sanitizeEmailSubject("New announcement")).toBe("New announcement");
	});

	test("collapses CR/LF (and runs of them) into a single space", () => {
		expect(sanitizeEmailSubject("Subject\r\nBcc: evil@x.com")).toBe(
			"Subject Bcc: evil@x.com",
		);
		expect(sanitizeEmailSubject("a\n\n\nb")).toBe("a b");
		expect(sanitizeEmailSubject("a\r\rb")).toBe("a b");
	});

	test("strips a lone CR or LF used to smuggle headers", () => {
		expect(sanitizeEmailSubject("hi\nX-Injected: 1")).not.toContain("\n");
		expect(sanitizeEmailSubject("hi\rX-Injected: 1")).not.toContain("\r");
	});

	test("caps length at 200 chars", () => {
		const long = "x".repeat(500);
		expect(sanitizeEmailSubject(long)).toHaveLength(200);
	});
});

describe("escapeHtml — body escaping", () => {
	test("escapes all five entities", () => {
		expect(escapeHtml(`<a href="x" class='y'>&</a>`)).toBe(
			"&lt;a href=&quot;x&quot; class=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
		);
	});

	test("escapes ampersand first so existing entities are not double-mangled into invalid output", () => {
		// "&lt;" in the input becomes "&amp;lt;" — & is escaped before <.
		expect(escapeHtml("&lt;")).toBe("&amp;lt;");
	});

	test("leaves plain text untouched", () => {
		expect(escapeHtml("Hello world 123")).toBe("Hello world 123");
	});
});

describe("resolveBatchSize — SI-001 cap precedence", () => {
	test("explicit override wins over env and default", () => {
		expect(resolveBatchSize({ override: 5, envValue: "999" })).toBe(5);
	});

	test("override of 0 is honoured (explicit caller intent, not falsy-coerced)", () => {
		expect(resolveBatchSize({ override: 0 })).toBe(0);
	});

	test("uses a valid positive env value when no override", () => {
		expect(resolveBatchSize({ envValue: "350" })).toBe(350);
	});

	test("falls back to default (200) when env is unset", () => {
		expect(resolveBatchSize({})).toBe(200);
		expect(resolveBatchSize({ envValue: undefined })).toBe(200);
	});

	test("falls back to default for non-numeric / non-positive env (no NaN LIMIT)", () => {
		expect(resolveBatchSize({ envValue: "abc" })).toBe(200);
		expect(resolveBatchSize({ envValue: "0" })).toBe(200);
		expect(resolveBatchSize({ envValue: "-10" })).toBe(200);
		expect(resolveBatchSize({ envValue: "" })).toBe(200);
	});
});

describe("isEmailEnabled — NAP-02 opt-out default", () => {
	test("absent preference (undefined/null) defaults to enabled", () => {
		expect(isEmailEnabled(undefined)).toBe(true);
		expect(isEmailEnabled(null)).toBe(true);
	});

	test("explicit true stays enabled", () => {
		expect(isEmailEnabled(true)).toBe(true);
	});

	test("explicit false suppresses", () => {
		expect(isEmailEnabled(false)).toBe(false);
	});
});

describe("isStaleNotification — NAP-08 24h threshold", () => {
	const now = new Date("2026-06-02T12:00:00Z");
	const DAY = 24 * 60 * 60 * 1000;

	test("a row older than 24h is stale", () => {
		expect(isStaleNotification(new Date(now.getTime() - DAY - 1), now)).toBe(
			true,
		);
	});

	test("a row younger than 24h is not stale", () => {
		expect(isStaleNotification(new Date(now.getTime() - DAY + 1000), now)).toBe(
			false,
		);
	});

	test("exactly at the 24h boundary is NOT stale (strictly older required)", () => {
		expect(isStaleNotification(new Date(now.getTime() - DAY), now)).toBe(false);
	});

	test("a custom threshold is honoured", () => {
		const oneHour = 60 * 60 * 1000;
		expect(
			isStaleNotification(new Date(now.getTime() - 2 * oneHour), now, oneHour),
		).toBe(true);
	});
});
