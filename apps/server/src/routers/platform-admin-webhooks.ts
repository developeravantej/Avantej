/**
 * Platform Admin — Webhooks Log (Plan F.4 — Agent Wh).
 *
 * Read-only operational view over `processed_webhook_events` (Stripe webhook
 * idempotency table, slot 0017 / ADR-0006). Surfaces success/failure counts,
 * dedupe stats (rows with attempts > 1), and a recent-events list with
 * filterable pagination.
 *
 * Schema columns used (control-panel.processed_webhook_events):
 *   - event_id   (PK, evt_xxx — Stripe global id)
 *   - event_type (text — e.g. "checkout.session.completed")
 *   - source     (text — 'platform' | 'connect' | 'reconciler')
 *   - received_at (timestamp — when the webhook hit our edge)
 *   - processed_at (timestamp, nullable — set on successful handler complete)
 *   - attempts   (int, default 1 — incremented on retries / dedupes)
 *   - error      (text, nullable — last error message)
 *
 * Derived "status":
 *   - "succeeded" → processed_at IS NOT NULL AND error IS NULL
 *   - "failed"    → error IS NOT NULL
 *   - "pending"   → processed_at IS NULL AND error IS NULL
 *
 * "duplicates" = rows with attempts > 1 (i.e. Stripe re-delivered and we
 * short-circuited via the dedupe table).
 *
 * Pure DB read against the control-panel DB. No audit row (read-only).
 * Gated behind requirePlatformAdmin — any role can read (mirrors
 * platform-admin-health.ts).
 */

import { z } from "zod";
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { adminProcedure } from "@/lib/admin-procedure";
import { processedWebhookEvents } from "@avantej-core/db/schema/control-panel/processed-webhook-events";

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

function toIsoString(d: unknown): string {
	if (d instanceof Date) return d.toISOString();
	if (typeof d === "string") return d;
	return "";
}

/**
 * Derive a coarse status label from the row's processed_at + error columns.
 * Exposed for unit testing.
 */
export function deriveStatus(row: {
	processedAt: Date | null;
	error: string | null;
}): "succeeded" | "failed" | "pending" {
	if (row.error) return "failed";
	if (row.processedAt) return "succeeded";
	return "pending";
}

const since = (days: number): Date => {
	const d = new Date();
	d.setUTCHours(0, 0, 0, 0);
	d.setUTCDate(d.getUTCDate() - days);
	return d;
};

export const platformAdminWebhooksRouter = {
	// ─────────────────────────────────────────────────────────────────────
	// getOverview — KPI tiles + per-event-type rollup + 20 most-recent.
	// ─────────────────────────────────────────────────────────────────────
	getOverview: adminProcedure
		.input(z.object({}).default({}))
		.handler(async ({ context }) => {
			const cpDb = cpDbFrom(context);

			const since24h = since(1);
			const since7d = since(7);

			const [k24h] = await cpDb
				.select({ c: sql<number>`COUNT(*)::int` })
				.from(processedWebhookEvents)
				.where(gte(processedWebhookEvents.receivedAt, since24h));
			const totalLast24h = k24h?.c ?? 0;

			const [k7d] = await cpDb
				.select({ c: sql<number>`COUNT(*)::int` })
				.from(processedWebhookEvents)
				.where(gte(processedWebhookEvents.receivedAt, since7d));
			const totalLast7d = k7d?.c ?? 0;

			const [kDup] = await cpDb
				.select({ c: sql<number>`COUNT(*)::int` })
				.from(processedWebhookEvents)
				.where(
					and(
						gte(processedWebhookEvents.receivedAt, since7d),
						sql`${processedWebhookEvents.attempts} > 1`,
					),
				);
			const duplicatesLast7d = kDup?.c ?? 0;

			const [kFail] = await cpDb
				.select({ c: sql<number>`COUNT(*)::int` })
				.from(processedWebhookEvents)
				.where(
					and(
						gte(processedWebhookEvents.receivedAt, since7d),
						isNotNull(processedWebhookEvents.error),
					),
				);
			const failuresLast7d = kFail?.c ?? 0;

			const [kSucc] = await cpDb
				.select({ c: sql<number>`COUNT(*)::int` })
				.from(processedWebhookEvents)
				.where(
					and(
						gte(processedWebhookEvents.receivedAt, since7d),
						isNotNull(processedWebhookEvents.processedAt),
						isNull(processedWebhookEvents.error),
					),
				);
			const successesLast7d = kSucc?.c ?? 0;

			// Per-event-type rollup (last 7d), sorted by count DESC then code ASC.
			const typeRows = await cpDb
				.select({
					eventType: processedWebhookEvents.eventType,
					count: sql<number>`COUNT(*)::int`.as("count"),
					lastSeenAt: sql<Date>`MAX(${processedWebhookEvents.receivedAt})`.as(
						"last_seen_at",
					),
				})
				.from(processedWebhookEvents)
				.where(gte(processedWebhookEvents.receivedAt, since7d))
				.groupBy(processedWebhookEvents.eventType);

			const byEventType = typeRows
				.map((r) => ({
					eventType: r.eventType,
					count: Number(r.count ?? 0),
					lastSeenAt: toIsoString(r.lastSeenAt),
				}))
				.sort((a, b) => {
					if (b.count !== a.count) return b.count - a.count;
					return a.eventType.localeCompare(b.eventType);
				});

			const uniqueEventTypes = byEventType.length;

			// 20 most-recent events overall.
			const recentRows = await cpDb
				.select({
					eventId: processedWebhookEvents.eventId,
					eventType: processedWebhookEvents.eventType,
					source: processedWebhookEvents.source,
					receivedAt: processedWebhookEvents.receivedAt,
					processedAt: processedWebhookEvents.processedAt,
					attempts: processedWebhookEvents.attempts,
					error: processedWebhookEvents.error,
				})
				.from(processedWebhookEvents)
				.orderBy(desc(processedWebhookEvents.receivedAt))
				.limit(20);

			const recent = recentRows.map((r) => ({
				id: r.eventId,
				eventId: r.eventId,
				eventType: r.eventType,
				source: r.source,
				receivedAt: toIsoString(r.receivedAt),
				processedAt: r.processedAt ? toIsoString(r.processedAt) : null,
				attempts: r.attempts ?? 1,
				status: deriveStatus(r),
				error: r.error ?? null,
			}));

			return {
				kpis: {
					totalLast24h,
					totalLast7d,
					duplicatesLast7d,
					uniqueEventTypes,
					successesLast7d,
					failuresLast7d,
				},
				byEventType,
				recent,
			};
		}),

	// ─────────────────────────────────────────────────────────────────────
	// listEvents — paginated table with eventType + days filter.
	// ─────────────────────────────────────────────────────────────────────
	listEvents: adminProcedure
		.input(
			z.object({
				eventType: z.string().optional(),
				days: z.number().int().min(1).max(90).default(7),
				limit: z.number().int().min(1).max(200).default(50),
				page: z.number().int().min(1).default(1),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);

			const sinceAt = since(input.days);
			const conds = [gte(processedWebhookEvents.receivedAt, sinceAt)];
			if (input.eventType && input.eventType.length > 0) {
				conds.push(eq(processedWebhookEvents.eventType, input.eventType));
			}
			const whereClause = conds.length === 1 ? conds[0] : and(...conds);

			const [totalRow] = await cpDb
				.select({ c: sql<number>`COUNT(*)::int` })
				.from(processedWebhookEvents)
				.where(whereClause);
			const total = totalRow?.c ?? 0;

			const offset = (input.page - 1) * input.limit;
			const rows = await cpDb
				.select({
					eventId: processedWebhookEvents.eventId,
					eventType: processedWebhookEvents.eventType,
					source: processedWebhookEvents.source,
					receivedAt: processedWebhookEvents.receivedAt,
					processedAt: processedWebhookEvents.processedAt,
					attempts: processedWebhookEvents.attempts,
					error: processedWebhookEvents.error,
				})
				.from(processedWebhookEvents)
				.where(whereClause)
				.orderBy(desc(processedWebhookEvents.receivedAt))
				.limit(input.limit)
				.offset(offset);

			return {
				rows: rows.map((r) => ({
					id: r.eventId,
					eventId: r.eventId,
					eventType: r.eventType,
					source: r.source,
					receivedAt: toIsoString(r.receivedAt),
					processedAt: r.processedAt ? toIsoString(r.processedAt) : null,
					attempts: r.attempts ?? 1,
					status: deriveStatus(r),
					error: r.error ?? null,
				})),
				total,
				page: input.page,
				limit: input.limit,
			};
		}),
};
