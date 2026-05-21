/**
 * Tenant: Scheduled Reports
 *
 * Lets an admin schedule a recurring email-report send. The Cloudflare Cron
 * Trigger on apps/server runs every hour, finds rows where `nextRunAt <= now()`,
 * dispatches the PDF/CSV via Resend, and bumps `lastSentAt`/`nextRunAt`.
 *
 * Cross-DB note: `createdBy` is a control-panel user id, stored as plain text
 * (per CLAUDE.md "Cross-DB references … never an FK constraint across databases").
 */

import {
	pgTable,
	uuid,
	text,
	boolean,
	timestamp,
	pgEnum,
	index,
} from "drizzle-orm/pg-core";

export const scheduledReportFrequencyEnum = pgEnum(
	"scheduled_report_frequency",
	["daily", "weekly", "monthly"],
);

export const scheduledReportFormatEnum = pgEnum("scheduled_report_format", [
	"pdf",
	"csv",
]);

export const scheduledReports = pgTable(
	"scheduled_reports",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		// Recipients: comma-separated emails. Multiple recipients per schedule.
		recipients: text("recipients").notNull(),
		reportName: text("report_name").notNull(),
		windowKey: text("window_key").notNull(), // "7D" | "30D" | "90D" | "YTD"
		format: scheduledReportFormatEnum("format").notNull().default("pdf"),
		frequency: scheduledReportFrequencyEnum("frequency").notNull(),

		isActive: boolean("is_active").notNull().default(true),
		nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
		lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
		lastError: text("last_error"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdBy: text("created_by"),
	},
	(table) => ({
		// Cron handler scans by (isActive, nextRunAt) — keep cheap.
		dueIdx: index("scheduled_reports_due_idx").on(
			table.isActive,
			table.nextRunAt,
		),
	}),
);

export type ScheduledReport = typeof scheduledReports.$inferSelect;
export type ScheduledReportInsert = typeof scheduledReports.$inferInsert;
