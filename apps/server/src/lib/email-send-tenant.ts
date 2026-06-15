/**
 * Tenant-scoped email sender
 *
 * Sends transactional email for a tenant via Resend. Guards on a verified
 * email_domains row, tags every send with `organization_id`, persists an
 * email_logs row keyed by Resend's message id (idempotency), and falls back
 * to the platform's RESEND_FROM_EMAIL if the org has no verified domain yet.
 *
 * Webhook handler updates the email_logs row by resendMessageId — that's
 * why we INSERT before returning, even though the row's status may be
 * overwritten almost immediately by a `delivered` event.
 */

import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import {
	getVerifiedEmailDomainForOrg,
	recordEmailLog,
} from "@avantej-core/services/email-domain.service";
import { getResendClient, recordEmailCapture } from "./email";

type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export interface SendTenantEmailParams {
	organizationId: string;
	to: string | string[];
	subject: string;
	html: string;
	text?: string;
	/**
	 * Local-part of the sender address (e.g. "support"). Combined with the
	 * org's verified domain → "support@<domain>". Default: "support".
	 */
	localPart?: string;
	/**
	 * Override the from-name on this send. Otherwise uses the row's
	 * email_domains.fromName, or the platform default.
	 */
	fromName?: string;
	/**
	 * If true, fall back to the platform RESEND_FROM_EMAIL when the org
	 * has no verified domain. Default: true. Set to false to hard-fail
	 * if the org isn't fully provisioned yet (e.g. marketing blasts).
	 */
	allowPlatformFallback?: boolean;
}

export interface SendTenantEmailResult {
	messageId: string;
	fromAddress: string;
	usedFallback: boolean;
}

function getEnvVar(key: string): string | undefined {
	try {
		const { env } = require("cloudflare:workers");
		return env[key];
	} catch {
		return process.env[key];
	}
}

function platformFromAddress(): { fromAddress: string; fromName: string; fromEmail: string } {
	const fromEmail = getEnvVar("RESEND_FROM_EMAIL") || "onboarding@resend.dev";
	const fromName = getEnvVar("RESEND_FROM_NAME") || "Avantej Core";
	return { fromAddress: `${fromName} <${fromEmail}>`, fromName, fromEmail };
}

export async function sendTenantEmail(
	controlPanelDb: ControlPanelDb,
	params: SendTenantEmailParams,
): Promise<SendTenantEmailResult> {
	const {
		organizationId,
		to,
		subject,
		html,
		text,
		localPart = "support",
		fromName,
		allowPlatformFallback = true,
	} = params;

	if (!to || !subject || !html) {
		throw new Error("organizationId, to, subject, and html are required");
	}

	const verified = await getVerifiedEmailDomainForOrg(controlPanelDb, organizationId);

	let fromAddress: string;
	let fromEmail: string;
	let emailDomainId: string | null;
	let usedFallback = false;

	if (verified) {
		fromEmail = `${localPart}@${verified.domain}`;
		const name = fromName ?? verified.fromName;
		fromAddress = `${name} <${fromEmail}>`;
		emailDomainId = verified.id;
	} else {
		if (!allowPlatformFallback) {
			throw new Error(
				`No verified sending domain for organization ${organizationId}; ` +
					"complete domain verification before sending.",
			);
		}
		const platform = platformFromAddress();
		fromEmail = platform.fromEmail;
		fromAddress = fromName
			? `${fromName} <${platform.fromEmail}>`
			: platform.fromAddress;
		emailDomainId = null;
		usedFallback = true;
	}

	const recipients = Array.isArray(to) ? to : [to];
	const textBody = text ?? html.replace(/<[^>]*>/g, "");

	const resend = getResendClient();
	const result = await resend.emails.send({
		from: fromAddress,
		to: recipients,
		subject,
		html,
		text: textBody,
		tags: [{ name: "organization_id", value: organizationId }],
	});

	if (result.error || !result.data?.id) {
		throw new Error(
			`Resend API error: ${result.error?.message ?? "missing message id"}`,
		);
	}

	const messageId = result.data.id;

	try {
		await recordEmailLog(controlPanelDb, {
			organizationId,
			emailDomainId,
			resendMessageId: messageId,
			fromAddress,
			toAddress: recipients.join(", "),
			subject,
			status: "sent",
		});
	} catch (e) {
		console.error("Failed to write email_logs row", { messageId, error: e });
	}

	recordEmailCapture({
		type: "generic",
		to: recipients.join(", "),
		subject,
		html,
		text: textBody,
		metadata: {
			organizationId,
			resendMessageId: messageId,
			usedFallback: usedFallback ? "true" : "false",
		},
	});

	return { messageId, fromAddress, usedFallback };
}
