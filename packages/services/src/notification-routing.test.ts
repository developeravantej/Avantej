import { describe, test, expect } from "bun:test";
import {
	NOTIFICATION_TYPES,
	SUBJECT_TOKENS,
	renderSubjectTemplate,
	sanitizeSubject,
} from "./notification-routing";

describe("NOTIFICATION_TYPES", () => {
	test("contains the five tenant-facing types", () => {
		expect(NOTIFICATION_TYPES).toEqual([
			"member_invitation",
			"payment_receipt",
			"auth_verification",
			"auth_password_reset",
			"auth_magic_link",
		]);
	});
});

describe("SUBJECT_TOKENS", () => {
	test("has an entry for every notification type", () => {
		for (const type of NOTIFICATION_TYPES) {
			expect(Array.isArray(SUBJECT_TOKENS[type])).toBe(true);
		}
	});

	test("documents the expected tokens per type", () => {
		expect(SUBJECT_TOKENS.member_invitation).toEqual([
			"organizationName",
			"role",
			"inviterName",
		]);
		expect(SUBJECT_TOKENS.payment_receipt).toEqual(["amount", "appointmentId"]);
		expect(SUBJECT_TOKENS.auth_verification).toEqual(["appName"]);
		expect(SUBJECT_TOKENS.auth_password_reset).toEqual(["appName"]);
		expect(SUBJECT_TOKENS.auth_magic_link).toEqual(["appName"]);
	});
});

describe("renderSubjectTemplate", () => {
	test("substitutes known tokens", () => {
		expect(renderSubjectTemplate("Payment receipt — {amount}", { amount: "MYR 50.00" }))
			.toBe("Payment receipt — MYR 50.00");
	});

	test("replaces unknown / missing tokens with empty string", () => {
		expect(renderSubjectTemplate("Hi {orgName} {missing}", { orgName: "Acme" }))
			.toBe("Hi Acme ");
	});

	test("leaves a template with no tokens unchanged", () => {
		expect(renderSubjectTemplate("Verify your email", {})).toBe("Verify your email");
	});
});

describe("sanitizeSubject", () => {
	test("strips CR/LF/tab and other control chars", () => {
		expect(sanitizeSubject("Hello\r\nBcc: evil@x.com")).toBe("Hello Bcc: evil@x.com");
	});

	test("strips control chars injected via a token value (post-interpolation)", () => {
		const rendered = renderSubjectTemplate("Hi {name}", { name: "Bob\r\nSubject: x" });
		expect(sanitizeSubject(rendered)).toBe("Hi Bob Subject: x");
	});

	test("collapses whitespace, trims, and caps length at 255", () => {
		const long = "a".repeat(300);
		expect(sanitizeSubject(`  ${long}  `).length).toBe(255);
	});
});
