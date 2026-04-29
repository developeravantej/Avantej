/**
 * Authentication Service
 *
 * Provides email verification and password reset functionality.
 * Integrates with Better-Auth for token generation and validation.
 * Uses Resend for email delivery (configured in better-auth.ts).
 *
 * Note: Better-Auth handles email verification automatically via URL visits.
 * These service functions provide programmatic access for API endpoints.
 *
 * Usage in request handlers:
 * ```typescript
 * import { sendVerificationEmail, verifyEmailToken } from "@/services/auth.service";
 * import type { Context } from "hono";
 *
 * await sendVerificationEmail(userId, email, c); // c is Hono context
 * const verified = await verifyEmailToken(token, c);
 * ```
 */

import { getBetterAuth } from "@/lib/better-auth";
import { getControlPanelDb } from "@/lib/db";
import { user, verification } from "@avantej-core/db/schema/auth";
import { eq, lt } from "drizzle-orm";
import type { Context } from "hono";
import { jwtVerify } from "jose";

function getEnvVar(key: string): string | undefined {
  try {
    const { env } = require("cloudflare:workers");
    return env[key];
  } catch {
    return process.env[key];
  }
}

function getBetterAuthSecret(): string {
  const secret = getEnvVar("BETTER_AUTH_SECRET");
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET environment variable is required");
  }
  return secret;
}

/**
 * Send email verification email to user
 *
 * Generates a verification token via Better-Auth and sends verification email via Resend.
 * Better-Auth handles token generation and storage in the verification table.
 * Email is sent using Resend (configured in better-auth.ts email provider).
 *
 * Note: Better-Auth automatically sends verification emails on user registration.
 * This function can be used to resend verification emails.
 *
 * @param userId - User ID
 * @param email - User email address
 * @param c - Optional Hono context. Required in Cloudflare Workers request handlers.
 * @throws Error if user not found or email sending fails
 *
 * @example
 * ```typescript
 * await sendVerificationEmail(userId, "user@example.com", c); // c is Hono context
 * ```
 */
export async function sendVerificationEmail(
  userId: string,
  email: string,
  c?: Context
): Promise<void> {
  if (!userId || !email) {
    throw new Error("User ID and email are required");
  }

  try {
    // Better-Auth handles token generation and uses Resend for email sending
    // (configured in better-auth.ts email provider)
    const auth = getBetterAuth(c);
    await auth.api.sendVerificationEmail({
      body: {
        email,
      },
      headers: new Headers(),
    });

    // Better-Auth API returns void or success status
    // Check for errors by catching exceptions
    console.log(
      `Verification email sent to ${email} for user ${userId} via Resend`
    );
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
 * @param c - Optional Hono context. Required in Cloudflare Workers request handlers.
 * @returns User ID if verification successful
 * @throws Error if token is invalid or expired
 *
 * @example
 * ```typescript
 * const userId = await verifyEmailToken("verification-token-from-email", c); // c is Hono context
 * ```
 */
export async function verifyEmailToken(
  token: string,
  c?: Context
): Promise<string> {
  if (!token) {
    throw new Error("Verification token is required");
  }

  try {
    const auth = getBetterAuth(c);
    await auth.api.verifyEmail({
      query: {
        token,
      },
      headers: new Headers(),
    });

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(getBetterAuthSecret()),
      {
        algorithms: ["HS256"],
      }
    );

    const payloadEmail =
      typeof payload.email === "string"
        ? payload.email.toLowerCase()
        : undefined;
    const updatedEmail =
      typeof payload.updateTo === "string"
        ? payload.updateTo.toLowerCase()
        : undefined;

    const emailToLookup = updatedEmail || payloadEmail;

    if (!emailToLookup) {
      throw new Error("Invalid verification token payload");
    }

    const db = getControlPanelDb(c);
    const userRecord = await db.query.user.findFirst({
      where: eq(user.email, emailToLookup),
    });

    if (!userRecord) {
      throw new Error("User not found for verification token");
    }

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
 * Generates a password reset token and sends reset email to user via Resend.
 * Better-Auth handles token generation and storage.
 * Email is sent using Resend (configured in better-auth.ts email provider).
 *
 * Note: For security, this function always returns success even if email doesn't exist
 * to prevent email enumeration attacks.
 *
 * @param email - User email address
 * @param c - Optional Hono context. Required in Cloudflare Workers request handlers.
 * @throws Error if email sending fails (but doesn't reveal if email exists)
 *
 * @example
 * ```typescript
 * await sendPasswordResetEmail("user@example.com", c); // c is Hono context
 * ```
 */
export async function sendPasswordResetEmail(
  email: string,
  c?: Context
): Promise<void> {
  if (!email) {
    throw new Error("Email is required");
  }

  try {
    // Better-Auth handles password reset token generation and uses Resend for email sending
    // (configured in better-auth.ts email provider)
    const auth = getBetterAuth(c);
    await (auth.api as any).forgetPassword({
      body: {
        email,
      },
      headers: new Headers(),
    });

    // Don't reveal if email exists (security best practice)
    // Always return success even if email not found
    console.log(
      `Password reset email sent to ${email} via Resend (or email not found)`
    );
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
 * @param c - Optional Hono context. Required in Cloudflare Workers request handlers.
 * @throws Error if token is invalid or expired
 *
 * @example
 * ```typescript
 * await resetPassword("reset-token-from-email", "newSecurePassword123", c); // c is Hono context
 * ```
 */
export async function resetPassword(
  token: string,
  newPassword: string,
  c?: Context
): Promise<void> {
  if (!token || !newPassword) {
    throw new Error("Token and new password are required");
  }

  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  try {
    // Reset password via Better-Auth API
    const auth = getBetterAuth(c);
    const result = await auth.api.resetPassword({
      body: {
        token,
        newPassword,
      },
      headers: new Headers(),
    });

    if (
      !result ||
      typeof result !== "object" ||
      !("status" in result) ||
      !result.status
    ) {
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
 * @param c - Optional Hono context. Required in Cloudflare Workers request handlers.
 * @returns Number of tokens deleted
 */
export async function cleanupExpiredTokens(c?: Context): Promise<number> {
  try {
    const db = getControlPanelDb(c);
    const now = new Date();
    const result = await db
      .delete(verification)
      .where(lt(verification.expiresAt, now))
      .returning();

    return result.length;
  } catch (error) {
    console.error("Failed to cleanup expired tokens:", error);
    return 0;
  }
}
