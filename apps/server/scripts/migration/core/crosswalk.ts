/**
 * Legacy-id → Avantej-uuid crosswalk for idempotent, re-runnable loads.
 *
 * Keyed on (source_table, source_id, source_system). source_system comes from
 * the row itself (aoikumo / ghl / legacy_sheet / avantej) so the same logical
 * entity arriving from two upstreams doesn't collide. DDL runs outside the load
 * transaction; rows write inside it, so a dry-run rollback discards data and its
 * crosswalk entries together.
 */
import { sql } from "drizzle-orm";
import type { TenantDb, Tx } from "../lib/db";

export async function ensureCrosswalk(db: TenantDb): Promise<void> {
	// target_id is text (not uuid): Avantej ids vary — hierarchy nodes are uuids
	// but Better-Auth user ids are arbitrary strings.
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS mig_xwalk (
			source_table   text NOT NULL,
			source_id      text NOT NULL,
			source_system  text NOT NULL,
			target_table   text NOT NULL,
			target_id      text NOT NULL,
			created_at     timestamptz NOT NULL DEFAULT now(),
			PRIMARY KEY (source_table, source_id, source_system)
		)
	`);
	// Idempotent coercion for any table created by an earlier (uuid) version.
	await db.execute(sql`
		DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'mig_xwalk' AND column_name = 'target_id'
				  AND data_type = 'uuid'
			) THEN
				ALTER TABLE mig_xwalk ALTER COLUMN target_id TYPE text USING target_id::text;
			END IF;
		END $$;
	`);
}

export async function lookup(
	tx: Tx,
	sourceTable: string,
	sourceId: string,
	sourceSystem: string,
): Promise<string | null> {
	const r = await tx.execute(sql`
		SELECT target_id FROM mig_xwalk
		WHERE source_table = ${sourceTable}
		  AND source_id = ${sourceId}
		  AND source_system = ${sourceSystem}
		LIMIT 1
	`);
	const id = r.rows[0]?.target_id;
	return typeof id === "string" ? id : null;
}

export async function record(
	tx: Tx,
	sourceTable: string,
	sourceId: string,
	sourceSystem: string,
	targetTable: string,
	targetId: string,
): Promise<void> {
	await tx.execute(sql`
		INSERT INTO mig_xwalk
			(source_table, source_id, source_system, target_table, target_id)
		VALUES
			(${sourceTable}, ${sourceId}, ${sourceSystem}, ${targetTable}, ${targetId})
		ON CONFLICT (source_table, source_id, source_system)
		DO UPDATE SET target_id = EXCLUDED.target_id
	`);
}
