/**
 * Notification Email Dispatcher — ST-02.
 *
 * Hourly cron iterates every active organization, opens its tenant DB,
 * finds un-emailed announcement notifications created within the last 7 days,
 * looks up the recipient's email from the control-panel `user` table, and
 * sends a minimal email via Resend.
 *
 * Only type="announcement" is handled here; other notification types have no
 * email template yet and are silently skipped.
 *
 * Dispatch semantics:
 *   - At-most-once delivery: `email_sent_at` is set to now() BEFORE calling
 *     sendEmail. If sendEmail throws the row stays claimed and is NOT retried —
 *     preventing duplicate sends at the cost of occasional missed sends.
 *   - NAP-05: rows are claimed inside a transaction with SELECT … FOR UPDATE
 *     SKIP LOCKED so concurrent cron invocations cannot double-send.
 *   - NAP-02: if the recipient's notification_preferences.emailEnabled=false the
 *     notification is stamped (email_sent_at=now()) and skipped without sending.
 *   - SI-001: batch size is capped via NOTIFICATION_BATCH_SIZE env var (default 200).
 *   - NAP-08: lookback widened to 7 days; rows older than 24 h emit a console.warn.
 *   - SI-010: email subject sanitized against CRLF injection.
 */

import { eq, isNull, and, gte, sql, asc, inArray } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { notifications } from "@avantej-core/db/schema/tenant/notifications";
import { notificationPreferences } from "@avantej-core/db/schema/tenant/notification-preferences";
import { user } from "@avantej-core/db/schema/auth";
import { sendEmail } from "@/lib/email";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type CpDb = NeonDatabase<typeof controlPanelSchema>;

export interface RunNotificationEmailDispatchArgs {
	controlPanelDb: CpDb;
	getTenantDb: (organizationId: string) => Promise<unknown>;
	/** Override NOTIFICATION_BATCH_SIZE for testing. */
	batchSize?: number;
}

export interface NotificationDispatchReport {
	orgsScanned: number;
	emailsSent: number;
	suppressed: number;
	errors: number;
}

/** NAP-08: widened from 48 h to 7 days. */
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** Rows older than this threshold within the 7-day window get a stale-row warning. */
const STALE_WARN_MS = 24 * 60 * 60 * 1000;

/** SI-010: strip CRLF characters from email subjects to prevent header injection. */
export function sanitizeEmailSubject(s: string): string {
	return s.replace(/[\r\n]+/g, " ").slice(0, 200);
}

export function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Default batch cap when NOTIFICATION_BATCH_SIZE is unset/invalid (SI-001). */
const DEFAULT_BATCH_SIZE = 200;

/**
 * SI-001: resolve the per-org dispatch batch cap.
 *
 * Precedence: explicit `override` (test/caller) > NOTIFICATION_BATCH_SIZE env >
 * DEFAULT_BATCH_SIZE. An env value that is not a finite positive number (e.g.
 * "abc", "0", "-5") falls back to the default rather than producing a NaN /
 * non-positive LIMIT that would throw at the DB layer.
 */
export function resolveBatchSize(opts: {
	override?: number;
	envValue?: string | undefined;
}): number {
	if (opts.override !== undefined) return opts.override;
	if (opts.envValue) {
		const n = Number(opts.envValue);
		if (Number.isFinite(n) && n > 0) return n;
	}
	return DEFAULT_BATCH_SIZE;
}

/**
 * NAP-02: a notification is emailed unless the recipient has explicitly opted
 * out. An absent preference row (undefined/null) defaults to enabled.
 */
export function isEmailEnabled(pref: boolean | undefined | null): boolean {
	return pref ?? true;
}

/**
 * NAP-08: a claimed notification is "stale" when it has been waiting longer
 * than `thresholdMs` (default 24 h) at dispatch time — surfaced via a warning.
 */
export function isStaleNotification(
	createdAt: Date,
	now: Date,
	thresholdMs: number = STALE_WARN_MS,
): boolean {
	return createdAt.getTime() < now.getTime() - thresholdMs;
}

export async function runNotificationEmailDispatch(
	args: RunNotificationEmailDispatchArgs,
): Promise<NotificationDispatchReport> {
	const { controlPanelDb, getTenantDb } = args;

	// SI-001: configurable batch cap to prevent OOM on large tenants.
	const batchSize = resolveBatchSize({
		override: args.batchSize,
		envValue: process.env["NOTIFICATION_BATCH_SIZE"],
	});

	const report: NotificationDispatchReport = {
		orgsScanned: 0,
		emailsSent: 0,
		suppressed: 0,
		errors: 0,
	};

	const orgs = await controlPanelDb
		.select({ id: organizations.id, name: organizations.name })
		.from(organizations)
		.where(eq(organizations.paymentStatus, "active"));

	for (const org of orgs) {
		report.orgsScanned++;
		try {
			const tenantDb = (await getTenantDb(org.id)) as TenantDb;

			// NAP-08: 7-day lookback (widened from 48 h).
			const cutoff = new Date(Date.now() - LOOKBACK_MS);
			const staleThreshold = new Date(Date.now() - STALE_WARN_MS);

			// NAP-05 + NAP-01: SELECT … FOR UPDATE SKIP LOCKED inside a transaction
			// atomically claims this batch. No other concurrent dispatcher can claim
			// the same rows until this transaction commits.
			await tenantDb.transaction(async (tx) => {
				// SI-001: bounded fetch — oldest-first so no rows starve across runs.
				const pending = await tx
					.select()
					.from(notifications)
					.where(
						and(
							eq(notifications.type, "announcement"),
							isNull(notifications.emailSentAt),
							gte(notifications.createdAt, cutoff),
						),
					)
					.orderBy(asc(notifications.createdAt))
					.limit(batchSize)
					.for("update", { skipLocked: true });

				if (pending.length === 0) return;

				// NAP-08: warn on stale rows that have been waiting > 24 h.
				// (isStaleNotification(n.createdAt, now) is the unit-tested equivalent;
				// staleThreshold is precomputed = now - STALE_WARN_MS for the batch.)
				const staleRows = pending.filter((n) => n.createdAt < staleThreshold);
				if (staleRows.length > 0) {
					console.warn(
						`[notification-dispatch] org=${org.id} — ${staleRows.length} stale notification(s) (>24 h old) in dispatch batch`,
						{
							oldestCreatedAt: staleRows[0]?.createdAt,
							staleIds: staleRows.map((n) => n.id),
						},
					);
				}

				// NAP-01 (claim-before-send): stamp email_sent_at NOW, before any
				// network call, to prevent re-sends if a later DB write fails.
				// Rows already claimed by a concurrent worker are filtered out by
				// the FOR UPDATE SKIP LOCKED above, so every id here is genuinely
				// unclaimed.
				const ids = pending.map((n) => n.id);
				await tx
					.update(notifications)
					.set({ emailSentAt: sql`now()` })
					.where(inArray(notifications.id, ids));

				// NAP-02: bulk-fetch notification preferences for all affected users.
				const userIds = [...new Set(pending.map((n) => n.userId))];
				const prefRows = await tx
					.select({
						userId: notificationPreferences.userId,
						emailEnabled: notificationPreferences.emailEnabled,
					})
					.from(notificationPreferences)
					.where(inArray(notificationPreferences.userId, userIds));

				// Build a fast lookup map; absent row → default (emailEnabled=true).
				const prefByUserId = new Map(
					prefRows.map((p) => [p.userId, p.emailEnabled]),
				);

				// Resolve recipient emails from control-panel DB.
				const userRows = await controlPanelDb
					.select({ id: user.id, email: user.email, name: user.name })
					.from(user)
					.where(inArray(user.id, userIds));
				const emailByUserId = new Map(userRows.map((u) => [u.id, u.email]));

				// Dispatch each claimed notification.
				for (const notification of pending) {
					// NAP-02: honour per-user email preference (default true when no row).
					const emailEnabled = isEmailEnabled(
						prefByUserId.get(notification.userId),
					);
					if (!emailEnabled) {
						// Row is already claimed (email_sent_at set above). No send.
						report.suppressed++;
						console.info(
							`[notification-dispatch] org=${org.id} notification=${notification.id} suppressed (emailEnabled=false for userId=${notification.userId})`,
						);
						continue;
					}

					const recipientEmail = emailByUserId.get(notification.userId);
					if (!recipientEmail) {
						console.warn(
							`[notification-dispatch] org=${org.id} notification=${notification.id} — no email for userId=${notification.userId}, skipping`,
						);
						continue;
					}

					try {
						// SI-010: sanitize subject against CRLF header injection.
						// NAP-01 (at-most-once): if sendEmail throws here, we do NOT
						// roll back email_sent_at. The row stays claimed. The user
						// misses this send but will NOT receive a duplicate on the next
						// cron run. Correct tradeoff for transactional emails.
						await sendEmail({
							to: recipientEmail,
							subject: sanitizeEmailSubject(notification.title),
							text: notification.message,
							html: `<p>${escapeHtml(notification.message)}</p>`,
						});
						report.emailsSent++;
					} catch (sendErr) {
						report.errors++;
						console.error(
							`[notification-dispatch] org=${org.id} notification=${notification.id} send failed (row claimed, no retry):`,
							sendErr instanceof Error ? sendErr.message : String(sendErr),
						);
					}
				}
			});
		} catch (orgErr) {
			report.errors++;
			console.error(
				`[notification-dispatch] org=${org.id} top-level error:`,
				orgErr,
			);
		}
	}

	return report;
}
