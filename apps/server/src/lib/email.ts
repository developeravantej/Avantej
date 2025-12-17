/**
 * Email Service
 *
 * Provides email sending functionality using Resend.
 * Used for verification emails, password resets, and organization invitations.
 *
 * Environment Variables:
 * - RESEND_API_KEY: Resend API key (starts with re_)
 * - RESEND_FROM_EMAIL: Sender email address (must be verified in Resend)
 * - RESEND_FROM_NAME: Sender name displayed in email
 *
 * Usage:
 * ```typescript
 * import { sendEmail } from "@/lib/email";
 *
 * await sendEmail({
 *   to: "user@example.com",
 *   subject: "Verify your email",
 *   html: "<p>Click here to verify</p>",
 * });
 * ```
 */

import { Resend } from "resend";

/**
 * Get environment variable from Cloudflare Workers env or process.env (for Node.js/test environments)
 */
function getEnvVar(key: string): string | undefined {
	try {
		// @ts-expect-error - cloudflare:workers is only available in Workers runtime
		const { env } = require("cloudflare:workers");
		return env[key];
	} catch {
		// Not in Cloudflare Workers environment (e.g., in tests)
		return process.env[key];
	}
}

/**
 * Lazy-loaded Resend client (initialized on first use)
 */
let resendClient: Resend | null = null;

/**
 * Get Resend client instance (lazy-loaded)
 */
function getResendClient(): Resend {
	if (!resendClient) {
		const apiKey = getEnvVar("RESEND_API_KEY");
		if (!apiKey) {
			throw new Error("RESEND_API_KEY environment variable is required");
		}
		resendClient = new Resend(apiKey);
	}
	return resendClient;
}

/**
 * Reset Resend client cache (for testing purposes)
 * @internal
 */
export function __resetResendClient(): void {
	resendClient = null;
}

/**
 * Default sender information from environment variables
 */
function getDefaultFromEmail(): string {
	return getEnvVar("RESEND_FROM_EMAIL") || "onboarding@resend.dev";
}

function getDefaultFromName(): string {
	return getEnvVar("RESEND_FROM_NAME") || "Avantej Core";
}

/**
 * Email sending options
 */
export interface SendEmailOptions {
	to: string | string[];
	subject: string;
	html: string;
	text?: string;
	from?: string;
	fromName?: string;
}

type CapturedEmailType = "verification" | "password-reset" | "invitation" | "generic";

interface CapturedEmail {
	type: CapturedEmailType;
	to: string;
	subject: string;
	html: string;
	text?: string;
	metadata?: Record<string, string | undefined>;
	sentAt: Date;
}

const EMAIL_CAPTURE_LIMIT = 50;
const capturedEmails: CapturedEmail[] = [];

let emailCaptureEnabled =
	getEnvVar("EMAIL_CAPTURE_ENABLED") === "true" || process.env.NODE_ENV === "test";

export function __setEmailCaptureEnabled(enabled: boolean): void {
	emailCaptureEnabled = enabled;
	if (!enabled) {
		capturedEmails.length = 0;
	}
}

export function __clearEmailCaptures(): void {
	capturedEmails.length = 0;
}

export function __getCapturedEmails(type?: CapturedEmailType): CapturedEmail[] {
	if (!type) {
		return [...capturedEmails];
	}
	return capturedEmails.filter((email) => email.type === type);
}

function recordEmailCapture(capture: Omit<CapturedEmail, "sentAt">): void {
	if (!emailCaptureEnabled) {
		return;
	}
	capturedEmails.push({ ...capture, sentAt: new Date() });
	if (capturedEmails.length > EMAIL_CAPTURE_LIMIT) {
		capturedEmails.shift();
	}
	if (capture.metadata?.token) {
		console.log(
			`📬 Captured ${capture.type} token for ${capture.to}: ${capture.metadata.token}`
		);
	}
}

function extractTokenFromLink(link?: string): string | undefined {
	if (!link) {
		return undefined;
	}

	const tryExtract = (value: string, base?: string) => {
		try {
			const url = base ? new URL(value, base) : new URL(value);
			const queryToken = url.searchParams.get("token");
			if (queryToken) {
				return queryToken;
			}
			const segments = url.pathname.split("/").filter(Boolean);
			const lastSegment = segments[segments.length - 1];
			if (lastSegment && lastSegment.length >= 8) {
				return lastSegment;
			}
			return undefined;
		} catch {
			return undefined;
		}
	};

	return tryExtract(link) ?? tryExtract(link, "http://localhost");
}

/**
 * Send email using Resend
 *
 * @param options - Email options
 * @throws Error if email sending fails
 *
 * @example
 * ```typescript
 * await sendEmail({
 *   to: "user@example.com",
 *   subject: "Welcome!",
 *   html: "<h1>Welcome to Avantej Core</h1>",
 * });
 * ```
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
	const { to, subject, html, text, from, fromName } = options;

	if (!to || !subject || !html) {
		throw new Error("To, subject, and html are required");
	}

	const fromEmail = from || getDefaultFromEmail();
	const fromNameValue = fromName || getDefaultFromName();
	const fromAddress = `${fromNameValue} <${fromEmail}>`;

	try {
		const resend = getResendClient();
		const result = await resend.emails.send({
			from: fromAddress,
			to: Array.isArray(to) ? to : [to],
			subject,
			html,
			text: text || html.replace(/<[^>]*>/g, ""), // Strip HTML tags for text version
		});

		if (result.error) {
			throw new Error(
				`Resend API error: ${result.error.message || "Unknown error"}`
			);
		}

		console.log(`Email sent successfully to ${Array.isArray(to) ? to.join(", ") : to}`);
	} catch (error) {
		console.error("Failed to send email:", error);
		throw new Error(
			`Failed to send email: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/**
 * Send email verification email
 *
 * @param to - Recipient email address
 * @param verificationLink - Verification link URL
 * @param userName - User's name (optional)
 */
export async function sendVerificationEmail(
	to: string,
	verificationLink: string,
	userName?: string
): Promise<void> {
	// Send users to the frontend UI instead of the backend `/api/auth/verify-email` URL.
	// The frontend page will call our API (`POST /auth/verify-email`) and then redirect.
	const frontendURL =
		getEnvVar("CORS_ORIGIN") || getEnvVar("FRONTEND_URL") || "http://localhost:3001";
	const tokenFromLink = extractTokenFromLink(verificationLink);
	const callbackURLFromLink = (() => {
		try {
			const url = new URL(verificationLink, "http://localhost");
			return url.searchParams.get("callbackURL") || "/login";
		} catch {
			return "/login";
		}
	})();
	const verificationLinkForUser =
		tokenFromLink
			? `${frontendURL}/verify-email?token=${encodeURIComponent(tokenFromLink)}&callbackURL=${encodeURIComponent(callbackURLFromLink)}`
			: verificationLink;

	const subject = "Verify Your Email Address - Avantej Core";
	const html = `
		<!DOCTYPE html>
		<html>
		<head>
			<meta charset="utf-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Verify Your Email</title>
		</head>
		<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
			<div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
				<h1 style="color: #2c3e50;">Verify Your Email Address</h1>
				<p>${userName ? `Hi ${userName},` : "Hi there,"}</p>
				<p>Thank you for signing up for Avantej Core! Please verify your email address by clicking the button below:</p>
				<div style="text-align: center; margin: 30px 0;">
					<a href="${verificationLinkForUser}" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email Address</a>
				</div>
				<p>Or copy and paste this link into your browser:</p>
				<p style="word-break: break-all; color: #7f8c8d;">${verificationLinkForUser}</p>
				<p>This link will expire in 24 hours.</p>
				<p>If you didn't create an account, you can safely ignore this email.</p>
				<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
				<p style="color: #7f8c8d; font-size: 12px;">© ${new Date().getFullYear()} Avantej Core. All rights reserved.</p>
			</div>
		</body>
		</html>
	`;

	const text = `
Verify Your Email Address

${userName ? `Hi ${userName},` : "Hi there,"}

Thank you for signing up for Avantej Core! Please verify your email address by visiting this link:

${verificationLinkForUser}

This link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.

© ${new Date().getFullYear()} Avantej Core. All rights reserved.
	`.trim();

	await sendEmail({
		to,
		subject,
		html,
		text,
	});

	const token = extractTokenFromLink(verificationLinkForUser);
	recordEmailCapture({
		type: "verification",
		to,
		subject,
		html,
		text,
		metadata: {
			verificationLink: verificationLinkForUser,
			token,
		},
	});
}

/**
 * Send password reset email
 *
 * @param to - Recipient email address
 * @param resetLink - Password reset link URL
 * @param userName - User's name (optional)
 */
export async function sendPasswordResetEmail(
	to: string,
	resetLink: string,
	userName?: string
): Promise<void> {
	const subject = "Reset Your Password - Avantej Core";
	const html = `
		<!DOCTYPE html>
		<html>
		<head>
			<meta charset="utf-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Reset Your Password</title>
		</head>
		<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
			<div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
				<h1 style="color: #2c3e50;">Reset Your Password</h1>
				<p>${userName ? `Hi ${userName},` : "Hi there,"}</p>
				<p>We received a request to reset your password. Click the button below to create a new password:</p>
				<div style="text-align: center; margin: 30px 0;">
					<a href="${resetLink}" style="background-color: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
				</div>
				<p>Or copy and paste this link into your browser:</p>
				<p style="word-break: break-all; color: #7f8c8d;">${resetLink}</p>
				<p>This link will expire in 1 hour.</p>
				<p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
				<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
				<p style="color: #7f8c8d; font-size: 12px;">© ${new Date().getFullYear()} Avantej Core. All rights reserved.</p>
			</div>
		</body>
		</html>
	`;

	const text = `
Reset Your Password

${userName ? `Hi ${userName},` : "Hi there,"}

We received a request to reset your password. Visit this link to create a new password:

${resetLink}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

© ${new Date().getFullYear()} Avantej Core. All rights reserved.
	`.trim();

	await sendEmail({
		to,
		subject,
		html,
		text,
	});

	const token = extractTokenFromLink(resetLink);
	recordEmailCapture({
		type: "password-reset",
		to,
		subject,
		html,
		text,
		metadata: {
			resetLink,
			token,
		},
	});
}

/**
 * Send organization invitation email
 *
 * @param to - Recipient email address
 * @param invitationLink - Invitation acceptance link URL
 * @param organizationName - Organization name
 * @param inviterName - Name of person who sent the invitation (optional)
 * @param role - Role being invited to (optional)
 */
export async function sendInvitationEmail(
	to: string,
	invitationLink: string,
	organizationName: string,
	inviterName?: string,
	role?: string
): Promise<void> {
	const subject = `You've been invited to join ${organizationName}`;
	const html = `
		<!DOCTYPE html>
		<html>
		<head>
			<meta charset="utf-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>You've Been Invited</title>
		</head>
		<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
			<div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
				<h1 style="color: #2c3e50;">You've Been Invited!</h1>
				<p>Hi there,</p>
				<p>${inviterName ? `${inviterName} has` : "You have been"} invited you to join <strong>${organizationName}</strong>${role ? ` as a ${role}` : ""}.</p>
				<div style="text-align: center; margin: 30px 0;">
					<a href="${invitationLink}" style="background-color: #27ae60; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Accept Invitation</a>
				</div>
				<p>Or copy and paste this link into your browser:</p>
				<p style="word-break: break-all; color: #7f8c8d;">${invitationLink}</p>
				<p>This invitation will expire in 7 days.</p>
				<p>If you don't want to join this organization, you can safely ignore this email.</p>
				<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
				<p style="color: #7f8c8d; font-size: 12px;">© ${new Date().getFullYear()} Avantej Core. All rights reserved.</p>
			</div>
		</body>
		</html>
	`;

	const text = `
You've Been Invited!

Hi there,

${inviterName ? `${inviterName} has` : "You have been"} invited you to join ${organizationName}${role ? ` as a ${role}` : ""}.

Accept the invitation by visiting this link:

${invitationLink}

This invitation will expire in 7 days.

If you don't want to join this organization, you can safely ignore this email.

© ${new Date().getFullYear()} Avantej Core. All rights reserved.
	`.trim();

	await sendEmail({
		to,
		subject,
		html,
		text,
	});

	recordEmailCapture({
		type: "invitation",
		to,
		subject,
		html,
		text,
		metadata: {
			invitationLink,
			organizationName,
			role,
		},
	});
}

