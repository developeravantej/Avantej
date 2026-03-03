/**
 * Email Service Unit Tests
 *
 * Tests email sending functionality with mocked Resend API.
 * No real emails are sent during these tests.
 *
 * Run with: bun test src/lib/email.test.ts
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// Set environment variables before importing email module
process.env.RESEND_API_KEY = "re_test_mock_key";
// Don't set RESEND_FROM_EMAIL and RESEND_FROM_NAME to test defaults

// Mock Resend before importing email module
const mockResendSend = mock(() => Promise.resolve({
	error: null,
	id: "mock-email-id-123",
}));

const mockResendInstance = {
	emails: {
		send: mockResendSend,
	},
};

// Mock the Resend module
mock.module("resend", () => {
	return {
		Resend: class MockResend {
			constructor(_apiKey: string) {
				// Accept any API key for testing
			}
			get emails() {
				return mockResendInstance.emails;
			}
		},
	};
});

import {
	sendEmail,
	sendVerificationEmail,
	sendPasswordResetEmail,
	sendInvitationEmail,
	type SendEmailOptions,
	__resetResendClient,
} from "./email";

beforeEach(() => {
	// Reset Resend client cache to force re-initialization with mock
	__resetResendClient();
	// Reset mock call history
	mockResendSend.mockClear();
});

describe("Email Service - sendEmail", () => {
	test("successfully sends email with correct parameters", async () => {
		const options: SendEmailOptions = {
			to: "test@example.com",
			subject: "Test Subject",
			html: "<p>Test HTML</p>",
		};

		await sendEmail(options);

		expect(mockResendSend).toHaveBeenCalledTimes(1);
		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.to).toEqual(["test@example.com"]);
		expect(callArgs.subject).toBe("Test Subject");
		expect(callArgs.html).toBe("<p>Test HTML</p>");
		expect(callArgs.text).toBe("Test HTML"); // Auto-generated from HTML
		expect(callArgs.from).toContain("Avantej Core");
		expect(callArgs.from).toContain("onboarding@resend.dev");
	});

	test("handles Resend API errors properly", async () => {
		mockResendSend.mockReturnValueOnce(Promise.resolve({
			error: {
				message: "Invalid API key",
			},
		}));

		await expect(
			sendEmail({
				to: "test@example.com",
				subject: "Test",
				html: "<p>Test</p>",
			})
		).rejects.toThrow("Failed to send email");
	});

	test("validates required fields", async () => {
		await expect(
			// @ts-expect-error - Testing invalid input
			sendEmail({})
		).rejects.toThrow("To, subject, and html are required");
	});

	test("uses default from email/name when not provided", async () => {
		await sendEmail({
			to: "test@example.com",
			subject: "Test",
			html: "<p>Test</p>",
		});

		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.from).toContain("Avantej Core");
		expect(callArgs.from).toContain("onboarding@resend.dev");
	});

	test("uses custom from email/name when provided", async () => {
		await sendEmail({
			to: "test@example.com",
			subject: "Test",
			html: "<p>Test</p>",
			from: "custom@example.com",
			fromName: "Custom Name",
		});

		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.from).toContain("Custom Name");
		expect(callArgs.from).toContain("custom@example.com");
	});

	test("generates text version from HTML when not provided", async () => {
		await sendEmail({
			to: "test@example.com",
			subject: "Test",
			html: "<p>Test <strong>HTML</strong></p>",
		});

		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.text).toBe("Test HTML"); // HTML tags stripped
	});

	test("handles multiple recipients (array of emails)", async () => {
		await sendEmail({
			to: ["test1@example.com", "test2@example.com"],
			subject: "Test",
			html: "<p>Test</p>",
		});

		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.to).toEqual(["test1@example.com", "test2@example.com"]);
	});
});

describe("Email Service - sendVerificationEmail", () => {
	test("sends email with correct subject and content", async () => {
		const verificationLink = "https://example.com/verify?token=abc123";
		// The implementation rewrites the link to point to the frontend UI
		const expectedLink = "http://localhost:3001/verify-email?token=abc123&callbackURL=%2Flogin";

		await sendVerificationEmail("test@example.com", verificationLink);

		expect(mockResendSend).toHaveBeenCalledTimes(1);
		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.to).toEqual(["test@example.com"]);
		expect(callArgs.subject).toBe("Verify Your Email Address - Avantej Core");
		expect(callArgs.html).toContain(expectedLink);
		expect(callArgs.html).toContain("Verify Your Email Address");
		expect(callArgs.text).toContain(expectedLink);
	});

	test("includes verification link in email", async () => {
		const verificationLink = "https://example.com/verify?token=xyz789";
		// The implementation rewrites the link to point to the frontend UI
		const expectedLink = "http://localhost:3001/verify-email?token=xyz789&callbackURL=%2Flogin";

		await sendVerificationEmail("test@example.com", verificationLink);

		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.html).toContain(expectedLink);
		expect(callArgs.html).toContain('href="' + expectedLink + '"');
	});

	test("includes user name when provided", async () => {
		const verificationLink = "https://example.com/verify?token=abc123";

		await sendVerificationEmail("test@example.com", verificationLink, "John Doe");

		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.html).toContain("Hi John Doe");
		expect(callArgs.text).toContain("Hi John Doe");
	});

	test("handles missing user name gracefully", async () => {
		const verificationLink = "https://example.com/verify?token=abc123";

		await sendVerificationEmail("test@example.com", verificationLink);

		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.html).toContain("Hi there,");
		expect(callArgs.text).toContain("Hi there,");
	});
});

describe("Email Service - sendPasswordResetEmail", () => {
	test("sends email with correct subject and content", async () => {
		const resetLink = "https://example.com/reset?token=abc123";

		await sendPasswordResetEmail("test@example.com", resetLink);

		expect(mockResendSend).toHaveBeenCalledTimes(1);
		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.to).toEqual(["test@example.com"]);
		expect(callArgs.subject).toBe("Reset Your Password - Avantej Core");
		expect(callArgs.html).toContain(resetLink);
		expect(callArgs.html).toContain("Reset Your Password");
		expect(callArgs.text).toContain(resetLink);
	});

	test("includes reset link in email", async () => {
		const resetLink = "https://example.com/reset?token=xyz789";

		await sendPasswordResetEmail("test@example.com", resetLink);

		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.html).toContain(resetLink);
		expect(callArgs.html).toContain('href="' + resetLink + '"');
	});

	test("includes user name when provided", async () => {
		const resetLink = "https://example.com/reset?token=abc123";

		await sendPasswordResetEmail("test@example.com", resetLink, "Jane Doe");

		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.html).toContain("Hi Jane Doe");
		expect(callArgs.text).toContain("Hi Jane Doe");
	});
});

describe("Email Service - sendInvitationEmail", () => {
	test("sends email with correct subject and content", async () => {
		const invitationLink = "https://example.com/accept?id=inv123";
		const organizationName = "Test Organization";

		await sendInvitationEmail(
			"invitee@example.com",
			invitationLink,
			organizationName
		);

		expect(mockResendSend).toHaveBeenCalledTimes(1);
		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.to).toEqual(["invitee@example.com"]);
		expect(callArgs.subject).toBe("You've been invited to join Test Organization");
		expect(callArgs.html).toContain(invitationLink);
		expect(callArgs.html).toContain(organizationName);
		expect(callArgs.text).toContain(invitationLink);
	});

	test("includes invitation link in email", async () => {
		const invitationLink = "https://example.com/accept?id=inv456";

		await sendInvitationEmail(
			"invitee@example.com",
			invitationLink,
			"Test Org"
		);

		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.html).toContain(invitationLink);
		expect(callArgs.html).toContain('href="' + invitationLink + '"');
	});

	test("includes organization name, inviter name, and role", async () => {
		const invitationLink = "https://example.com/accept?id=inv123";

		await sendInvitationEmail(
			"invitee@example.com",
			invitationLink,
			"Acme Corp",
			"John Manager",
			"admin"
		);

		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.html).toContain("Acme Corp");
		expect(callArgs.html).toContain("John Manager");
		expect(callArgs.html).toContain("admin");
		expect(callArgs.text).toContain("Acme Corp");
		expect(callArgs.text).toContain("John Manager");
		expect(callArgs.text).toContain("admin");
	});

	test("handles missing optional fields gracefully", async () => {
		const invitationLink = "https://example.com/accept?id=inv123";

		await sendInvitationEmail(
			"invitee@example.com",
			invitationLink,
			"Test Org"
		);

		const callArgs = mockResendSend.mock.calls[0][0];
		expect(callArgs.html).toContain("Test Org");
		expect(callArgs.html).not.toContain("undefined");
		expect(callArgs.text).toContain("Test Org");
	});
});

