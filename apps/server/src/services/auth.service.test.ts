/**
 * Auth Service Unit Tests
 *
 * Tests authentication service functions with mocked Better-Auth API.
 * No real database or email operations are performed.
 *
 * Run with: bun test src/services/auth.service.test.ts
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	sendVerificationEmail,
	verifyEmailToken,
	sendPasswordResetEmail,
	resetPassword,
	cleanupExpiredTokens,
} from "./auth.service";
import { auth } from "@/lib/better-auth";
import { controlPanelDb } from "@/lib/db";

// Mock Better-Auth API
const mockSendVerificationEmail = mock(() => Promise.resolve());
const mockForgetPassword = mock(() => Promise.resolve());
const mockResetPassword = mock(() => Promise.resolve({ status: "success" }));

// Mock auth.api
const mockAuthApi = {
	sendVerificationEmail: mockSendVerificationEmail,
	forgetPassword: mockForgetPassword,
	resetPassword: mockResetPassword,
};

// Mock controlPanelDb
const mockFindFirst = mock((): Promise<any> => Promise.resolve(null));
const mockUpdate = mock(() => ({
	set: mock(() => ({
		where: mock(() => Promise.resolve([])),
	})),
}));
const mockDelete = mock(() => ({
	where: mock(() => Promise.resolve([])),
}));
const mockQuery = {
	verification: {
		findFirst: mockFindFirst,
	},
	user: {
		findFirst: mockFindFirst,
	},
};

beforeEach(() => {
	// Reset mocks
	mockSendVerificationEmail.mockClear();
	mockForgetPassword.mockClear();
	mockResetPassword.mockClear();
	mockFindFirst.mockClear();
	mockUpdate.mockClear();
	mockDelete.mockClear();
});

describe("Auth Service - sendVerificationEmail", () => {
	test("successfully sends verification email", async () => {
		// @ts-expect-error - Mocking auth.api
		auth.api = mockAuthApi;

		await sendVerificationEmail("user-123", "test@example.com");

		expect(mockSendVerificationEmail).toHaveBeenCalledTimes(1);
		expect(mockSendVerificationEmail).toHaveBeenCalledWith({
			body: {
				email: "test@example.com",
			},
			headers: expect.any(Headers),
		});
	});

	test("throws error when userId is missing", async () => {
		await expect(
			sendVerificationEmail("", "test@example.com")
		).rejects.toThrow("User ID and email are required");
	});

	test("throws error when email is missing", async () => {
		await expect(
			sendVerificationEmail("user-123", "")
		).rejects.toThrow("User ID and email are required");
	});

	test("handles Better-Auth API errors", async () => {
		(auth as any).api = {
			sendVerificationEmail: mock(() =>
				Promise.reject(new Error("API Error"))
			),
		};

		await expect(
			sendVerificationEmail("user-123", "test@example.com")
		).rejects.toThrow("Failed to send verification email");
	});
});

describe("Auth Service - verifyEmailToken", () => {
	test("successfully verifies email token", async () => {
		const mockVerificationRecord = {
			id: "verification-123",
			identifier: "test@example.com",
			value: "token-abc123",
			expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
		};

		const mockUserRecord = {
			id: "user-123",
			email: "test@example.com",
			emailVerified: false,
		};

		// @ts-expect-error - Mocking controlPanelDb
		controlPanelDb.query = mockQuery;
		mockQuery.verification.findFirst = mock(() =>
			Promise.resolve(mockVerificationRecord)
		);
		mockQuery.user.findFirst = mock(() => Promise.resolve(mockUserRecord));
		// @ts-expect-error - Mocking controlPanelDb
		controlPanelDb.update = mock(() => ({
			set: mock(() => ({
				where: mock(() => Promise.resolve([])),
			})),
		}));
		// @ts-expect-error - Mocking controlPanelDb
		controlPanelDb.delete = mock(() => ({
			where: mock(() => Promise.resolve([])),
		}));

		const userId = await verifyEmailToken("token-abc123");

		expect(userId).toBe("user-123");
		expect(mockQuery.verification.findFirst).toHaveBeenCalledTimes(1);
		expect(mockQuery.user.findFirst).toHaveBeenCalledTimes(1);
	});

	test("throws error when token is missing", async () => {
		await expect(verifyEmailToken("")).rejects.toThrow(
			"Verification token is required"
		);
	});

	test("throws error when token is invalid", async () => {
		// @ts-expect-error - Mocking controlPanelDb
		controlPanelDb.query = mockQuery;
		mockQuery.verification.findFirst = mock(() => Promise.resolve(null));

		await expect(verifyEmailToken("invalid-token")).rejects.toThrow(
			"Invalid verification token"
		);
	});

	test("throws error when token is expired", async () => {
		const mockVerificationRecord = {
			id: "verification-123",
			identifier: "test@example.com",
			value: "token-abc123",
			expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
		};

		// @ts-expect-error - Mocking controlPanelDb
		controlPanelDb.query = mockQuery;
		mockQuery.verification.findFirst = mock(() =>
			Promise.resolve(mockVerificationRecord)
		);

		await expect(verifyEmailToken("token-abc123")).rejects.toThrow(
			"Verification token has expired"
		);
	});

	test("throws error when user not found", async () => {
		const mockVerificationRecord = {
			id: "verification-123",
			identifier: "test@example.com",
			value: "token-abc123",
			expiresAt: new Date(Date.now() + 3600000),
		};

		// @ts-expect-error - Mocking controlPanelDb
		controlPanelDb.query = mockQuery;
		mockQuery.verification.findFirst = mock(() =>
			Promise.resolve(mockVerificationRecord)
		);
		mockQuery.user.findFirst = mock(() => Promise.resolve(null));

		await expect(verifyEmailToken("token-abc123")).rejects.toThrow(
			"User not found for verification token"
		);
	});
});

describe("Auth Service - sendPasswordResetEmail", () => {
	test("successfully sends password reset email", async () => {
		// @ts-expect-error - Mocking auth.api
		auth.api = mockAuthApi;

		await sendPasswordResetEmail("test@example.com");

		expect(mockForgetPassword).toHaveBeenCalledTimes(1);
		expect(mockForgetPassword).toHaveBeenCalledWith({
			body: {
				email: "test@example.com",
			},
			headers: expect.any(Headers),
		});
	});

	test("throws error when email is missing", async () => {
		await expect(sendPasswordResetEmail("")).rejects.toThrow(
			"Email is required"
		);
	});

	test("does not reveal if email exists (security)", async () => {
		(auth as any).api = {
			forgetPassword: mock(() => Promise.reject(new Error("User not found"))),
		};

		// Should not throw error (security best practice)
		// The function catches errors and doesn't throw to prevent email enumeration
		await sendPasswordResetEmail("nonexistent@example.com");
		
		// If we get here without throwing, the test passes
		expect(true).toBe(true);
	});
});

describe("Auth Service - resetPassword", () => {
	test("successfully resets password", async () => {
		// @ts-expect-error - Mocking auth.api
		auth.api = mockAuthApi;

		await resetPassword("reset-token-123", "newPassword123");

		expect(mockResetPassword).toHaveBeenCalledTimes(1);
		expect(mockResetPassword).toHaveBeenCalledWith({
			body: {
				token: "reset-token-123",
				newPassword: "newPassword123",
			},
			headers: expect.any(Headers),
		});
	});

	test("throws error when token is missing", async () => {
		await expect(resetPassword("", "newPassword123")).rejects.toThrow(
			"Token and new password are required"
		);
	});

	test("throws error when password is missing", async () => {
		await expect(resetPassword("reset-token-123", "")).rejects.toThrow(
			"Token and new password are required"
		);
	});

	test("throws error when password is too short", async () => {
		await expect(resetPassword("reset-token-123", "short")).rejects.toThrow(
			"Password must be at least 8 characters long"
		);
	});

	test("throws error when token is invalid", async () => {
		(auth as any).api = {
			resetPassword: mock(() => Promise.resolve({ status: false })),
		};

		await expect(
			resetPassword("invalid-token", "newPassword123")
		).rejects.toThrow("Invalid or expired token");
	});
});

describe("Auth Service - cleanupExpiredTokens", () => {
	test("successfully cleans up expired tokens", async () => {
		const mockDeleteResult = [
			{ id: "token-1" },
			{ id: "token-2" },
			{ id: "token-3" },
		];

		// @ts-expect-error - Mocking controlPanelDb
		controlPanelDb.delete = mock(() => ({
			where: mock(() => ({
				returning: mock(() => Promise.resolve(mockDeleteResult)),
			})),
		}));

		const count = await cleanupExpiredTokens();

		expect(count).toBe(3);
	});

	test("returns 0 when no expired tokens", async () => {
		// @ts-expect-error - Mocking controlPanelDb
		controlPanelDb.delete = mock(() => ({
			where: mock(() => ({
				returning: mock(() => Promise.resolve([])),
			})),
		}));

		const count = await cleanupExpiredTokens();

		expect(count).toBe(0);
	});

	test("handles database errors gracefully", async () => {
		// @ts-expect-error - Mocking controlPanelDb
		controlPanelDb.delete = mock(() => ({
			where: mock(() => ({
				returning: mock(() => Promise.reject(new Error("DB Error"))),
			})),
		}));

		const count = await cleanupExpiredTokens();

		expect(count).toBe(0);
	});
});

