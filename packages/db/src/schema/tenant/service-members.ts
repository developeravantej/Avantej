/**
 * Tenant Service Members Schema
 *
 * Junction table linking services to trainers/staff who can perform them.
 */

import {
	pgTable,
	uuid,
	boolean,
	timestamp,
	uniqueIndex,
	index,
} from "drizzle-orm/pg-core";
import { services } from "./services";
import { members } from "./members";

export const serviceMembers = pgTable(
	"service_members",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		serviceId: uuid("service_id")
			.notNull()
			.references(() => services.id, { onDelete: "cascade" }),
		memberId: uuid("member_id")
			.notNull()
			.references(() => members.id, { onDelete: "cascade" }),

		isPrimary: boolean("is_primary").default(false).notNull(),

		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => ({
		serviceMemberUniqueIdx: uniqueIndex("service_members_unique_idx").on(
			table.serviceId,
			table.memberId,
		),
		serviceIdIdx: index("service_members_service_idx").on(table.serviceId),
		memberIdIdx: index("service_members_member_idx").on(table.memberId),
	}),
);
