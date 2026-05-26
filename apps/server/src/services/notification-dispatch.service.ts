/**
 * Notification Email Dispatcher — ST-02.
 *
 * Hourly cron iterates every active organization, opens its tenant DB,
 * finds un-emailed announcement notifications created within the last 48 hours,
 * looks up the recipient's email from the control-panel `user` table, and
 * sends a minimal email via Resend.
 *
 * Only type="announcement" is handled here; other notification types have no
 * email template yet and are silently skipped.
 *
 * On Resend error: the failure is logged and counted but does NOT abort the
 * remaining notifications or organisations.
 */

import { eq, isNull, and, gte, sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { notifications } from "@avantej-core/db/schema/tenant/notifications";
import { user } from "@avantej-core/db/schema/auth";
import { sendEmail } from "@/lib/email";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type CpDb = NeonDatabase<typeof controlPanelSchema>;

export interface RunNotificationEmailDispatchArgs {
	controlPanelDb: CpDb;
	getTenantDb: (organizationId: string) => Promise<unknown>;
}

export interface NotificationDispatchReport {
	orgsScanned: number;
	emailsSent: number;
	errors: number;
}

/** 48-hour cap — avoids re-processing old backlog after a prolonged outage. */
const LOOKBACK_MS = 48 * 60 * 60 * 1000;

export async function runNotificationEmailDispatch(
	args: RunNotificationEmailDispatchArgs,
): Promise<NotificationDispatchReport> {
	const { controlPanelDb, getTenantDb } = args;

	const report: NotificationDispatchReport = {
		orgsScanned: 0,
		emailsSent: 0,
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

			const cutoff = new Date(Date.now() - LOOKBACK_MS);

			const pending = await tenantDb
				.select()
				.from(notifications)
				.where(
					and(
						eq(notifications.type, "announcement"),
						isNull(notifications.emailSentAt),
						gte(notifications.createdAt, cutoff),
					),
				);

			for (const notification of pending) {
				try {
					// Look up user email from control-panel DB using the cross-DB userId ref.
					const [recipient] = await controlPanelDb
						.select({ email: user.email, name: user.name })
						.from(user)
						.where(eq(user.id, notification.userId))
						.limit(1);

					if (!recipient?.email) {
						console.warn(
							`[notification-dispatch] org=${org.id} notification=${notification.id} — no email for userId=${notification.userId}, skipping`,
						);
						continue;
					}

					await sendEmail({
						to: recipient.email,
						subject: notification.title,
						text: notification.message,
						html: `<p>${escapeHtml(notification.message)}</p>`,
					});

					await tenantDb
						.update(notifications)
						.set({ emailSentAt: sql`now()` })
						.where(eq(notifications.id, notification.id));

					report.emailsSent++;
				} catch (notifErr) {
					report.errors++;
					console.error(
						`[notification-dispatch] org=${org.id} notification=${notification.id} send failed:`,
						notifErr instanceof Error ? notifErr.message : String(notifErr),
					);
				}
			}
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

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
