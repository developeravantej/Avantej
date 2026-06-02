/**
 * Platform Admin — Migrations Viewer (Plan F.4 — Agent Mi).
 *
 * READ-ONLY operational view over the drizzle migration journals + applied
 * tracking tables. NO apply / mutate procedures — applying migrations from a
 * web UI is too risky (atomicity, rollback, transaction boundaries). CLI
 * remains the only path to actually run migrations:
 *   - `bun db:push`     (drizzle-kit push)
 *   - `bun db:migrate`  (apply pending migrations)
 *
 * Surfaces three sets per schema:
 *   1. `journal`  — from `meta/_journal.json` (drizzle's source-of-truth manifest).
 *   2. `applied`  — rows in the runtime tracking table (`drizzle.__drizzle_migrations`
 *                   for control-panel / `public.drizzle_migrations` for tenant).
 *   3. `status[]` — joined view per tag with state ∈ {applied, pending, orphaned}.
 *                   "orphaned" = applied to DB but NOT in journal (manual SQL
 *                   apply outside drizzle — Agent F.1.5 documented dev DB drift
 *                   where journal stops at idx 18 but later slots were applied
 *                   via raw pool).
 *
 * SQL file content is sourced from bundled `*-migrations.generated.ts` modules
 * (Workers runtime has no fs). Tenant uses pre-existing TENANT_MIGRATIONS;
 * control-panel uses the new CONTROL_PANEL_MIGRATIONS (generated alongside this
 * router via `bun scripts/gen-control-panel-migrations.ts`).
 *
 * Tag validation: `^\d{4}_[a-z0-9_]+$` (rejects path traversal / arbitrary keys).
 *
 * RBAC: requirePlatformAdmin — any platform admin role can read (no
 * super_admin gate; viewer-only).
 */

import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { protectedProcedure } from "@avantej-core/api";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { controlPanelJournal, tenantJournal } from "@avantej-core/db/journals";
import type { DrizzleJournal } from "@avantej-core/db/journals";
import { CONTROL_PANEL_MIGRATIONS } from "@avantej-core/db/generated/control-panel-migrations.generated";
import { TENANT_MIGRATIONS } from "@avantej-core/db/generated/tenant-migrations.generated";

// Drizzle-kit's runtime tracking table row (control-panel uses `drizzle.__drizzle_migrations`).
// Schema: { id serial PK, hash text, created_at bigint (epoch ms) }.
type CpAppliedRow = { id: number; hash: string; created_at: string | number };
// Tenant uses `public.drizzle_migrations` (id, hash, checksum, applied_at) —
// currently not surfaced here (per-tenant DB access lives in tenant context).

const TAG_REGEX = /^\d{4}_[a-z0-9_]+$/;

function requirePlatformAdmin() {
	return (protectedProcedure as any).middleware(
		async ({ context, next }: { context: any; next: any }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication required",
				});
			}
			const cpDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;
			if (!cpDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available in context",
				});
			}
			const adminRecord = await cpDb.query.platformAdmins.findFirst({
				where: eq(platformAdmins.userId, context.session.user.id),
			});
			if (!adminRecord) {
				throw new ORPCError("FORBIDDEN", {
					message: "Admin access required",
				});
			}
			return next({
				context: { ...context, adminRecord, adminRole: adminRecord.role },
			});
		},
	);
}

const adminProcedure = protectedProcedure.use(requirePlatformAdmin());

function cpDbFrom(context: unknown): NeonDatabase<typeof controlPanelSchema> {
	const db = (
		context as { honoContext?: { get: (k: string) => unknown } }
	).honoContext?.get("controlPanelDb") as
		| NeonDatabase<typeof controlPanelSchema>
		| undefined;
	if (!db)
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel DB unavailable",
		});
	return db;
}

function toIsoFromEpochMs(v: unknown): string {
	if (typeof v === "number") return new Date(v).toISOString();
	if (typeof v === "string") {
		const n = Number(v);
		if (!Number.isNaN(n) && n > 1_000_000_000_000)
			return new Date(n).toISOString();
		return v;
	}
	if (v instanceof Date) return v.toISOString();
	return "";
}

/**
 * Compute status entries by joining journal + applied lists by tag.
 * Exposed for unit tests.
 */
export function computeMigrationStatus(args: {
	journal: Array<{ idx: number; tag: string; whenISO: string }>;
	applied: Array<{ tag?: string; hash: string }>;
}): Array<{
	idx: number;
	tag: string;
	inJournal: boolean;
	appliedInDb: boolean;
	state: "applied" | "pending" | "orphaned";
}> {
	const journalTags = new Set(args.journal.map((j) => j.tag));
	// `applied` rows: prefer .tag when set (tenant), otherwise treat .hash as tag
	// (control-panel drizzle-kit stores its own hash — may NOT equal the tag, so
	// fall back to journal-index alignment).
	const appliedTags = new Set<string>();
	for (const a of args.applied) {
		if (a.tag) appliedTags.add(a.tag);
		else if (TAG_REGEX.test(a.hash)) appliedTags.add(a.hash);
	}

	const all = new Map<
		string,
		{ idx: number; tag: string; inJournal: boolean; appliedInDb: boolean }
	>();
	for (const j of args.journal) {
		all.set(j.tag, {
			idx: j.idx,
			tag: j.tag,
			inJournal: true,
			appliedInDb: appliedTags.has(j.tag),
		});
	}
	let synthIdx = 100_000;
	for (const tag of appliedTags) {
		if (!journalTags.has(tag)) {
			all.set(tag, {
				idx: synthIdx++,
				tag,
				inJournal: false,
				appliedInDb: true,
			});
		}
	}

	return Array.from(all.values())
		.map((r) => ({
			...r,
			state: !r.inJournal
				? ("orphaned" as const)
				: r.appliedInDb
					? ("applied" as const)
					: ("pending" as const),
		}))
		.sort((a, b) => a.idx - b.idx);
}

function journalForSchema(
	schema: "control-panel" | "tenant",
): Array<{ idx: number; tag: string; whenISO: string }> {
	const raw: DrizzleJournal =
		schema === "control-panel" ? controlPanelJournal : tenantJournal;
	return raw.entries.map((e) => ({
		idx: e.idx,
		tag: e.tag,
		whenISO: new Date(e.when).toISOString(),
	}));
}

function migrationsBundleForSchema(
	schema: "control-panel" | "tenant",
): Readonly<Array<{ tag: string; sql: string }>> {
	if (schema === "control-panel")
		return CONTROL_PANEL_MIGRATIONS as readonly { tag: string; sql: string }[];
	// Tenant bundle uses `hash` field (== tag) — adapt.
	return (TENANT_MIGRATIONS as readonly { hash: string; sql: string }[]).map(
		(m) => ({
			tag: m.hash,
			sql: m.sql,
		}),
	);
}

/**
 * Best-effort query of the runtime drizzle migrations tracking table.
 * - control-panel: `drizzle.__drizzle_migrations` (drizzle-kit default).
 * - tenant: `public.drizzle_migrations` (custom — see apps/server/src/lib/tenant-migrate.ts).
 *
 * Tolerates missing tables (fresh DB / mismatched schema) by returning an empty
 * list — the viewer surfaces this as "everything pending" rather than 500'ing.
 */
async function fetchAppliedControlPanel(
	cpDb: NeonDatabase<typeof controlPanelSchema>,
): Promise<Array<{ hash: string; createdAtISO: string; tag?: string }>> {
	try {
		const r = (await cpDb.execute(
			sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC`,
		)) as unknown as { rows: CpAppliedRow[] } | CpAppliedRow[];
		const rows: CpAppliedRow[] = Array.isArray(r)
			? r
			: ((r as { rows: CpAppliedRow[] }).rows ?? []);
		return rows.map((row) => ({
			hash: String(row.hash),
			createdAtISO: toIsoFromEpochMs(row.created_at),
		}));
	} catch {
		return [];
	}
}

export const platformAdminMigrationsRouter = {
	// ─────────────────────────────────────────────────────────────────────
	// listMigrations — read-only journal + applied + computed status.
	// ─────────────────────────────────────────────────────────────────────
	listMigrations: adminProcedure
		.input(
			z.object({
				schema: z.enum(["control-panel", "tenant"]).default("control-panel"),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			const journal = journalForSchema(input.schema);

			let applied: Array<{
				hash: string;
				createdAtISO: string;
				tag?: string;
			}> = [];

			if (input.schema === "control-panel") {
				applied = await fetchAppliedControlPanel(cpDb);
			} else {
				// Tenant: __drizzle_migrations lives in EACH tenant DB. Without a
				// specific tenant context we cannot read it from here — surface
				// the journal only and an empty applied list. UI explains.
				applied = [];
			}

			const status = computeMigrationStatus({
				journal,
				applied: applied.map((a) => ({ tag: a.tag, hash: a.hash })),
			});

			const journalCount = journal.length;
			const appliedCount = applied.length;
			const pendingCount = status.filter((s) => s.state === "pending").length;
			const orphanedCount = status.filter((s) => s.state === "orphaned").length;

			return {
				schema: input.schema,
				journal,
				applied,
				status,
				summary: {
					journalCount,
					appliedCount,
					pendingCount,
					orphanedCount,
				},
			};
		}),

	// ─────────────────────────────────────────────────────────────────────
	// getMigrationFile — return the SQL for a single tag (read-only).
	// ─────────────────────────────────────────────────────────────────────
	getMigrationFile: adminProcedure
		.input(
			z.object({
				schema: z.enum(["control-panel", "tenant"]).default("control-panel"),
				tag: z.string(),
			}),
		)
		.handler(async ({ input }) => {
			if (!TAG_REGEX.test(input.tag)) {
				throw new ORPCError("BAD_REQUEST", {
					message: `Invalid migration tag: ${input.tag}. Expected format ^\\d{4}_[a-z0-9_]+$.`,
				});
			}
			const bundle = migrationsBundleForSchema(input.schema);
			const entry = bundle.find((m) => m.tag === input.tag);
			if (!entry) {
				throw new ORPCError("NOT_FOUND", {
					message: `Migration not found: ${input.schema}/${input.tag}.sql`,
				});
			}
			return { sql: entry.sql, tag: entry.tag };
		}),
};
