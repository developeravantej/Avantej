/**
 * Email Service Integration Tests — Resend Sandbox
 *
 * Verifies that the email-sending functions in lib/email.ts successfully
 * deliver to the Resend API when using the onboarding@resend.dev sandbox
 * sender (configured in .dev.vars as RESEND_FROM_EMAIL).
 *
 * Unlike the older email.integration.test.ts which hardcoded an unverified
 * example.com sender and was effectively a no-op, this suite makes real
 * Resend API calls and asserts the returned id.
 *
 * Resend sandbox test addresses:
 *   delivered@resend.dev  — always accepted, simulates successful delivery
 *   bounced@resend.dev    — accepted, then emits a bounce webhook
 *
 * Any other recipient with the sandbox sender (onboarding@resend.dev) will
 * be 422'd unless the recipient domain is separately verified in Resend.
 *
 * Run: cd apps/server && bun test src/lib/email-resend.integration.test.ts
 * Skip: SKIP_INTEGRATION_TESTS=true bun test src/lib/email-resend.integration.test.ts
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { Resend } from "resend";
import {
	loadDevVars,
	shouldSkipIntegration,
} from "../tests/helpers/integration-setup";
import {
	sendVerificationEmail,
	sendPasswordResetEmail,
	__resetResendClient,
} from "./email";

// Load env vars before any module-level code touches process.env.
// shouldSkipIntegration() also calls loadDevVars() internally, but calling it
// here ensures RESEND_API_KEY is available for the Resend client below.
loadDevVars();

// ---------------------------------------------------------------------------
// Skip guard — honour SKIP_INTEGRATION_TESTS=true and missing RESEND_API_KEY
// ---------------------------------------------------------------------------
function shouldSkipEmailIntegration(): boolean {
	if (shouldSkipIntegration()) return true;
	// Integration setup checks TENANT_DATABASE_URL; email tests only need the
	// Resend key, so do an additional guard here.
	if (!process.env.RESEND_API_KEY) return true;
	return false;
}

describe("Email Service Integration Tests — Resend Sandbox", () => {
	const DELIVERED = "delivered@resend.dev";
	const BOUNCED = "bounced@resend.dev";
	const SANDBOX_FROM = "onboarding@resend.dev";

	beforeAll(() => {
		if (shouldSkipEmailIntegration()) {
			console.log(
				"[email-resend.integration] Skipping — SKIP_INTEGRATION_TESTS=true or RESEND_API_KEY missing"
			);
			return;
		}

		// Ensure the lazy-loaded Resend client picks up the freshly loaded key.
		__resetResendClient();

		// Force the sandbox sender so tests are self-contained regardless of what
		// .dev.vars has in RESEND_FROM_EMAIL.
		process.env.RESEND_FROM_EMAIL = SANDBOX_FROM;

		console.log(
			`[email-resend.integration] Using sandbox sender: ${SANDBOX_FROM}`
		);
	});

	// -------------------------------------------------------------------------
	// Test 1: sendEmail → delivered@resend.dev
	// Calls the Resend client directly to capture the returned message id.
	// -------------------------------------------------------------------------
	test("Resend client returns a message id when sending to delivered@resend.dev", async () => {
		if (shouldSkipEmailIntegration()) return;

		const resend = new Resend(process.env.RESEND_API_KEY!);
		const result = await resend.emails.send({
			from: `Avantej Test <${SANDBOX_FROM}>`,
			to: [DELIVERED],
			subject: "Sandbox delivery test",
			html: "<p>This is a sandbox delivery test from Avantej integration tests.</p>",
		});

		expect(result.error).toBeNull();
		expect(result.data).toBeTruthy();
		expect(typeof result.data?.id).toBe("string");
		expect(result.data?.id.length).toBeGreaterThan(0);

		console.log(
			`[email-resend.integration] delivered@resend.dev message id: ${result.data?.id}`
		);
	});

	// -------------------------------------------------------------------------
	// Test 2: sendEmail → bounced@resend.dev
	// Resend accepts the send (200), then emits a bounce webhook asynchronously.
	// The returned id proves the API accepted it.
	// -------------------------------------------------------------------------
	test("Resend client returns a message id when sending to bounced@resend.dev", async () => {
		if (shouldSkipEmailIntegration()) return;

		const resend = new Resend(process.env.RESEND_API_KEY!);
		const result = await resend.emails.send({
			from: `Avantej Test <${SANDBOX_FROM}>`,
			to: [BOUNCED],
			subject: "Sandbox bounce test",
			html: "<p>This is a sandbox bounce test. A bounce webhook will follow.</p>",
		});

		// Resend still accepts the request and returns an id — the bounce is
		// emitted asynchronously via webhook, not as an API error.
		expect(result.error).toBeNull();
		expect(result.data).toBeTruthy();
		expect(typeof result.data?.id).toBe("string");
		expect(result.data?.id.length).toBeGreaterThan(0);

		console.log(
			`[email-resend.integration] bounced@resend.dev message id: ${result.data?.id} (bounce webhook will follow)`
		);
	});

	// -------------------------------------------------------------------------
	// Test 3: sendVerificationEmail does not throw with sandbox sender
	// sendVerificationEmail calls sendEmail internally, which calls Resend.
	// sendEmail returns void, so we assert no exception is thrown.
	// -------------------------------------------------------------------------
	test("sendVerificationEmail completes without error using sandbox sender", async () => {
		if (shouldSkipEmailIntegration()) return;

		const verificationLink = `http://localhost:3021/verify-email?token=sandbox-test-${Date.now()}&callbackURL=/dashboard`;

		await expect(
			sendVerificationEmail(DELIVERED, verificationLink, "Sandbox User")
		).resolves.toBeUndefined();

		console.log(
			`[email-resend.integration] sendVerificationEmail completed for ${DELIVERED}`
		);
	});

	// -------------------------------------------------------------------------
	// Test 4: sendPasswordResetEmail does not throw with sandbox sender
	// -------------------------------------------------------------------------
	test("sendPasswordResetEmail completes without error using sandbox sender", async () => {
		if (shouldSkipEmailIntegration()) return;

		// Small delay to avoid Resend's 2 req/s rate limit.
		await new Promise((resolve) => setTimeout(resolve, 600));

		const resetLink = `http://localhost:3021/reset-password?token=sandbox-reset-${Date.now()}`;

		await expect(
			sendPasswordResetEmail(DELIVERED, resetLink, "Sandbox User")
		).resolves.toBeUndefined();

		console.log(
			`[email-resend.integration] sendPasswordResetEmail completed for ${DELIVERED}`
		);
	});

	// -------------------------------------------------------------------------
	// Test 5: sendEmail with an unverified non-sandbox recipient yields 422
	// Confirms the sandbox sender restriction is enforced by Resend.
	// -------------------------------------------------------------------------
	test("Resend rejects delivery to an unverified non-sandbox address with sandbox sender", async () => {
		if (shouldSkipEmailIntegration()) return;

		// Small delay to avoid rate limiting.
		await new Promise((resolve) => setTimeout(resolve, 600));

		const resend = new Resend(process.env.RESEND_API_KEY!);
		const result = await resend.emails.send({
			from: `Avantej Test <${SANDBOX_FROM}>`,
			to: ["unverified-recipient@example.com"],
			subject: "This should be rejected",
			html: "<p>Expect a 422 from Resend.</p>",
		});

		// Resend returns an error object rather than throwing for 422s.
		// If this assertion fails it means the account has verification set up
		// for example.com — report it but don't mask it.
		expect(result.error).not.toBeNull();
		console.log(
			`[email-resend.integration] unverified recipient correctly rejected: ${JSON.stringify(result.error)}`
		);
	});
});
