import {
	pgTable,
	uuid,
	integer,
	timestamp,
	uniqueIndex,
	index,
} from "drizzle-orm/pg-core";
import { members } from "./members";
import { services } from "./services";

export const memberServiceBufferOverrides = pgTable(
	"member_service_buffer_overrides",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		memberId: uuid("member_id")
			.notNull()
			.references(() => members.id, { onDelete: "cascade" }),
		serviceId: uuid("service_id")
			.notNull()
			.references(() => services.id, { onDelete: "cascade" }),
		bufferTimeMinutes: integer("buffer_time_minutes").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		memberServiceUniqueIdx: uniqueIndex("msbo_member_service_unique_idx").on(
			table.memberId,
			table.serviceId,
		),
		memberIdIdx: index("msbo_member_idx").on(table.memberId),
		serviceIdIdx: index("msbo_service_idx").on(table.serviceId),
	}),
);
