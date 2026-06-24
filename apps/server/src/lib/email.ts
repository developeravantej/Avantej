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
 * Get Resend client instance (lazy-loaded).
 * Exported so other modules (resend-domains wrapper, tenant sender) can reuse
 * the same singleton — the `__resetResendClient` test hook only resets this one.
 */
export function getResendClient(): Resend {
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

export interface SendEmailAttachment {
	filename: string;
	/** Resend accepts base64 string or Buffer. We pass base64 strings only. */
	content: string;
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
	attachments?: SendEmailAttachment[];
}

type CapturedEmailType =
	| "verification"
	| "password-reset"
	| "invitation"
	| "magic-link"
	| "generic";

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
	getEnvVar("EMAIL_CAPTURE_ENABLED") === "true" ||
	(process.env.NODE_ENV as string) === "test";

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

export function recordEmailCapture(
	capture: Omit<CapturedEmail, "sentAt">,
): void {
	if (!emailCaptureEnabled) {
		return;
	}
	capturedEmails.push({ ...capture, sentAt: new Date() });
	if (capturedEmails.length > EMAIL_CAPTURE_LIMIT) {
		capturedEmails.shift();
	}
	if (capture.metadata?.token) {
		console.log(
			`📬 Captured ${capture.type} token for ${capture.to}: ${capture.metadata.token}`,
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
	const { to, subject, html, text, from, fromName, attachments } = options;

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
			...(attachments && attachments.length > 0
				? {
						attachments: attachments.map((a) => ({
							filename: a.filename,
							content: a.content,
						})),
					}
				: {}),
		});

		if (result.error) {
			throw new Error(
				`Resend API error: ${result.error.message || "Unknown error"}`,
			);
		}

		console.log(
			`Email sent successfully to ${Array.isArray(to) ? to.join(", ") : to}`,
		);
	} catch (error) {
		console.error("Failed to send email:", error);
		throw new Error(
			`Failed to send email: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

// ---------------------------------------------------------------------------
// Shared email template layout
//
// A single source for the chrome shared by every transactional email — the
// HTML shell, the gray card, the CTA button, the raw-link fallback, and the
// footer. Per-email copy (heading, greeting, body, button label/color) is
// passed in, so adding/editing an email never re-duplicates the boilerplate
// and branding stays consistent. (Authored as plain HTML helpers rather than
// a React-Email dep so it renders with zero runtime cost on Cloudflare
// Workers; a full @react-email migration is a separate, opt-in change.)
// ---------------------------------------------------------------------------

const EMAIL_BRAND = "Avantej Core";

export const EMAIL_BUTTON_COLORS = {
	verify: "#3498db",
	reset: "#e74c3c",
	invite: "#27ae60",
	signin: "#2980b9",
} as const;

interface EmailLayoutParams {
	/** <title> + used as the <h1> heading. */
	title: string;
	heading: string;
	/** First line, e.g. "Hi John," or "Hi there,". */
	greeting: string;
	/** Intro paragraph before the CTA button. */
	intro: string;
	button: { label: string; href: string; color: string };
	/** Paragraphs rendered after the raw-link fallback (expiry, ignore note). */
	afterParagraphs: string[];
}

function buildEmailHtml(p: EmailLayoutParams): string {
	const year = new Date().getFullYear();
	const after = p.afterParagraphs.map((t) => `\t\t\t\t<p>${t}</p>`).join("\n");
	return `
		<!DOCTYPE html>
		<html>
		<head>
			<meta charset="utf-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>${p.title}</title>
		</head>
		<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
			<div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
				<h1 style="color: #2c3e50;">${p.heading}</h1>
				<p>${p.greeting}</p>
				<p>${p.intro}</p>
				<div style="text-align: center; margin: 30px 0;">
					<a href="${p.button.href}" style="background-color: ${p.button.color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">${p.button.label}</a>
				</div>
				<p>Or copy and paste this link into your browser:</p>
				<p style="word-break: break-all; color: #7f8c8d;">${p.button.href}</p>
${after}
				<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
				<p style="color: #7f8c8d; font-size: 12px;">© ${year} ${EMAIL_BRAND}. All rights reserved.</p>
			</div>
		</body>
		</html>
	`;
}

function buildEmailText(p: {
	heading: string;
	greeting: string;
	intro: string;
	link: string;
	afterLines: string[];
}): string {
	const year = new Date().getFullYear();
	return `
${p.heading}

${p.greeting}

${p.intro}

${p.link}

${p.afterLines.join("\n\n")}

© ${year} ${EMAIL_BRAND}. All rights reserved.
	`.trim();
}

/**
 * Build verification email subject/html/text + rewritten user-facing link.
 * Pure (no IO). Used by `sendVerificationEmail` and the tenant-aware
 * dispatcher in Better-Auth so both renders match exactly.
 */
export function renderVerificationEmail(
	verificationLink: string,
	userName?: string,
): {
	subject: string;
	html: string;
	text: string;
	verificationLinkForUser: string;
	token?: string;
} {
	// Send users to the frontend UI instead of the backend `/api/auth/verify-email` URL.
	const frontendURL =
		getEnvVar("CORS_ORIGIN") ||
		getEnvVar("FRONTEND_URL") ||
		"http://localhost:3001";
	const tokenFromLink = extractTokenFromLink(verificationLink);
	const callbackURLFromLink = (() => {
		try {
			const url = new URL(verificationLink, "http://localhost");
			return url.searchParams.get("callbackURL") || "/login";
		} catch {
			return "/login";
		}
	})();
	const verificationLinkForUser = tokenFromLink
		? `${frontendURL}/verify-email?token=${encodeURIComponent(tokenFromLink)}&callbackURL=${encodeURIComponent(callbackURLFromLink)}`
		: verificationLink;

	const subject = "Verify Your Email Address - Avantej Core";
	const greeting = userName ? `Hi ${userName},` : "Hi there,";
	const html = buildEmailHtml({
		title: "Verify Your Email",
		heading: "Verify Your Email Address",
		greeting,
		intro:
			"Thank you for signing up for Avantej Core! Please verify your email address by clicking the button below:",
		button: {
			label: "Verify Email Address",
			href: verificationLinkForUser,
			color: EMAIL_BUTTON_COLORS.verify,
		},
		afterParagraphs: [
			"This link will expire in 24 hours.",
			"If you didn't create an account, you can safely ignore this email.",
		],
	});

	const text = buildEmailText({
		heading: "Verify Your Email Address",
		greeting,
		intro:
			"Thank you for signing up for Avantej Core! Please verify your email address by visiting this link:",
		link: verificationLinkForUser,
		afterLines: [
			"This link will expire in 24 hours.",
			"If you didn't create an account, you can safely ignore this email.",
		],
	});

	const token = extractTokenFromLink(verificationLinkForUser);
	return { subject, html, text, verificationLinkForUser, token };
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
	userName?: string,
): Promise<void> {
	const { subject, html, text, verificationLinkForUser, token } =
		renderVerificationEmail(verificationLink, userName);

	await sendEmail({
		to,
		subject,
		html,
		text,
	});

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
 * Build password reset email subject/html/text. Pure (no IO).
 */
export function renderPasswordResetEmail(
	resetLink: string,
	userName?: string,
): { subject: string; html: string; text: string; token?: string } {
	const subject = "Reset Your Password - Avantej Core";
	const greeting = userName ? `Hi ${userName},` : "Hi there,";
	const html = buildEmailHtml({
		title: "Reset Your Password",
		heading: "Reset Your Password",
		greeting,
		intro:
			"We received a request to reset your password. Click the button below to create a new password:",
		button: {
			label: "Reset Password",
			href: resetLink,
			color: EMAIL_BUTTON_COLORS.reset,
		},
		afterParagraphs: [
			"This link will expire in 1 hour.",
			"If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.",
		],
	});

	const text = buildEmailText({
		heading: "Reset Your Password",
		greeting,
		intro:
			"We received a request to reset your password. Visit this link to create a new password:",
		link: resetLink,
		afterLines: [
			"This link will expire in 1 hour.",
			"If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.",
		],
	});

	const token = extractTokenFromLink(resetLink);
	return { subject, html, text, token };
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
	userName?: string,
): Promise<void> {
	const { subject, html, text, token } = renderPasswordResetEmail(
		resetLink,
		userName,
	);

	await sendEmail({
		to,
		subject,
		html,
		text,
	});

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
/**
 * Build the invitation email subject/html/text. Pure — no IO. Used both by
 * `sendInvitationEmail` (platform sender) and by the tenant-aware path in
 * Better-Auth so both renders match exactly.
 */
export function renderInvitationEmail(
	invitationLink: string,
	organizationName: string,
	inviterName?: string,
	role?: string,
): { subject: string; html: string; text: string } {
	const subject = `You've been invited to join ${organizationName}`;
	const invitePhrase = `${inviterName ? `${inviterName} has` : "You have been"} invited you to join`;
	const roleSuffix = role ? ` as a ${role}` : "";
	const html = buildEmailHtml({
		title: "You've Been Invited",
		heading: "You've Been Invited!",
		greeting: "Hi there,",
		intro: `${invitePhrase} <strong>${organizationName}</strong>${roleSuffix}.`,
		button: {
			label: "Accept Invitation",
			href: invitationLink,
			color: EMAIL_BUTTON_COLORS.invite,
		},
		afterParagraphs: [
			"This invitation will expire in 7 days.",
			"If you don't want to join this organization, you can safely ignore this email.",
		],
	});
	const text = buildEmailText({
		heading: "You've Been Invited!",
		greeting: "Hi there,",
		intro: `${invitePhrase} ${organizationName}${roleSuffix}.\n\nAccept the invitation by visiting this link:`,
		link: invitationLink,
		afterLines: [
			"This invitation will expire in 7 days.",
			"If you don't want to join this organization, you can safely ignore this email.",
		],
	});
	return { subject, html, text };
}

export async function sendInvitationEmail(
	to: string,
	invitationLink: string,
	organizationName: string,
	inviterName?: string,
	role?: string,
): Promise<void> {
	const { subject, html, text } = renderInvitationEmail(
		invitationLink,
		organizationName,
		inviterName,
		role,
	);

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

/**
 * Send a magic-link sign-in email
 *
 * @param to - Recipient email
 * @param magicLink - One-click sign-in URL
 * @param userName - Recipient name (optional)
 * @param organizationName - Org name displayed in subject/body (optional)
 */
/**
 * Build magic-link email subject/html/text. Pure (no IO).
 */
export function renderMagicLinkEmail(
	magicLink: string,
	userName?: string,
	organizationName?: string,
): { subject: string; html: string; text: string } {
	const orgPhrase = organizationName ? ` to ${organizationName}` : "";
	const subject = `Sign in${orgPhrase}`;
	const greeting = userName ? `Hi ${userName},` : "Hi there,";
	const html = buildEmailHtml({
		title: "Sign in to Avantej",
		heading: `Sign in${orgPhrase}`,
		greeting,
		intro:
			"Click the button below to sign in. This link is single-use and expires shortly.",
		button: {
			label: "Sign in",
			href: magicLink,
			color: EMAIL_BUTTON_COLORS.signin,
		},
		afterParagraphs: [
			"If you did not request this email, you can safely ignore it.",
		],
	});

	const text = buildEmailText({
		heading: `Sign in${orgPhrase}`,
		greeting,
		intro:
			"Click the link below to sign in. This link is single-use and expires shortly.",
		link: magicLink,
		afterLines: [
			"If you did not request this email, you can safely ignore it.",
		],
	});

	return { subject, html, text };
}

export async function sendMagicLinkEmail(
	to: string,
	magicLink: string,
	userName?: string,
	organizationName?: string,
): Promise<void> {
	const { subject, html, text } = renderMagicLinkEmail(
		magicLink,
		userName,
		organizationName,
	);

	await sendEmail({
		to,
		subject,
		html,
		text,
	});

	recordEmailCapture({
		type: "magic-link",
		to,
		subject,
		html,
		text,
		metadata: {
			magicLink,
			organizationName,
		},
	});
}
