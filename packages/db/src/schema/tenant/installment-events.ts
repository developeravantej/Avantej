import {
	pgTable,
	uuid,
	text,
	integer,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { packageInstances } from "./package-instances";
import { installments } from "./installments";

export const installmentEvents = pgTable(
	"installment_events",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		packageInstanceId: uuid("package_instance_id")
			.notNull()
			.references(() => packageInstances.id, { onDelete: "cascade" }),
		installmentId: uuid("installment_id").references(() => installments.id, {
			onDelete: "set null",
		}),
		// Known eventType values: payment_confirmed, payment_overdue, package_locked,
		// package_unlocked, credits_adjusted, manual_override_unlock, refund_processed,
		// overdraft_enabled, overdraft_disabled
		eventType: text("event_type").notNull(),
		actorId: text("actor_id"),
		amount: integer("amount"),
		reason: text("reason"),
		metadata: text("metadata"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("installment_events_package_idx").on(table.packageInstanceId),
		index("installment_events_type_idx").on(table.eventType),
		index("installment_events_created_idx").on(table.createdAt),
	],
);
