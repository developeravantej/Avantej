/**
 * Shared column shape for per-entity status_history tables.
 *
 * Used by:
 * - sales-order-status-history.ts
 * - payment-status-history.ts
 * - package-instance-status-history.ts
 * - appointment-status-history.ts
 *
 * Lives in the schema package (not services) to avoid cross-package
 * schema → service imports that would create a circular dependency.
 * Re-exported from `packages/services/src/status-history.helper.ts`
 * for service-side ergonomics.
 */

import { text, timestamp } from "drizzle-orm/pg-core";

export const statusHistoryColumns = {
	fromStatus: text("from_status"),
	toStatus: text("to_status").notNull(),
	changedBy: text("changed_by").notNull(),
	changedAt: timestamp("changed_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	reason: text("reason"),
	notes: text("notes"),
};
