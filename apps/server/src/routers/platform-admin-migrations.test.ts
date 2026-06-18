/**
 * Plan F.4 — Migrations Viewer router unit tests (Agent Mi).
 *
 * Pure logic tests around `computeMigrationStatus` (no DB needed) +
 * integration-style listMigrations / getMigrationFile against the dev
 * control-panel DB (uses real seeded admin user fixture).
 *
 * Read-only: never inserts to drizzle.__drizzle_migrations.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import {
	platformAdminMigrationsRouter,
	computeMigrationStatus,
} from "./platform-admin-migrations";
import { controlPanelDb } from "@/lib/db";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { user as userTable } from "@avantej-core/db/schema/auth";

const TEST_USER_ID = "test-admin-user-migrations";

function getHandler<T>(proc: unknown): (args: unknown) => Promise<T> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return ((proc as any)["~orpc"] as Record<string, unknown>).handler as (
		args: unknown,
	) => Promise<T>;
}

function fakeContext() {
	return {
		session: { user: { id: TEST_USER_ID, email: "admin@test.local" } },
		honoContext: {
			get: (k: string) => (k === "controlPanelDb" ? controlPanelDb : undefined),
		},
	};
}

beforeAll(async () => {
	const existingUser = await controlPanelDb.query.user.findFirst({
		where: eq(userTable.id, TEST_USER_ID),
	});
	if (!existingUser) {
		await controlPanelDb.insert(userTable).values({
			id: TEST_USER_ID,
			email: `${TEST_USER_ID}@test.local`,
			name: "Migrations Viewer Admin",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as typeof userTable.$inferInsert);
	}
	const existingPa = await controlPanelDb.query.platformAdmins.findFirst({
		where: eq(platformAdmins.userId, TEST_USER_ID),
	});
	if (!existingPa) {
		await controlPanelDb.insert(platformAdmins).values({
			userId: TEST_USER_ID,
			role: "super_admin",
		} as typeof platformAdmins.$inferInsert);
	}
});

// ───────────────────────────────────────────────────────────────────────────
// Pure logic — computeMigrationStatus
// ───────────────────────────────────────────────────────────────────────────

describe("computeMigrationStatus", () => {
	const j = [
		{ idx: 0, tag: "0000_first", whenISO: "2025-01-01T00:00:00.000Z" },
		{ idx: 1, tag: "0001_second", whenISO: "2025-01-02T00:00:00.000Z" },
		{ idx: 2, tag: "0002_third", whenISO: "2025-01-03T00:00:00.000Z" },
	];

	it("marks tag as applied when present in both journal and applied", () => {
		const status = computeMigrationStatus({
			journal: j,
			applied: [{ tag: "0000_first", hash: "0000_first" }],
		});
		const first = status.find((s) => s.tag === "0000_first")!;
		expect(first.state).toBe("applied");
		expect(first.inJournal).toBe(true);
		expect(first.appliedInDb).toBe(true);
	});

	it("marks tag as pending when in journal but not applied", () => {
		const status = computeMigrationStatus({ journal: j, applied: [] });
		expect(status.every((s) => s.state === "pending")).toBe(true);
	});

	it("marks tag as orphaned when applied in DB but not in journal", () => {
		const status = computeMigrationStatus({
			journal: j,
			applied: [
				{ tag: "0000_first", hash: "0000_first" },
				{ tag: "0099_manual_sql", hash: "0099_manual_sql" }, // orphan
			],
		});
		const orph = status.find((s) => s.tag === "0099_manual_sql");
		expect(orph).toBeDefined();
		expect(orph!.state).toBe("orphaned");
		expect(orph!.inJournal).toBe(false);
		expect(orph!.appliedInDb).toBe(true);
	});

	it("sorts entries by idx ascending and synthesises idx for orphans", () => {
		const status = computeMigrationStatus({
			journal: j,
			applied: [
				{ tag: "0001_second", hash: "0001_second" },
				{ tag: "0099_manual_sql", hash: "0099_manual_sql" },
			],
		});
		// Journal entries first (sorted by idx), orphans after (synthetic idx ≥ 100k).
		expect(status[0]!.tag).toBe("0000_first");
		expect(status[1]!.tag).toBe("0001_second");
		expect(status[2]!.tag).toBe("0002_third");
		expect(status[3]!.tag).toBe("0099_manual_sql");
		expect(status[3]!.idx).toBeGreaterThanOrEqual(100_000);
	});

	it("falls back to hash as tag when applied row has no .tag and hash matches tag regex", () => {
		const status = computeMigrationStatus({
			journal: j,
			// Mimic control-panel: hash IS the tag (drizzle-kit fallback).
			applied: [{ hash: "0000_first" } as { hash: string; tag?: string }],
		});
		expect(status.find((s) => s.tag === "0000_first")!.state).toBe("applied");
	});
});

// ───────────────────────────────────────────────────────────────────────────
// listMigrations — wraps real journal manifests, real DB read
// ───────────────────────────────────────────────────────────────────────────

describe("platformAdminMigrations.listMigrations", () => {
	it("returns control-panel journal with stable shape", async () => {
		type Resp = {
			schema: string;
			journal: Array<{ idx: number; tag: string; whenISO: string }>;
			applied: Array<{ hash: string; createdAtISO: string }>;
			status: Array<{ tag: string; state: string }>;
			summary: {
				journalCount: number;
				appliedCount: number;
				pendingCount: number;
				orphanedCount: number;
			};
		};
		const handler = getHandler<Resp>(
			platformAdminMigrationsRouter.listMigrations,
		);

		const result = await handler({
			context: fakeContext(),
			input: { schema: "control-panel" },
		});

		expect(result.schema).toBe("control-panel");
		// Journal has 19+ entries (0000..0018 baseline) — lower bound asserts no regression.
		expect(result.journal.length).toBeGreaterThanOrEqual(19);
		expect(result.journal[0]!.tag).toBe("0000_far_luminals");
		// Journal entries ordered by idx ascending.
		for (let i = 1; i < result.journal.length; i++) {
			expect(result.journal[i]!.idx).toBeGreaterThan(
				result.journal[i - 1]!.idx,
			);
		}
		expect(result.summary.journalCount).toBe(result.journal.length);
		expect(typeof result.summary.appliedCount).toBe("number");
		expect(typeof result.summary.pendingCount).toBe("number");
		expect(typeof result.summary.orphanedCount).toBe("number");
		// Every journal tag appears in status[].
		const statusTags = new Set(result.status.map((s) => s.tag));
		for (const j of result.journal) {
			expect(statusTags.has(j.tag)).toBe(true);
		}
	});

	it("returns tenant journal (applied[] is empty — multi-tenant)", async () => {
		type Resp = {
			schema: string;
			journal: Array<{ idx: number; tag: string }>;
			applied: Array<{ hash: string }>;
			status: Array<{ tag: string; state: string }>;
		};
		const handler = getHandler<Resp>(
			platformAdminMigrationsRouter.listMigrations,
		);

		const result = await handler({
			context: fakeContext(),
			input: { schema: "tenant" },
		});

		expect(result.journal.length).toBeGreaterThanOrEqual(20);
		expect(result.journal[0]!.tag).toBe("0000_noisy_aqueduct");
		// Tenant applied is always empty from control-panel context.
		expect(result.applied).toEqual([]);
		// All tenant journal entries should be marked pending.
		const statusForJournal = result.status.filter(
			(s) => s.tag === result.journal[0]!.tag,
		);
		expect(statusForJournal[0]!.state).toBe("pending");
	});
});

// ───────────────────────────────────────────────────────────────────────────
// getMigrationFile — returns SQL, rejects bad tags
// ───────────────────────────────────────────────────────────────────────────

describe("platformAdminMigrations.getMigrationFile", () => {
	it("returns SQL for a valid control-panel tag", async () => {
		const handler = getHandler<{ sql: string; tag: string }>(
			platformAdminMigrationsRouter.getMigrationFile,
		);
		const result = await handler({
			context: fakeContext(),
			input: { schema: "control-panel", tag: "0000_far_luminals" },
		});
		expect(result.tag).toBe("0000_far_luminals");
		expect(result.sql.length).toBeGreaterThan(0);
		expect(result.sql).toContain("CREATE TABLE");
	});

	it("returns SQL for a valid tenant tag", async () => {
		const handler = getHandler<{ sql: string; tag: string }>(
			platformAdminMigrationsRouter.getMigrationFile,
		);
		const result = await handler({
			context: fakeContext(),
			input: { schema: "tenant", tag: "0000_noisy_aqueduct" },
		});
		expect(result.tag).toBe("0000_noisy_aqueduct");
		expect(result.sql.length).toBeGreaterThan(0);
	});

	it("rejects path-traversal tag", async () => {
		const handler = getHandler<{ sql: string }>(
			platformAdminMigrationsRouter.getMigrationFile,
		);
		await expect(
			handler({
				context: fakeContext(),
				input: { schema: "control-panel", tag: "../../../etc/passwd" },
			}),
		).rejects.toThrow();
	});

	it("rejects tag with unsupported characters", async () => {
		const handler = getHandler<{ sql: string }>(
			platformAdminMigrationsRouter.getMigrationFile,
		);
		await expect(
			handler({
				context: fakeContext(),
				input: { schema: "control-panel", tag: "0000_HAS_UPPERCASE" },
			}),
		).rejects.toBeInstanceOf(ORPCError);
	});

	it("returns NOT_FOUND when valid-format tag does not exist", async () => {
		const handler = getHandler<{ sql: string }>(
			platformAdminMigrationsRouter.getMigrationFile,
		);
		await expect(
			handler({
				context: fakeContext(),
				input: { schema: "control-panel", tag: "9999_nonexistent_tag" },
			}),
		).rejects.toThrow(/not found/i);
	});
});
