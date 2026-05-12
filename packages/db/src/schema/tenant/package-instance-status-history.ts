/**
 * Package Instance Status History
 *
 * Append-only audit log of every status transition on a package_instances row.
 * Written in the same transaction as the status mutation via
 * `appendPackageInstanceStatusHistory()` in services.
 */

import { pgTable, uuid, index } from "drizzle-orm/pg-core";
import { packageInstances } from "./package-instances";
import { statusHistoryColumns } from "./_status-history-columns";

export const packageInstanceStatusHistory = pgTable(
	"package_instance_status_history",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		packageInstanceId: uuid("package_instance_id")
			.notNull()
			.references(() => packageInstances.id, { onDelete: "cascade" }),
		...statusHistoryColumns,
	},
	(t) => ({
		entityIdx: index("package_instance_status_hist_entity_idx").on(
			t.packageInstanceId,
			t.changedAt,
		),
	}),
);
