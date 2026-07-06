/**
 * WS6 (MOVE parity) — self-service CSV import: shared types.
 *
 * Importers reuse the normal entity services and are ADDITIVE historical
 * inserts (no POS pipeline, no commission side-effects), each idempotent on a
 * natural key so a re-run is a no-op. Import order matters: Clients first, then
 * Packages / Payments / Opening-balances which reference an existing customer.
 */

import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type TenantDb = NeonDatabase<typeof tenantSchema>;
export type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export type ImportEntity =
	| "clients"
	| "packages"
	| "payments"
	| "opening_balances";

export interface ImportContext {
	tenantDb: TenantDb;
	controlPanelDb: ControlPanelDb;
	organizationId: string;
	actorUserId: string;
}

/** Outcome for one CSV data row (1-based line, header excluded). */
export interface RowResult {
	line: number;
	ok: boolean;
	errors: string[];
	/** Set on a successful commit. */
	action?: "created" | "skipped";
	/** Human-readable id/reference of what was created/matched. */
	ref?: string;
}

export interface PreviewResult {
	entity: ImportEntity;
	rowCount: number;
	okCount: number;
	errorCount: number;
	results: RowResult[];
}

export interface CommitResult {
	entity: ImportEntity;
	jobId: string;
	rowCount: number;
	createdCount: number;
	skippedCount: number;
	errorCount: number;
	results: RowResult[];
}

export interface ColumnSpec {
	name: string;
	required: boolean;
	description: string;
}

/** A parse result: either a validated value or per-field error strings. */
export type ParseResult<T> =
	| { ok: true; value: T }
	| { ok: false; errors: string[] };

export interface ImporterSpec<Parsed> {
	entity: ImportEntity;
	label: string;
	columns: ColumnSpec[];
	/** Validate + coerce one raw row (no DB access). */
	parse: (raw: Record<string, string>) => ParseResult<Parsed>;
	/** Idempotent write. Throws to fail the row; returns the action taken. */
	commit: (
		ctx: ImportContext,
		value: Parsed,
	) => Promise<{ action: "created" | "skipped"; ref?: string }>;
}
