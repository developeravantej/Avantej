/**
 * Auth Email Integration Tests (End-to-End)
 *
 * Tests the complete email verification and password reset flow:
 * 1. User registration → verification email sent
 * 2. Email verification → user emailVerified flag updated
 * 3. Password reset → reset email sent → password reset successful
 *
 * Prerequisites:
 * 1. DATABASE_URL environment variable set
 * 2. BETTER_AUTH_SECRET environment variable set
 * 3. RESEND_API_KEY environment variable set
 * 4. RESEND_FROM_EMAIL environment variable set
 * 5. TEST_EMAIL_RECIPIENT environment variable set (recipient email)
 *
 * Run with:
 * ```bash
 * cd apps/server
 * bun test src/tests/integration/auth-email.test.ts
 * ```
 *
 * Skip integration tests:
 * ```bash
 * SKIP_INTEGRATION_TESTS=true bun test src/tests/integration/auth-email.test.ts
 * ```
 */

import {
	describe,
	test,
	expect,
	beforeAll,
	afterAll,
	beforeEach,
} from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { auth } from "@/lib/better-auth";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { user, verification } from "@avantej-core/db/schema/auth";
import { eq } from "drizzle-orm";
import {
	__setEmailCaptureEnabled,
	__clearEmailCaptures,
	__getCapturedEmails,
} from "@/lib/email";
import {
	sendVerificationEmail,
	verifyEmailToken,
	sendPasswordResetEmail,
	resetPassword,
} from "@/services/auth.service";
import { SignJWT } from "jose";

neonConfig.webSocketConstructor = ws;

// Load .dev.vars
function loadDevVars(): Record<string, string> {
	const devVarsPath = join(import.meta.dir, "../../../.dev.vars");
	const content = readFileSync(devVarsPath, "utf-8");
	const vars: Record<string, string> = {};

	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const match = trimmed.match(/^([^=]+)=(.*)$/);
		if (match) {
			const [, key, value] = match;
			vars[key!] = value!;
		}
	}

	// Set environment variables in process.env
	for (const [key, value] of Object.entries(vars)) {
		if (!process.env[key]) {
			process.env[key] = value;
		}
	}

	return vars;
}

function createControlPanelDb(databaseUrl: string) {
	const pool = new Pool({ connectionString: databaseUrl });
	return drizzle({ client: pool, schema: controlPanelSchema });
}

type _CapturedEmail = ReturnType<typeof __getCapturedEmails>[number];
const __keepCapturedEmail: _CapturedEmail | undefined = undefined;
void __keepCapturedEmail;

function getLatestCapturedToken(
	to: string,
	type: "verification" | "password-reset",
): string | undefined {
	const emails = __getCapturedEmails(type).filter((email) => email.to === to);
	return emails.length ? emails[emails.length - 1]!.metadata?.token : undefined;
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Auth Email Integration Tests (End-to-End)", () => {
	const testTimestamp = Date.now();
	const testPassword = "TestPassword123!";
	const testName = "Test User";

	let controlPanelDb: ReturnType<typeof createControlPanelDb>;
	let controlPanelPool: Pool | undefined;
	let testUserId: string;
	let testRecipientEmail: string;
	let testEmail: string; // Will be set to verified email in beforeAll

	beforeAll(() => {
		if (process.env.SKIP_INTEGRATION_TESTS === "true") {
			console.log(
				"⏭️  Skipping integration tests (SKIP_INTEGRATION_TESTS=true)",
			);
			return;
		}

		const vars = loadDevVars();

		const databaseUrl = vars.DATABASE_URL;
		if (!databaseUrl) {
			throw new Error(
				"DATABASE_URL environment variable is required for integration tests",
			);
		}

		if (!vars.BETTER_AUTH_SECRET) {
			throw new Error(
				"BETTER_AUTH_SECRET environment variable is required for integration tests",
			);
		}

		if (!vars.RESEND_API_KEY) {
			throw new Error(
				"RESEND_API_KEY environment variable is required for integration tests",
			);
		}

		// Use verified email address for actual email sending
		// Resend test mode only allows sending to verified email addresses
		testRecipientEmail =
			vars.TEST_EMAIL_RECIPIENT ||
			vars.RESEND_FROM_EMAIL ||
			"developer.avantej@gmail.com";

		// Use the verified email for tests that need to send emails
		testEmail = testRecipientEmail;

		// Set environment variables
		process.env.DATABASE_URL = databaseUrl;
		process.env.BETTER_AUTH_SECRET = vars.BETTER_AUTH_SECRET;
		process.env.BETTER_AUTH_URL =
			vars.BETTER_AUTH_URL || "http://localhost:3000";
		process.env.RESEND_API_KEY = vars.RESEND_API_KEY;
		process.env.RESEND_FROM_EMAIL = vars.RESEND_FROM_EMAIL!;
		process.env.RESEND_FROM_NAME = vars.RESEND_FROM_NAME || "Avantej Core";

		const pool = new Pool({ connectionString: databaseUrl });
		controlPanelPool = pool;
		controlPanelDb = drizzle({ client: pool, schema: controlPanelSchema });

		console.log(`📧 Test emails will be sent to: ${testRecipientEmail}`);
		console.log(
			`📧 Using verified email for all email operations: ${testEmail}`,
		);

		__setEmailCaptureEnabled(true);
	});

	beforeEach(() => {
		if (process.env.SKIP_INTEGRATION_TESTS === "true") {
			return;
		}
		__clearEmailCaptures();
	});

	afterAll(async () => {
		if (process.env.SKIP_INTEGRATION_TESTS === "true") {
			return;
		}

		// Cleanup: Delete test user and verification tokens
		if (testUserId) {
			try {
				await controlPanelDb.delete(user).where(eq(user.id, testUserId));
				console.log(`🧹 Cleaned up test user: ${testEmail}`);
			} catch (error) {
				console.error("Failed to cleanup test user:", error);
			}
		}

		if (controlPanelPool) {
			await controlPanelPool.end();
		}

		__setEmailCaptureEnabled(false);
	});

	test("complete email verification flow", async () => {
		if (process.env.SKIP_INTEGRATION_TESTS === "true") {
			console.log("⏭️  Skipping integration test");
			return;
		}

		// Clean up any existing user with this email from previous test runs
		const existingUser = await controlPanelDb.query.user.findFirst({
			where: eq(user.email, testEmail),
		});
		if (existingUser) {
			await controlPanelDb.delete(user).where(eq(user.id, existingUser.id));
			console.log(`🧹 Cleaned up existing user: ${testEmail}`);
		}

		// Step 1: Register user via Better-Auth API
		// Using verified email address so Resend will actually send the email
		let registerResponse;
		try {
			registerResponse = await auth.api.signUpEmail({
				body: {
					email: testEmail,
					password: testPassword,
					name: `${testName} ${testTimestamp}`,
					firstName: testName,
					lastName: String(testTimestamp),
				},
				headers: new Headers(),
			});
			expect(registerResponse).toBeDefined();
			expect(registerResponse.user).toBeDefined();
			testUserId = registerResponse.user.id;
			console.log(`✅ User registered: ${testEmail} (${testUserId})`);
			console.log(`📧 Verification email should be sent to: ${testEmail}`);
		} catch (error) {
			console.error(
				`❌ Signup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			throw error; // Fail the test if signup fails
		}

		// Step 2: Verify user is created but email not verified
		const userRecord = await controlPanelDb.query.user.findFirst({
			where: eq(user.email, testEmail),
		});

		expect(userRecord).toBeDefined();
		expect(userRecord?.emailVerified).toBe(false);
		console.log(`✅ User created with emailVerified=false`);

		// Step 3: Capture verification token from email and verify user
		await wait(1500); // Allow some time for email delivery/capture
		const verificationToken = getLatestCapturedToken(testEmail, "verification");
		if (!verificationToken) {
			throw new Error(
				"Verification token not captured - email sending may have failed",
			);
		}

		console.log(`✅ Captured verification token for ${testEmail}`);
		const verifiedUserId = await verifyEmailToken(verificationToken);
		expect(verifiedUserId).toBe(testUserId);

		// Step 4: Verify user emailVerified flag is updated
		const verifiedUser = await controlPanelDb.query.user.findFirst({
			where: eq(user.id, testUserId),
		});

		expect(verifiedUser?.emailVerified).toBe(true);
		console.log(`✅ Email verified successfully`);
	});

	test("resend verification email", async () => {
		if (process.env.SKIP_INTEGRATION_TESTS === "true") {
			console.log("⏭️  Skipping integration test");
			return;
		}

		// Create a test user with unverified email using verified email address
		// This ensures Resend will actually send the email
		const userId = crypto.randomUUID();
		const testEmailResend = testRecipientEmail; // Use verified email

		// Clean up any existing user first
		const existingUser = await controlPanelDb.query.user.findFirst({
			where: eq(user.email, testEmailResend),
		});
		if (existingUser) {
			await controlPanelDb.delete(user).where(eq(user.id, existingUser.id));
		}

		await controlPanelDb.insert(user).values({
			id: userId,
			email: testEmailResend,
			name: `Test Resend ${testTimestamp}`,
			firstName: "Test",
			lastName: `Resend ${testTimestamp}`,
			emailVerified: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		// Send verification email
		// Using verified email address so Resend will send successfully
		await sendVerificationEmail(userId, testEmailResend);
		console.log(`✅ Verification email sent successfully`);
		console.log(
			`📧 Check your inbox at ${testEmailResend} for the verification email!`,
		);

		await wait(1000);
		const verificationToken = getLatestCapturedToken(
			testEmailResend,
			"verification",
		);
		expect(verificationToken).toBeDefined();
		console.log(`✅ Verification token captured successfully`);

		// Cleanup
		await controlPanelDb.delete(user).where(eq(user.id, userId));
	});

	test("complete password reset flow", async () => {
		if (process.env.SKIP_INTEGRATION_TESTS === "true") {
			console.log("⏭️  Skipping integration test");
			return;
		}

		// Step 1: Create a test user with verified email using verified email address
		// This ensures Resend will actually send the email
		const userId = crypto.randomUUID();
		const testEmailReset = testRecipientEmail; // Use verified email

		// Clean up any existing user first
		const existingUser = await controlPanelDb.query.user.findFirst({
			where: eq(user.email, testEmailReset),
		});
		if (existingUser) {
			await controlPanelDb.delete(user).where(eq(user.id, existingUser.id));
		}

		await controlPanelDb.insert(user).values({
			id: userId,
			email: testEmailReset,
			name: `Test Reset ${testTimestamp}`,
			firstName: "Test",
			lastName: `Reset ${testTimestamp}`,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		// Step 2: Request password reset
		// Using verified email address so Resend will send successfully
		await sendPasswordResetEmail(testEmailReset);
		console.log(`✅ Password reset email sent successfully`);
		console.log(
			`📧 Check your inbox at ${testEmailReset} for the password reset email!`,
		);

		// Wait a moment for token to be created
		await wait(1000);

		// Step 3: Find password reset token in database using captured token
		const resetToken = getLatestCapturedToken(testEmailReset, "password-reset");
		expect(resetToken).toBeDefined();
		console.log(`✅ Password reset token captured successfully`);

		const resetTokenRecord = await controlPanelDb.query.verification.findFirst({
			where: eq(verification.identifier, `reset-password:${resetToken}`),
		});
		expect(resetTokenRecord).toBeDefined();
		console.log(`✅ Password reset token found in database`);

		// Step 4: Reset password using token
		const newPassword = "NewPassword123!";
		await expect(
			resetPassword(resetToken!, newPassword),
		).resolves.toBeUndefined();

		console.log(`✅ Password reset successful`);

		// Step 5: Verify token is deleted after use
		const deletedToken = await controlPanelDb.query.verification.findFirst({
			where: eq(verification.id, resetTokenRecord!.id),
		});

		expect(deletedToken).toBeUndefined();
		console.log(`✅ Password reset token deleted after use`);

		// Cleanup
		await controlPanelDb.delete(user).where(eq(user.id, userId));
	});

	test("handles invalid verification token", async () => {
		if (process.env.SKIP_INTEGRATION_TESTS === "true") {
			console.log("⏭️  Skipping integration test");
			return;
		}

		await expect(verifyEmailToken("invalid-token-123")).rejects.toThrow(
			/Invalid token|invalid_token/i,
		);
	});

	test("handles expired verification token", async () => {
		if (process.env.SKIP_INTEGRATION_TESTS === "true") {
			console.log("⏭️  Skipping integration test");
			return;
		}

		// Create an expired verification token
		const userId = crypto.randomUUID();
		const testEmailExpired = `test-expired-${testTimestamp}@example.com`;

		await controlPanelDb.insert(user).values({
			id: userId,
			email: testEmailExpired,
			name: "Test Expired",
			firstName: "Test",
			lastName: "Expired",
			emailVerified: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const secret = process.env.BETTER_AUTH_SECRET;
		if (!secret) {
			throw new Error("BETTER_AUTH_SECRET environment variable is required");
		}

		const expiredToken = await new SignJWT({
			email: testEmailExpired,
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
			.setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
			.sign(new TextEncoder().encode(secret));

		await expect(verifyEmailToken(expiredToken)).rejects.toThrow(
			/Token expired|token_expired/i,
		);

		// Cleanup
		await controlPanelDb.delete(user).where(eq(user.id, userId));
	});
});
