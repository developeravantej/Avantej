/**
 * Email Domain & Log service
 *
 * Pure helpers over the control-panel `email_domains` and `email_logs` tables.
 * Accepts the Drizzle client as the first arg (no DB instantiation, no env reads)
 * so this file stays portable across Worker + Node test contexts. The Resend SDK
 * itself is wrapped in apps/server (it depends on env vars and the resend dep) —
 * this module only handles persistence + lookup logic.
 */

import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	inArray,
	lt,
	notInArray,
	or,
} from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { emailDomains } from "@avantej-core/db/schema/control-panel/email-domains";
import { emailDomainAliases } from "@avantej-core/db/schema/control-panel/email-domain-aliases";
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
export type EmailDomainAliasRow = typeof emailDomainAliases.$inferSelect;

type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export interface CreateEmailDomainParams {
	organizationId: string;
	/** Sending provider. Defaults to "resend" for backward compatibility. */
	provider?: "resend" | "cloudflare";
	/** Resend domain id (provider="resend"); null for Cloudflare rows. */
	resendDomainId?: string | null;
	/** Cloudflare zone + sending-subdomain id (provider="cloudflare"). */
	cfZoneId?: string | null;
	cfSubdomainId?: string | null;
	/** Cloudflare onboarding tier: "default" | "delegated" | "bare". */
	onboardingTier?: string | null;
	domain: string;
	fromName: string;
	dnsRecords: unknown;
	/**
	 * Initial verification status. Defaults to "pending". Cloudflare default-tier
	 * (<tenant>.avantej.com on our own zone) validates DNS instantly, so the
	 * router can pass the mapped live status straight through at create time.
	 */
	status?: EmailDomainStatus;
	/**
	 * Tenant-chosen default local-part (e.g. "support", "noreply"). Optional;
	 * when null, the send helper falls through to the hardcoded "support".
	 */
	defaultLocalPart?: string | null;
}

export async function createEmailDomain(
	controlPanelDb: ControlPanelDb,
	params: CreateEmailDomainParams,
): Promise<EmailDomainRow> {
	const [row] = await controlPanelDb
		.insert(emailDomains)
		.values({
			organizationId: params.organizationId,
			provider: params.provider ?? "resend",
			resendDomainId: params.resendDomainId ?? null,
			cfZoneId: params.cfZoneId ?? null,
			cfSubdomainId: params.cfSubdomainId ?? null,
			onboardingTier: params.onboardingTier ?? null,
			domain: params.domain,
			fromName: params.fromName,
			defaultLocalPart: params.defaultLocalPart ?? null,
			dnsRecords: params.dnsRecords as never,
			status: params.status ?? "pending",
		})
		.returning();
	if (!row) {
		throw new Error("Failed to insert email_domains row");
	}
	return row;
}

export interface UpdateEmailDomainSettingsParams {
	id: string;
	organizationId: string;
	fromName?: string;
	defaultLocalPart?: string | null;
}

/**
 * Update tenant-facing settings (from-name, default local-part) on a domain
 * row. Kept separate from `updateEmailDomainStatus`, which is driven by
 * Resend's verification state.
 */
export async function updateEmailDomainSettings(
	controlPanelDb: ControlPanelDb,
	params: UpdateEmailDomainSettingsParams,
): Promise<EmailDomainRow | null> {
	const setValues: Partial<typeof emailDomains.$inferInsert> = {
		updatedAt: new Date(),
	};
	if (params.fromName !== undefined) {
		setValues.fromName = params.fromName;
	}
	if (params.defaultLocalPart !== undefined) {
		setValues.defaultLocalPart = params.defaultLocalPart;
	}
	const [row] = await controlPanelDb
		.update(emailDomains)
		.set(setValues)
		.where(
			and(
				eq(emailDomains.id, params.id),
				eq(emailDomains.organizationId, params.organizationId),
			),
		)
		.returning();
	return row ?? null;
}

export async function deleteEmailDomain(
	controlPanelDb: ControlPanelDb,
	params: { id: string; organizationId: string },
): Promise<EmailDomainRow | null> {
	const [row] = await controlPanelDb
		.delete(emailDomains)
		.where(
			and(
				eq(emailDomains.id, params.id),
				eq(emailDomains.organizationId, params.organizationId),
			),
		)
		.returning();
	return row ?? null;
}

// ─── Aliases ─────────────────────────────────────────────────────────────────

export async function listAliasesForDomain(
	controlPanelDb: ControlPanelDb,
	emailDomainId: string,
): Promise<EmailDomainAliasRow[]> {
	return controlPanelDb
		.select()
		.from(emailDomainAliases)
		.where(eq(emailDomainAliases.emailDomainId, emailDomainId))
		.orderBy(asc(emailDomainAliases.localPart));
}

export async function addAlias(
	controlPanelDb: ControlPanelDb,
	params: { emailDomainId: string; localPart: string; label?: string | null },
): Promise<EmailDomainAliasRow> {
	const [row] = await controlPanelDb
		.insert(emailDomainAliases)
		.values({
			emailDomainId: params.emailDomainId,
			localPart: params.localPart,
			label: params.label ?? null,
		})
		.returning();
	if (!row) {
		throw new Error("Failed to insert email_domain_aliases row");
	}
	return row;
}

export async function removeAlias(
	controlPanelDb: ControlPanelDb,
	params: { id: string; emailDomainId: string },
): Promise<EmailDomainAliasRow | null> {
	const [row] = await controlPanelDb
		.delete(emailDomainAliases)
		.where(
			and(
				eq(emailDomainAliases.id, params.id),
				eq(emailDomainAliases.emailDomainId, params.emailDomainId),
			),
		)
		.returning();
	return row ?? null;
}

/**
 * Resolve an alias label to its local-part for a given verified domain.
 * Used by sendTenantEmail when caller passes `aliasLabel`.
 */
export async function resolveAliasLocalPart(
	controlPanelDb: ControlPanelDb,
	params: { emailDomainId: string; label: string },
): Promise<string | null> {
	const [row] = await controlPanelDb
		.select({ localPart: emailDomainAliases.localPart })
		.from(emailDomainAliases)
		.where(
			and(
				eq(emailDomainAliases.emailDomainId, params.emailDomainId),
				eq(emailDomainAliases.label, params.label),
			),
		)
		.limit(1);
	return row?.localPart ?? null;
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

/** Default ceilings for sending-domain registration (per org). Tunable. */
export const MAX_TOTAL_DOMAINS = 10;
export const MAX_CREATES_PER_HOUR = 5;

export type EmailDomainCreateLimitResult =
	| { allowed: true }
	| {
			allowed: false;
			/** ORPCError code the router should throw. */
			code: "BAD_REQUEST" | "TOO_MANY_REQUESTS";
			reason: string;
	  };

/**
 * Gate sending-domain registration per org BEFORE any Resend call (which
 * costs money), with two tiers:
 *  1. Total cap — bounds how many domains an org can accumulate.
 *  2. Hourly rate — smooths burst/loop abuse.
 *
 * Both are plain indexed COUNTs over `email_domains`. Caveat: delete +
 * recreate evades the hourly window (deleted rows lose their createdAt
 * history) but the total cap still bounds it — acceptable for a cost guard.
 */
export async function checkEmailDomainCreateAllowed(
	controlPanelDb: ControlPanelDb,
	organizationId: string,
	opts?: { maxTotal?: number; maxPerHour?: number; windowMs?: number },
): Promise<EmailDomainCreateLimitResult> {
	const maxTotal = opts?.maxTotal ?? MAX_TOTAL_DOMAINS;
	const maxPerHour = opts?.maxPerHour ?? MAX_CREATES_PER_HOUR;
	const windowMs = opts?.windowMs ?? 60 * 60 * 1000;

	const [totalRow] = await controlPanelDb
		.select({ n: count() })
		.from(emailDomains)
		.where(eq(emailDomains.organizationId, organizationId));
	const total = Number(totalRow?.n ?? 0);
	if (total >= maxTotal) {
		return {
			allowed: false,
			code: "BAD_REQUEST",
			reason: `Domain limit reached (${maxTotal}). Delete an unused domain before adding another.`,
		};
	}

	const since = new Date(Date.now() - windowMs);
	const [recentRow] = await controlPanelDb
		.select({ n: count() })
		.from(emailDomains)
		.where(
			and(
				eq(emailDomains.organizationId, organizationId),
				gte(emailDomains.createdAt, since),
			),
		);
	const recent = Number(recentRow?.n ?? 0);
	if (recent >= maxPerHour) {
		return {
			allowed: false,
			code: "TOO_MANY_REQUESTS",
			reason: `Too many domain registrations (${maxPerHour}/hour). Please try again later.`,
		};
	}

	return { allowed: true };
}

/**
 * List sending-domain rows across ALL orgs that are still mid-verification
 * (status in `pending`/`verifying`). Used by the background refresh cron to
 * re-poll Resend for DNS-propagation progress. Oldest-updated first so a
 * bounded batch always drains the most stale rows; `limit` caps the per-run
 * Resend API fan-out.
 */
export async function listStaleEmailDomains(
	controlPanelDb: ControlPanelDb,
	params?: { statuses?: EmailDomainStatus[]; limit?: number },
): Promise<EmailDomainRow[]> {
	const statuses = params?.statuses ?? ["pending", "verifying"];
	const limit = params?.limit ?? 50;
	return controlPanelDb
		.select()
		.from(emailDomains)
		.where(inArray(emailDomains.status, statuses))
		.orderBy(asc(emailDomains.updatedAt))
		.limit(limit);
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

/**
 * Statuses worth keeping longer — deliverability triage (bounces, spam
 * complaints, hard failures) stays useful past the standard window.
 */
export const EMAIL_LOG_FAILURE_STATUSES: EmailLogStatus[] = [
	"bounced",
	"complained",
	"failed",
];

export const EMAIL_LOG_RETENTION_STANDARD_DAYS = 90;
export const EMAIL_LOG_RETENTION_FAILURE_DAYS = 180;

export interface PurgeOldEmailLogsResult {
	deleted: number;
	batches: number;
	capped: boolean;
}

/**
 * Delete aged email_logs rows so the table doesn't grow unbounded. Two-tier:
 * normal rows expire after `standardDays`, failure rows (bounced/complained/
 * failed) after `failureDays`. Deletes in id-keyed batches so one run can't
 * lock the table or blow Worker CPU; `capped` is true when maxBatches was hit
 * (more remain for the next tick).
 */
export async function purgeOldEmailLogs(
	controlPanelDb: ControlPanelDb,
	opts?: {
		standardDays?: number;
		failureDays?: number;
		batchLimit?: number;
		maxBatches?: number;
	},
): Promise<PurgeOldEmailLogsResult> {
	const standardDays = opts?.standardDays ?? EMAIL_LOG_RETENTION_STANDARD_DAYS;
	const failureDays = opts?.failureDays ?? EMAIL_LOG_RETENTION_FAILURE_DAYS;
	const batchLimit = opts?.batchLimit ?? 5000;
	const maxBatches = opts?.maxBatches ?? 20;

	const now = Date.now();
	const standardCutoff = new Date(now - standardDays * 24 * 60 * 60 * 1000);
	const failureCutoff = new Date(now - failureDays * 24 * 60 * 60 * 1000);

	// A row is expired when:
	//   it is a failure status AND older than failureCutoff, OR
	//   it is NOT a failure status AND older than standardCutoff.
	const expiredPredicate = or(
		and(
			inArray(emailLogs.status, EMAIL_LOG_FAILURE_STATUSES),
			lt(emailLogs.createdAt, failureCutoff),
		),
		and(
			notInArray(emailLogs.status, EMAIL_LOG_FAILURE_STATUSES),
			lt(emailLogs.createdAt, standardCutoff),
		),
	);

	let deleted = 0;
	let batches = 0;
	let capped = false;

	for (;;) {
		if (batches >= maxBatches) {
			capped = true;
			break;
		}
		const victims = await controlPanelDb
			.select({ id: emailLogs.id })
			.from(emailLogs)
			.where(expiredPredicate)
			.limit(batchLimit);
		if (victims.length === 0) break;

		const ids = victims.map((v) => v.id);
		await controlPanelDb.delete(emailLogs).where(inArray(emailLogs.id, ids));
		deleted += ids.length;
		batches += 1;

		if (victims.length < batchLimit) break;
	}

	return { deleted, batches, capped };
}

export interface RecordEmailLogParams {
	organizationId: string;
	emailDomainId: string | null;
	/**
	 * Resend message id for successful sends, or a synthetic id (e.g.
	 * `failed:<uuid>`) for failures — needed because the column has a unique
	 * constraint for webhook idempotency and we don't want failed sends to
	 * collide with each other.
	 */
	resendMessageId: string;
	fromAddress: string;
	toAddress: string;
	subject: string;
	/** Notification type that produced the send (null for diagnostic sends). */
	notificationType?: string | null;
	/** Pass `"failed"` alongside `errorMessage` for a failed send. */
	status?: EmailLogStatus;
	errorMessage?: string | null;
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
			notificationType: params.notificationType ?? null,
			status: params.status ?? "queued",
			errorMessage: params.errorMessage ?? null,
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
	/**
	 * Org id (from Resend payload's `tags`). Required to insert a brand-new
	 * row if the webhook arrives before the original sendTenantEmail log write
	 * commits — we can't insert without it because of the NOT NULL FK.
	 */
	organizationId?: string | null;
	fromAddress?: string | null;
	toAddress?: string | null;
	subject?: string | null;
	notificationType?: string | null;
}

/**
 * Upsert a log row from a Resend webhook event. Updates the row if it exists
 * (matched by resendMessageId), or inserts a new row when the webhook arrives
 * before the original send write commits (only if `organizationId` is set —
 * required for the FK).
 *
 * Returns the row, or null if the row didn't exist AND no `organizationId`
 * was supplied (caller should log + drop the event).
 */
export async function upsertEmailLogFromWebhook(
	controlPanelDb: ControlPanelDb,
	params: UpdateEmailLogFromWebhookParams,
): Promise<EmailLogRow | null> {
	if (!params.organizationId) {
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

	const [row] = await controlPanelDb
		.insert(emailLogs)
		.values({
			organizationId: params.organizationId,
			emailDomainId: null,
			resendMessageId: params.resendMessageId,
			fromAddress: params.fromAddress ?? "",
			toAddress: params.toAddress ?? "",
			subject: params.subject ?? "",
			notificationType: params.notificationType ?? null,
			status: params.status,
			lastEventType: params.eventType,
			lastEventAt: params.eventAt,
			errorMessage: params.errorMessage ?? null,
			lastEventPayload: params.payload as never,
		})
		.onConflictDoUpdate({
			target: emailLogs.resendMessageId,
			set: {
				status: params.status,
				lastEventType: params.eventType,
				lastEventAt: params.eventAt,
				errorMessage: params.errorMessage ?? null,
				lastEventPayload: params.payload as never,
				updatedAt: new Date(),
			},
		})
		.returning();
	return row ?? null;
}

/**
 * @deprecated Use `upsertEmailLogFromWebhook` instead. Kept for back-compat
 * with existing callers — forwards to the upsert path.
 */
export async function updateEmailLogFromWebhook(
	controlPanelDb: ControlPanelDb,
	params: UpdateEmailLogFromWebhookParams,
): Promise<EmailLogRow | null> {
	return upsertEmailLogFromWebhook(controlPanelDb, params);
}
