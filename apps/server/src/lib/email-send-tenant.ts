/**
 * Tenant-scoped email sender
 *
 * Sends transactional email for a tenant. Transport is chosen per verified
 * `email_domains` row: a Cloudflare-provider domain sends via the `send_email`
 * binding; everything else (incl. the platform fallback) via Resend. Guards on a
 * verified row, persists an email_logs row keyed by the message id (idempotency),
 * and falls back to the platform's RESEND_FROM_EMAIL if the org has no verified
 * domain yet.
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
	resolveAliasLocalPart,
} from "@avantej-core/services/email-domain.service";
import { resolveNotificationRoute } from "@avantej-core/services/notification-route.service";
import {
	type NotificationType,
	renderSubjectTemplate,
	sanitizeSubject,
} from "@avantej-core/services/notification-routing";
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
	 * org's verified domain → "<localPart>@<domain>". Resolution order:
	 * `params.localPart` > `route.aliasLocalPart` (from `notificationType`) >
	 * alias resolved from `params.aliasLabel` > `email_domains.defaultLocalPart`
	 * > "support".
	 */
	localPart?: string;
	/**
	 * Curated alias label to resolve into a local-part via the
	 * `email_domain_aliases` table. Useful for keeping send sites label-driven
	 * ("billing", "support") instead of stringly-typed local-parts. Ignored
	 * when `localPart` is also set.
	 */
	aliasLabel?: string;
	/**
	 * Override the from-name on this send. Otherwise uses the row's
	 * email_domains.fromName, or the platform default.
	 */
	fromName?: string;
	/**
	 * Notification type used to look up a per-org route override (alias,
	 * from-name, subject template). When omitted, no route lookup is performed.
	 */
	notificationType?: NotificationType;
	/**
	 * Template variable values used to interpolate `{token}` placeholders in a
	 * subject override from the notification route. Ignored when no route is
	 * resolved or no subjectOverride is set.
	 */
	subjectVars?: Record<string, string>;
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

function platformFromAddress(): {
	fromAddress: string;
	fromName: string;
	fromEmail: string;
} {
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
		localPart,
		aliasLabel,
		fromName,
		allowPlatformFallback = true,
		notificationType,
		subjectVars,
	} = params;

	if (!to || !subject || !html) {
		throw new Error("organizationId, to, subject, and html are required");
	}

	const verified = await getVerifiedEmailDomainForOrg(
		controlPanelDb,
		organizationId,
	);

	const route = notificationType
		? await resolveNotificationRoute(
				controlPanelDb,
				organizationId,
				notificationType,
			)
		: null;

	let fromAddress: string;
	let fromEmail: string;
	let resolvedFromName: string;
	let emailDomainId: string | null;
	let usedFallback = false;
	// Transport is per-row: a verified Cloudflare-provider domain sends via the
	// send_email binding; everything else (incl. the platform fallback) via Resend.
	const useCloudflare = verified?.provider === "cloudflare";

	if (verified) {
		let resolvedLocalPart = localPart;
		if (!resolvedLocalPart && route?.aliasLocalPart) {
			resolvedLocalPart = route.aliasLocalPart;
		}
		if (!resolvedLocalPart && aliasLabel) {
			resolvedLocalPart =
				(await resolveAliasLocalPart(controlPanelDb, {
					emailDomainId: verified.id,
					label: aliasLabel,
				})) ?? undefined;
		}
		resolvedLocalPart =
			resolvedLocalPart ?? verified.defaultLocalPart ?? "support";
		fromEmail = `${resolvedLocalPart}@${verified.domain}`;
		resolvedFromName = fromName ?? route?.fromNameOverride ?? verified.fromName;
		fromAddress = `${resolvedFromName} <${fromEmail}>`;
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
		const fallbackName = fromName ?? route?.fromNameOverride;
		resolvedFromName = fallbackName ?? platform.fromName;
		fromAddress = fallbackName
			? `${fallbackName} <${platform.fromEmail}>`
			: platform.fromAddress;
		emailDomainId = null;
		usedFallback = true;
	}

	const recipients = Array.isArray(to) ? to : [to];
	const textBody = text ?? html.replace(/<[^>]*>/g, "");

	const finalSubject = sanitizeSubject(
		route?.subjectOverride
			? renderSubjectTemplate(route.subjectOverride, subjectVars ?? {})
			: subject,
	);
	const tags: Array<{ name: string; value: string }> = [
		{ name: "organization_id", value: organizationId },
	];
	if (notificationType)
		tags.push({ name: "notification_type", value: notificationType });

	let messageId: string;

	if (useCloudflare) {
		// Verified Cloudflare-provider domain → send via the send_email binding.
		// Tags aren't supported by the binding (Resend-only); org attribution is
		// still persisted in the email_logs row below.
		const { sendViaCloudflareEmail } = await import("./cloudflare-email");
		try {
			const cf = await sendViaCloudflareEmail({
				to: recipients,
				subject: finalSubject,
				html,
				text: textBody,
				fromEmail,
				fromName: resolvedFromName,
			});
			messageId = cf.messageId ?? `cf:${crypto.randomUUID()}`;
		} catch (err) {
			const errMessage = err instanceof Error ? err.message : String(err);
			await safeWriteLog(controlPanelDb, {
				organizationId,
				emailDomainId,
				resendMessageId: syntheticFailedId(),
				fromAddress,
				toAddress: recipients.join(", "),
				subject: finalSubject,
				notificationType: notificationType ?? null,
				status: "failed",
				errorMessage: errMessage,
			});
			captureFailed({
				recipients,
				subject: finalSubject,
				html,
				textBody,
				organizationId,
				usedFallback,
				errMessage,
			});
			throw err;
		}
	} else {
		const resend = getResendClient();

		let result: Awaited<ReturnType<typeof resend.emails.send>>;
		try {
			result = await resend.emails.send({
				from: fromAddress,
				to: recipients,
				subject: finalSubject,
				html,
				text: textBody,
				tags,
			});
		} catch (err) {
			const errMessage = err instanceof Error ? err.message : String(err);
			await safeWriteLog(controlPanelDb, {
				organizationId,
				emailDomainId,
				resendMessageId: syntheticFailedId(),
				fromAddress,
				toAddress: recipients.join(", "),
				subject: finalSubject,
				notificationType: notificationType ?? null,
				status: "failed",
				errorMessage: errMessage,
			});
			captureFailed({
				recipients,
				subject: finalSubject,
				html,
				textBody,
				organizationId,
				usedFallback,
				errMessage,
			});
			throw err;
		}

		if (result.error || !result.data?.id) {
			const errMessage = result.error?.message ?? "missing message id";
			await safeWriteLog(controlPanelDb, {
				organizationId,
				emailDomainId,
				resendMessageId: result.data?.id ?? syntheticFailedId(),
				fromAddress,
				toAddress: recipients.join(", "),
				subject: finalSubject,
				notificationType: notificationType ?? null,
				status: "failed",
				errorMessage: errMessage,
			});
			captureFailed({
				recipients,
				subject: finalSubject,
				html,
				textBody,
				organizationId,
				usedFallback,
				errMessage,
			});
			throw new Error(`Resend API error: ${errMessage}`);
		}

		messageId = result.data.id;
	}

	await safeWriteLog(controlPanelDb, {
		organizationId,
		emailDomainId,
		resendMessageId: messageId,
		fromAddress,
		toAddress: recipients.join(", "),
		subject: finalSubject,
		notificationType: notificationType ?? null,
		status: "sent",
	});

	recordEmailCapture({
		type: "generic",
		to: recipients.join(", "),
		subject: finalSubject,
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

function syntheticFailedId(): string {
	return `failed:${crypto.randomUUID()}`;
}

/**
 * Mirror the success-path email capture for failed sends so test harnesses
 * (and any capture consumer) see the attempt with `status=failed` + the error,
 * instead of silently only recording successes.
 */
function captureFailed(args: {
	recipients: string[];
	subject: string;
	html: string;
	textBody: string;
	organizationId: string;
	usedFallback: boolean;
	errMessage: string;
}): void {
	recordEmailCapture({
		type: "generic",
		to: args.recipients.join(", "),
		subject: args.subject,
		html: args.html,
		text: args.textBody,
		metadata: {
			organizationId: args.organizationId,
			status: "failed",
			error: args.errMessage,
			usedFallback: args.usedFallback ? "true" : "false",
		},
	});
}

async function safeWriteLog(
	controlPanelDb: ControlPanelDb,
	params: Parameters<typeof recordEmailLog>[1],
): Promise<void> {
	try {
		await recordEmailLog(controlPanelDb, params);
	} catch (e) {
		console.error("Failed to write email_logs row", {
			resendMessageId: params.resendMessageId,
			error: e,
		});
	}
}
