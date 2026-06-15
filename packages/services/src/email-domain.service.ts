/**
 * Email Domain & Log service
 *
 * Pure helpers over the control-panel `email_domains` and `email_logs` tables.
 * Accepts the Drizzle client as the first arg (no DB instantiation, no env reads)
 * so this file stays portable across Worker + Node test contexts. The Resend SDK
 * itself is wrapped in apps/server (it depends on env vars and the resend dep) —
 * this module only handles persistence + lookup logic.
 */

import { and, desc, eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { emailDomains } from "@avantej-core/db/schema/control-panel/email-domains";
import { emailLogs } from "@avantej-core/db/schema/control-panel/email-logs";

export type EmailDomainStatus = "pending" | "verifying" | "verified" | "failed";
export type EmailLogStatus =
	| "queued"
	| "sent"
	| "delivered"
	| "bounced"
	| "complained"
	| "opened"
	| "clicked"
	| "failed";

export type EmailDomainRow = typeof emailDomains.$inferSelect;
export type EmailLogRow = typeof emailLogs.$inferSelect;

type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export interface CreateEmailDomainParams {
	organizationId: string;
	resendDomainId: string;
	domain: string;
	fromName: string;
	dnsRecords: unknown;
}

export async function createEmailDomain(
	controlPanelDb: ControlPanelDb,
	params: CreateEmailDomainParams,
): Promise<EmailDomainRow> {
	const [row] = await controlPanelDb
		.insert(emailDomains)
		.values({
			organizationId: params.organizationId,
			resendDomainId: params.resendDomainId,
			domain: params.domain,
			fromName: params.fromName,
			dnsRecords: params.dnsRecords as never,
			status: "pending",
		})
		.returning();
	if (!row) {
		throw new Error("Failed to insert email_domains row");
	}
	return row;
}

export async function getEmailDomainById(
	controlPanelDb: ControlPanelDb,
	params: { id: string; organizationId: string },
): Promise<EmailDomainRow | null> {
	const rows = await controlPanelDb
		.select()
		.from(emailDomains)
		.where(
			and(
				eq(emailDomains.id, params.id),
				eq(emailDomains.organizationId, params.organizationId),
			),
		)
		.limit(1);
	return rows[0] ?? null;
}

export async function getEmailDomainByResendId(
	controlPanelDb: ControlPanelDb,
	resendDomainId: string,
): Promise<EmailDomainRow | null> {
	const rows = await controlPanelDb
		.select()
		.from(emailDomains)
		.where(eq(emailDomains.resendDomainId, resendDomainId))
		.limit(1);
	return rows[0] ?? null;
}

export async function getVerifiedEmailDomainForOrg(
	controlPanelDb: ControlPanelDb,
	organizationId: string,
): Promise<EmailDomainRow | null> {
	const rows = await controlPanelDb
		.select()
		.from(emailDomains)
		.where(
			and(
				eq(emailDomains.organizationId, organizationId),
				eq(emailDomains.status, "verified"),
			),
		)
		.orderBy(desc(emailDomains.verifiedAt))
		.limit(1);
	return rows[0] ?? null;
}

export async function listEmailDomainsForOrg(
	controlPanelDb: ControlPanelDb,
	organizationId: string,
): Promise<EmailDomainRow[]> {
	return controlPanelDb
		.select()
		.from(emailDomains)
		.where(eq(emailDomains.organizationId, organizationId))
		.orderBy(desc(emailDomains.createdAt));
}

export async function updateEmailDomainStatus(
	controlPanelDb: ControlPanelDb,
	params: {
		id: string;
		status: EmailDomainStatus;
		dnsRecords?: unknown;
	},
): Promise<EmailDomainRow | null> {
	const setValues: Partial<typeof emailDomains.$inferInsert> = {
		status: params.status,
		updatedAt: new Date(),
	};
	if (params.dnsRecords !== undefined) {
		setValues.dnsRecords = params.dnsRecords as never;
	}
	if (params.status === "verified") {
		setValues.verifiedAt = new Date();
	}
	const [row] = await controlPanelDb
		.update(emailDomains)
		.set(setValues)
		.where(eq(emailDomains.id, params.id))
		.returning();
	return row ?? null;
}

export interface RecordEmailLogParams {
	organizationId: string;
	emailDomainId: string | null;
	resendMessageId: string;
	fromAddress: string;
	toAddress: string;
	subject: string;
	status?: EmailLogStatus;
}

export async function recordEmailLog(
	controlPanelDb: ControlPanelDb,
	params: RecordEmailLogParams,
): Promise<EmailLogRow> {
	const [row] = await controlPanelDb
		.insert(emailLogs)
		.values({
			organizationId: params.organizationId,
			emailDomainId: params.emailDomainId,
			resendMessageId: params.resendMessageId,
			fromAddress: params.fromAddress,
			toAddress: params.toAddress,
			subject: params.subject,
			status: params.status ?? "queued",
		})
		.returning();
	if (!row) {
		throw new Error("Failed to insert email_logs row");
	}
	return row;
}

export interface UpdateEmailLogFromWebhookParams {
	resendMessageId: string;
	status: EmailLogStatus;
	eventType: string;
	eventAt: Date;
	errorMessage?: string | null;
	payload: unknown;
}

/**
 * Update an existing log row from a Resend webhook event. Returns null if the
 * row doesn't exist yet (race vs the original send write); callers should treat
 * that as success and rely on idempotent retries.
 */
export async function updateEmailLogFromWebhook(
	controlPanelDb: ControlPanelDb,
	params: UpdateEmailLogFromWebhookParams,
): Promise<EmailLogRow | null> {
	const [row] = await controlPanelDb
		.update(emailLogs)
		.set({
			status: params.status,
			lastEventType: params.eventType,
			lastEventAt: params.eventAt,
			errorMessage: params.errorMessage ?? null,
			lastEventPayload: params.payload as never,
			updatedAt: new Date(),
		})
		.where(eq(emailLogs.resendMessageId, params.resendMessageId))
		.returning();
	return row ?? null;
}
