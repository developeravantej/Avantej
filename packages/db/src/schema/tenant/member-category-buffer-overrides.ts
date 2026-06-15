import {
	pgTable,
	uuid,
	integer,
	timestamp,
	uniqueIndex,
	index,
} from "drizzle-orm/pg-core";
import { members } from "./members";
import { serviceCategories } from "./service-categories";

export const memberCategoryBufferOverrides = pgTable(
	"member_category_buffer_overrides",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		memberId: uuid("member_id")
			.notNull()
			.references(() => members.id, { onDelete: "cascade" }),
		categoryId: uuid("category_id")
			.notNull()
			.references(() => serviceCategories.id, { onDelete: "cascade" }),
		bufferTimeMinutes: integer("buffer_time_minutes").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		memberCategoryUniqueIdx: uniqueIndex("mcbo_member_category_unique_idx").on(
			table.memberId,
			table.categoryId,
		),
		memberIdIdx: index("mcbo_member_idx").on(table.memberId),
		categoryIdIdx: index("mcbo_category_idx").on(table.categoryId),
	}),
);
