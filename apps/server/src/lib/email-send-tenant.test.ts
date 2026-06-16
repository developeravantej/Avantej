import { describe, test, expect, mock, beforeEach } from "bun:test";

// Force env vars BEFORE importing the module under test (which reads them
// lazily on first use, but Resend client init reads RESEND_API_KEY).
process.env.RESEND_API_KEY = "re_test_mock_key";
process.env.RESEND_FROM_EMAIL = "platform@example.com";
process.env.RESEND_FROM_NAME = "Platform";

// Mock Resend SDK.
const mockResendSend = mock(
	(..._args: unknown[]): unknown =>
		Promise.resolve({
			data: { id: "re_test_msg_123" },
			error: null,
		}),
);

mock.module("resend", () => ({
	Resend: class MockResend {
		constructor(_apiKey: string) {}
		get emails() {
			return { send: mockResendSend };
		}
	},
}));

// Mock service module so we can control the verified-domain lookup and
// inspect log writes without touching a real DB.
const mockGetVerified = mock(async (..._args: unknown[]): Promise<unknown> => null);
const mockRecordLog = mock(
	async (..._args: unknown[]): Promise<unknown> => ({ id: "log_1" }),
);

mock.module("@avantej-core/services/email-domain.service", () => ({
	getVerifiedEmailDomainForOrg: mockGetVerified,
	recordEmailLog: mockRecordLog,
}));

import { sendTenantEmail } from "./email-send-tenant";
import { __resetResendClient } from "./email";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const fakeDb = {} as never;

beforeEach(() => {
	__resetResendClient();
	mockResendSend.mockClear();
	mockGetVerified.mockClear();
	mockRecordLog.mockClear();
});

describe("sendTenantEmail — guard + fallback", () => {
	test("refuses when allowPlatformFallback=false and no verified domain", async () => {
		mockGetVerified.mockReturnValueOnce(Promise.resolve(null) as never);

		await expect(
			sendTenantEmail(fakeDb, {
				organizationId: ORG_ID,
				to: "recipient@example.com",
				subject: "Test",
				html: "<p>Test</p>",
				allowPlatformFallback: false,
			}),
		).rejects.toThrow(/No verified sending domain/);

		expect(mockResendSend).not.toHaveBeenCalled();
		expect(mockRecordLog).not.toHaveBeenCalled();
	});

	test("falls back to platform from-address when no verified domain", async () => {
		mockGetVerified.mockReturnValueOnce(Promise.resolve(null) as never);

		const result = await sendTenantEmail(fakeDb, {
			organizationId: ORG_ID,
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>Test</p>",
		});

		expect(result.usedFallback).toBe(true);
		expect(result.fromAddress).toContain("platform@example.com");
		expect(mockResendSend).toHaveBeenCalledTimes(1);
		const call = mockResendSend.mock.calls[0]![0] as { from: string; tags: unknown };
		expect(call.from).toContain("platform@example.com");
		expect(call.tags).toEqual([{ name: "organization_id", value: ORG_ID }]);
	});
});

describe("sendTenantEmail — verified domain + localPart precedence", () => {
	test("uses verified domain with default 'support' localPart when row has no defaultLocalPart", async () => {
		mockGetVerified.mockReturnValueOnce(
			Promise.resolve({
				id: "dom_1",
				domain: "mail.example.com",
				fromName: "Example Support",
				defaultLocalPart: null,
			}) as never,
		);

		const result = await sendTenantEmail(fakeDb, {
			organizationId: ORG_ID,
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>Test</p>",
		});

		expect(result.usedFallback).toBe(false);
		expect(result.fromAddress).toBe("Example Support <support@mail.example.com>");
	});

	test("row.defaultLocalPart overrides 'support' default", async () => {
		mockGetVerified.mockReturnValueOnce(
			Promise.resolve({
				id: "dom_1",
				domain: "mail.example.com",
				fromName: "Example",
				defaultLocalPart: "noreply",
			}) as never,
		);

		const result = await sendTenantEmail(fakeDb, {
			organizationId: ORG_ID,
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>Test</p>",
		});

		expect(result.fromAddress).toBe("Example <noreply@mail.example.com>");
	});

	test("params.localPart overrides BOTH row.defaultLocalPart and the 'support' default", async () => {
		mockGetVerified.mockReturnValueOnce(
			Promise.resolve({
				id: "dom_1",
				domain: "mail.example.com",
				fromName: "Example",
				defaultLocalPart: "noreply",
			}) as never,
		);

		const result = await sendTenantEmail(fakeDb, {
			organizationId: ORG_ID,
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>Test</p>",
			localPart: "billing",
		});

		expect(result.fromAddress).toBe("Example <billing@mail.example.com>");
	});
});

describe("sendTenantEmail — error_message on send failure", () => {
	test("writes a 'failed' log row and rethrows when Resend returns an error", async () => {
		mockGetVerified.mockReturnValueOnce(
			Promise.resolve({
				id: "dom_1",
				domain: "mail.example.com",
				fromName: "Example",
				defaultLocalPart: null,
			}) as never,
		);
		mockResendSend.mockReturnValueOnce(
			Promise.resolve({
				data: null,
				error: { message: "rate limited" },
			}) as never,
		);

		await expect(
			sendTenantEmail(fakeDb, {
				organizationId: ORG_ID,
				to: "recipient@example.com",
				subject: "Test",
				html: "<p>Test</p>",
			}),
		).rejects.toThrow(/rate limited/);

		expect(mockRecordLog).toHaveBeenCalledTimes(1);
		const logArgs = mockRecordLog.mock.calls[0]![1] as {
			status: string;
			errorMessage: string;
			resendMessageId: string;
		};
		expect(logArgs.status).toBe("failed");
		expect(logArgs.errorMessage).toBe("rate limited");
		expect(logArgs.resendMessageId.startsWith("failed:")).toBe(true);
	});

	test("writes a 'failed' log row and rethrows when Resend throws", async () => {
		mockGetVerified.mockReturnValueOnce(
			Promise.resolve({
				id: "dom_1",
				domain: "mail.example.com",
				fromName: "Example",
				defaultLocalPart: null,
			}) as never,
		);
		mockResendSend.mockImplementationOnce(() => {
			throw new Error("network down");
		});

		await expect(
			sendTenantEmail(fakeDb, {
				organizationId: ORG_ID,
				to: "recipient@example.com",
				subject: "Test",
				html: "<p>Test</p>",
			}),
		).rejects.toThrow(/network down/);

		expect(mockRecordLog).toHaveBeenCalledTimes(1);
		const logArgs = mockRecordLog.mock.calls[0]![1] as {
			status: string;
			errorMessage: string;
		};
		expect(logArgs.status).toBe("failed");
		expect(logArgs.errorMessage).toBe("network down");
	});
});
