/**
 * Tenant Schema — membership_holds (Phase 3 Agent 3.1, J4)
 *
 * Audit trail of membership freezes (medical leave / travel / other).
 * One row per freeze; `status='active'` means the freeze is currently in
 * effect, `'completed'` after manual or auto-resume, `'cancelled'` if voided.
 *
 * Cron query (auto-resume) hits the partial-shaped `membership_holds_resume_idx`
 * filtering by `status='active'` AND `end_date <= NOW()`.
 */

import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { packageInstances } from "./package-instances";
import { members } from "./members";

export const membershipHolds = pgTable(
	"membership_holds",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		packageInstanceId: uuid("package_instance_id")
			.notNull()
			.references(() => packageInstances.id, { onDelete: "cascade" }),
		memberId: uuid("member_id").references(() => members.id, {
			onDelete: "set null",
		}),
		startDate: timestamp("start_date", { withTimezone: true }).notNull(),
		endDate: timestamp("end_date", { withTimezone: true }).notNull(),
		// 'medical' | 'travel' | 'other' (free-text — surfaced as enum on UI/API only)
		reason: text("reason").notNull(),
		feeWaived: boolean("fee_waived").default(false).notNull(),
		// 'active' | 'completed' | 'cancelled'
		status: text("status").notNull().default("active"),
		createdBy: text("created_by").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		resumedAt: timestamp("resumed_at", { withTimezone: true }),
	},
	(t) => ({
		packageIdx: index("membership_holds_package_idx").on(t.packageInstanceId),
		// Composite index used by the auto-resume cron:
		// `WHERE status='active' AND end_date <= NOW()`
		resumeIdx: index("membership_holds_resume_idx").on(t.endDate, t.status),
	}),
);
