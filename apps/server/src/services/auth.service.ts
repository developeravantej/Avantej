/**
 * Authentication Service
 *
 * Provides email verification and password reset functionality.
 * Integrates with Better-Auth for token generation and validation.
 *
 * Note: Better-Auth handles email verification automatically via URL visits.
 * These service functions provide programmatic access for API endpoints.
 *
 * Usage:
 * ```typescript
 * import { sendVerificationEmail, verifyEmailToken } from "@/services/auth.service";
 *
 * await sendVerificationEmail(userId, email);
 * const verified = await verifyEmailToken(token);
 * ```
 */

import { auth } from "@/lib/better-auth";
import { controlPanelDb } from "@/lib/db";
import { lt, eq } from "drizzle-orm";
import { verification } from "@avantej-core/db/schema/auth";
import { user } from "@avantej-core/db/schema/auth";

/**
 * Send email verification email to user
 *
 * Generates a verification token via Better-Auth and sends verification email.
 * Better-Auth handles token generation and storage in the verification table.
 *
 * Note: Better-Auth automatically sends verification emails on user registration.
 * This function can be used to resend verification emails.
 *
 * @param userId - User ID
 * @param email - User email address
 * @throws Error if user not found or email sending fails
 *
 * @example
 * ```typescript
 * await sendVerificationEmail(userId, "user@example.com");
 * ```
 */
export async function sendVerificationEmail(
	userId: string,
	email: string
): Promise<void> {
	if (!userId || !email) {
		throw new Error("User ID and email are required");
	}

	try {
		// Better-Auth handles token generation and email sending internally
		// We use the sendVerificationEmail API method
		await auth.api.sendVerificationEmail({
			body: {
				email,
			},
			headers: new Headers(),
		});

		// Better-Auth API returns void or success status
		// Check for errors by catching exceptions
		console.log(`Verification email sent to ${email} for user ${userId}`);
	} catch (error) {
		throw new Error(
			`Failed to send verification email: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/**
 * Verify email token and update user emailVerified flag
 *
 * Validates the verification token and marks the user's email as verified.
 * Better-Auth handles token validation and updates the user record.
 *
 * Implementation: Uses Better-Auth's verification flow by querying the verification table
 * and updating the user's emailVerified flag directly.
 *
 * @param token - Verification token from email link
 * @returns User ID if verification successful
 * @throws Error if token is invalid or expired
 *
 * @example
 * ```typescript
 * const userId = await verifyEmailToken("verification-token-from-email");
 * ```
 */
export async function verifyEmailToken(token: string): Promise<string> {
	if (!token) {
		throw new Error("Verification token is required");
	}

	try {
		// Find verification record by token (value field)
		const verificationRecord = await controlPanelDb.query.verification.findFirst({
			where: eq(verification.value, token),
		});

		if (!verificationRecord) {
			throw new Error("Invalid verification token");
		}

		// Check if token is expired
		if (new Date() > verificationRecord.expiresAt) {
			throw new Error("Verification token has expired");
		}

		// Find user by email (identifier field contains email)
		const userRecord = await controlPanelDb.query.user.findFirst({
			where: eq(user.email, verificationRecord.identifier),
		});

		if (!userRecord) {
			throw new Error("User not found for verification token");
		}

		// Update user's emailVerified flag
		await controlPanelDb
			.update(user)
			.set({ emailVerified: true })
			.where(eq(user.id, userRecord.id));

		// Delete verification token (one-time use)
		await controlPanelDb.delete(verification).where(eq(verification.id, verificationRecord.id));

		return userRecord.id;
	} catch (error) {
		throw new Error(
			`Email verification failed: ${error instanceof Error ? error.message : "Invalid or expired token"}`
		);
	}
}

/**
 * Send password reset email
 *
 * Generates a password reset token and sends reset email to user.
 * Better-Auth handles token generation and storage.
 *
 * Note: For security, this function always returns success even if email doesn't exist
 * to prevent email enumeration attacks.
 *
 * @param email - User email address
 * @throws Error if email sending fails (but doesn't reveal if email exists)
 *
 * @example
 * ```typescript
 * await sendPasswordResetEmail("user@example.com");
 * ```
 */
export async function sendPasswordResetEmail(email: string): Promise<void> {
	if (!email) {
		throw new Error("Email is required");
	}

	try {
		// Better-Auth handles password reset token generation
		await auth.api.forgetPassword({
			body: {
				email,
			},
			headers: new Headers(),
		});

		// Don't reveal if email exists (security best practice)
		// Always return success even if email not found
		console.log(`Password reset email sent to ${email} (or email not found)`);
	} catch (error) {
		// Don't reveal error details (security best practice)
		console.error(`Failed to send password reset email: ${error}`);
		// Still return success to prevent email enumeration
	}
}

/**
 * Reset password using token
 *
 * Validates the password reset token and updates the user's password.
 * Better-Auth handles token validation and password hashing.
 *
 * @param token - Password reset token from email link
 * @param newPassword - New password
 * @throws Error if token is invalid or expired
 *
 * @example
 * ```typescript
 * await resetPassword("reset-token-from-email", "newSecurePassword123");
 * ```
 */
export async function resetPassword(
	token: string,
	newPassword: string
): Promise<void> {
	if (!token || !newPassword) {
		throw new Error("Token and new password are required");
	}

	if (newPassword.length < 8) {
		throw new Error("Password must be at least 8 characters long");
	}

	try {
		// Reset password via Better-Auth API
		const result = await auth.api.resetPassword({
			body: {
				token,
				newPassword,
			},
			headers: new Headers(),
		});

		if (!result || typeof result !== "object" || !("status" in result) || !result.status) {
			throw new Error("Invalid or expired token");
		}

		console.log("Password reset successful");
	} catch (error) {
		throw new Error(
			`Password reset failed: ${error instanceof Error ? error.message : "Invalid or expired token"}`
		);
	}
}

/**
 * Clean up expired verification tokens
 *
 * Removes expired verification tokens from the database.
 * Should be called periodically (e.g., via cron job).
 *
 * @returns Number of tokens deleted
 */
export async function cleanupExpiredTokens(): Promise<number> {
	try {
		const now = new Date();
		const result = await controlPanelDb
			.delete(verification)
			.where(lt(verification.expiresAt, now))
			.returning();

		return result.length;
	} catch (error) {
		console.error("Failed to cleanup expired tokens:", error);
		return 0;
	}
}
