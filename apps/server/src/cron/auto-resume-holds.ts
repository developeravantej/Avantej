/**
 * Cron: auto-resume membership holds (Phase 3 Agent 3.1 — J4)
 *
 * Walks `membership_holds` for rows whose `end_date` has passed and which are
 * still `status='active'`, then calls `resumeMembership` for each. Each row
 * is resumed in its own transaction, so a single failure never aborts the
 * whole batch.
 *
 * Invocation
 * ----------
 * No project-wide cron runner exists today (grep `cron|scheduled` across
 * `apps/server/src` returned only string matches, no scheduler infra). Until
 * one is added, this handler can be invoked from:
 *
 *   1. A Cloudflare Workers Cron Trigger (`scheduled` handler in
 *      `wrangler.toml`) — wire `runAutoResumeHoldsHandler(env)` into the
 *      worker's `scheduled` export.
 *   2. A Hono route guarded by a shared secret, e.g. `/internal/cron/holds`
 *      hit by an external scheduler (cron-job.org, GitHub Actions, etc.).
 *   3. A one-off CLI (`bun run apps/server/scripts/run-cron.ts holds`).
 *
 * Cadence: hourly is plenty (holds resume on the day boundary; users tolerate
 * a sub-day delay). Daily at ~01:00 tenant-local is also fine.
 */

import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { runAutoResumeHolds } from "@avantej-core/services/membership.service";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type AutoResumeResult = {
	scanned: number;
	resumed: number;
	errors: { holdId: string; message: string }[];
};

/**
 * Run the auto-resume pass for a single tenant DB connection.
 *
 * The caller is responsible for iterating over tenants — this handler is
 * tenant-scoped because each tenant has its own Neon branch.
 */
export async function runAutoResumeHoldsForTenant(
	tenantDb: TenantDb,
	now: Date = new Date(),
): Promise<AutoResumeResult> {
	return runAutoResumeHolds(tenantDb, "system:auto-resume-holds", now);
}
