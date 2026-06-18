/**
 * Commission Track Versions Schema (Task #15)
 *
 * Append-only audit log for commission_tracks snapshots. Each save of a
 * commission_track creates a new version row. commission_splits rows carry
 * track_version_id so commission reviewers can reconstruct exactly which
 * track config produced a given split.
 *
 * versionNumber is monotonic per trackId (not globally unique).
 * snapshot is a jsonb mirror of the parent track's configuration at save time.
 */

import {
	index,
	integer,
	jsonb,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { commissionTracks } from "./commission-tracks";

export const commissionTrackVersions = pgTable(
	"commission_track_versions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		trackId: uuid("track_id")
			.notNull()
			.references(() => commissionTracks.id, { onDelete: "cascade" }),
		versionNumber: integer("version_number").notNull(),
		snapshot: jsonb("snapshot").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => ({
		trackVersionUnique: uniqueIndex(
			"commission_track_versions_track_version_unique",
		).on(table.trackId, table.versionNumber),
		trackIdx: index("commission_track_versions_track_idx").on(table.trackId),
	}),
);
