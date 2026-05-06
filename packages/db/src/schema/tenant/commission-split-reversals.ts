/**
 * Tenant Commission Split Reversals Schema (Agent 2.9 — Phase 2 Wave 3e — J5)
 *
 * Chain table linking refund → split reversal → payout adjustment.
 *
 * - One row per reversal of a commission_split. amount_cents is negative
 *   for clawbacks, positive for re-issued credits when a previous reversal
 *   is itself reversed.
 * - reversedByReversalId: self-FK forming a chain when X reverses Y reverses Z.
 *   Drizzle cannot emit a self-FK natively here without `(): any` cast.
 * - The self-FK is `DEFERRABLE INITIALLY DEFERRED` in the migration to allow
 *   in-cycle inserts within a single transaction. Drizzle's generator cannot
 *   emit DEFERRABLE — the migration is hand-rolled raw SQL.
 * - payoutAdjustmentId: optional link to the payouts row that carries the
 *   negative amount in the next batch.
 */

import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { commissionSplits } from "./commission-splits";
import { payouts } from "./payouts";
import { refunds } from "./refunds";

export const commissionSplitReversals = pgTable(
	"commission_split_reversals",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		reversedSplitId: uuid("reversed_split_id")
			.notNull()
			.references(() => commissionSplits.id, { onDelete: "restrict" }),
		refundId: uuid("refund_id")
			.notNull()
			.references(() => refunds.id, { onDelete: "restrict" }),
		// Self-FK: when a reversal is itself reversed.
		// `(): any` cast is required for self-references in Drizzle.
		reversedByReversalId: uuid("reversed_by_reversal_id").references(
			// biome-ignore lint/suspicious/noExplicitAny: drizzle self-FK pattern
			(): any => commissionSplitReversals.id,
			{ onDelete: "set null" },
		),
		payoutAdjustmentId: uuid("payout_adjustment_id").references(
			() => payouts.id,
			{ onDelete: "set null" },
		),
		amountCents: integer("amount_cents").notNull(), // negative = clawback
		reason: text("reason"),
		createdBy: text("created_by").notNull(), // members.userId
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => ({
		refundIdx: index("commission_split_reversals_refund_idx").on(t.refundId),
		reversedSplitIdx: index("commission_split_reversals_split_idx").on(
			t.reversedSplitId,
		),
	}),
);
