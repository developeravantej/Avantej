/**
 * Tenant Member Profiles Schema
 *
 * Extended profile information for staff/trainers.
 * 1:1 relationship with members table.
 */

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { members } from "./members";

export const memberProfiles = pgTable(
	"member_profiles",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		memberId: uuid("member_id")
			.notNull()
			.unique()
			.references(() => members.id, { onDelete: "cascade" }),

		// Display info
		displayName: text("display_name"),
		bio: text("bio"),
		specialization: text("specialization"),

		// Media
		imageUrl: text("image_url"),

		// Contact override
		phoneNumber: text("phone_number"),

		// Certifications
		certifications: text("certifications").array(),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		memberIdIdx: index("member_profiles_member_idx").on(table.memberId),
	}),
);
