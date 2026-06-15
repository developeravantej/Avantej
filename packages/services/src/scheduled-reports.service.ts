/**
 * Scheduled Reports Service
 *
 * CRUD on the tenant `scheduled_reports` table. The cron handler (in apps/server)
 * calls `listDueScheduledReports` + `markScheduledReportSent` to drive sends.
 *
 * Computing `nextRunAt`:
 * - daily   → +1 day
 * - weekly  → +7 days
 * - monthly → +1 calendar month (handles end-of-month rollover naturally via Date.setMonth)
 */

import { and, eq, lte } from "drizzle-orm";
import { scheduledReports } from "@avantej-core/db/schema/tenant/scheduled-reports";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type ScheduledReportFrequency = "daily" | "weekly" | "monthly";
export type ScheduledReportFormat = "pdf" | "csv";
export type ScheduledReportWindow = "7D" | "30D" | "90D" | "YTD";

export type ScheduledReportRow = typeof scheduledReports.$inferSelect;

export function computeNextRunAt(
	from: Date,
	frequency: ScheduledReportFrequency,
): Date {
	const next = new Date(from);
	if (frequency === "daily") {
		next.setDate(next.getDate() + 1);
	} else if (frequency === "weekly") {
		next.setDate(next.getDate() + 7);
	} else {
		next.setMonth(next.getMonth() + 1);
	}
	return next;
}

export type CreateScheduledReportParams = {
	recipients: string;
	reportName: string;
	windowKey: ScheduledReportWindow;
	format?: ScheduledReportFormat;
	frequency: ScheduledReportFrequency;
	createdBy?: string;
	/** Defaults to `now()` so the first run happens on the next cron tick. */
	startAt?: Date;
};

export async function createScheduledReport(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CreateScheduledReportParams,
): Promise<ScheduledReportRow> {
	const nextRunAt = params.startAt ?? new Date();
	const [row] = await tenantDb
		.insert(scheduledReports)
		.values({
			recipients: params.recipients,
			reportName: params.reportName,
			windowKey: params.windowKey,
			format: params.format ?? "pdf",
			frequency: params.frequency,
			isActive: true,
			nextRunAt,
			createdBy: params.createdBy,
		})
		.returning();
	if (!row) throw new Error("Failed to create scheduled report");
	return row;
}

export async function listScheduledReports(
	tenantDb: NeonDatabase<typeof tenantSchema>,
): Promise<ScheduledReportRow[]> {
	const rows = await tenantDb.select().from(scheduledReports);
	return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function deleteScheduledReport(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<void> {
	await tenantDb.delete(scheduledReports).where(eq(scheduledReports.id, id));
}

export async function toggleScheduledReportActive(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	isActive: boolean,
): Promise<ScheduledReportRow> {
	const [row] = await tenantDb
		.update(scheduledReports)
		.set({ isActive })
		.where(eq(scheduledReports.id, id))
		.returning();
	if (!row) throw new Error("Scheduled report not found");
	return row;
}

/**
 * Cron-side: rows that are active and due. Caller dispatches the email then
 * calls `markScheduledReportSent` to advance the schedule.
 */
export async function listDueScheduledReports(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	now: Date = new Date(),
): Promise<ScheduledReportRow[]> {
	return tenantDb
		.select()
		.from(scheduledReports)
		.where(
			and(
				eq(scheduledReports.isActive, true),
				lte(scheduledReports.nextRunAt, now),
			),
		);
}

export async function markScheduledReportSent(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	sentAt: Date = new Date(),
): Promise<void> {
	const [current] = await tenantDb
		.select()
		.from(scheduledReports)
		.where(eq(scheduledReports.id, id));
	if (!current) return;

	await tenantDb
		.update(scheduledReports)
		.set({
			lastSentAt: sentAt,
			lastError: null,
			nextRunAt: computeNextRunAt(sentAt, current.frequency),
		})
		.where(eq(scheduledReports.id, id));
}

export async function markScheduledReportFailed(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	error: string,
): Promise<void> {
	// Bump nextRunAt forward by 1 hour so we don't hot-loop on a broken row.
	const [current] = await tenantDb
		.select()
		.from(scheduledReports)
		.where(eq(scheduledReports.id, id));
	if (!current) return;

	const retryAt = new Date();
	retryAt.setHours(retryAt.getHours() + 1);

	await tenantDb
		.update(scheduledReports)
		.set({
			lastError: error.slice(0, 500),
			nextRunAt: retryAt,
		})
		.where(eq(scheduledReports.id, id));
}
