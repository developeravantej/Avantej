/**
 * Tenant Commission Splits Schema
 *
 * Stores the calculated commission splits for staff members per appointment or sales order.
 * Lifecycle: pending → approved → paid (or void from any state).
 *
 * Business Rules:
 * - Each row targets exactly one source: either appointmentId OR salesOrderId (enforced by CHECK constraint).
 * - One commission split per (appointment_id, staff_id) or (sales_order_id, staff_id) — enforced by two
 *   partial unique indexes (see migration 0024_commission_splits_status).
 * - splitPercentage must be between 0-100.
 * - calculatedAmount is pre-tax: sessionTotal × splitPercentage / 100 (integer cents).
 * - status follows: pending → approved → paid | void (from any state).
 *
 * NOTE: payoutId intentionally has NO Drizzle FK reference to payouts to avoid a circular
 * import (payouts.ts already references commission-splits.ts). The FK is enforced by the
 * raw SQL migration (ON DELETE SET NULL). Drizzle treats it as a plain uuid field.
 */

import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { appointments } from "./appointments";
import { salesOrders } from "./sales-orders";
import { packageInstances } from "./package-instances";
import { categoryCommissionConfigVersions } from "./category-commission-config-versions";
import { commissionTracks } from "./commission-tracks";
import { commissionTrackVersions } from "./commission-track-versions";

// Local type alias — canonical definition in @avantej-core/types.
// Exported so service-layer filters can cast user-supplied roleType strings
// when comparing against the typed column.
export type CommissionRoleType = "trainer" | "sales" | "marketing" | "referrer";

export const commissionSplits = pgTable(
	"commission_splits",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		// Target — exactly one must be set (enforced by CHECK constraint in migration 0046;
		// one-of-three: appointmentId | salesOrderId | packageInstanceId)
		appointmentId: uuid("appointment_id").references(() => appointments.id, {
			onDelete: "cascade",
		}),
		salesOrderId: uuid("sales_order_id").references(() => salesOrders.id, {
			onDelete: "restrict",
		}),
		// Agent 2.5 — third source: package instance (J5 commission audit)
		packageInstanceId: uuid("package_instance_id").references(
			() => packageInstances.id,
			{ onDelete: "set null" },
		),
		// Agent 2.5 — frozen commission config snapshot (J5 commission audit)
		configVersionId: uuid("config_version_id").references(
			() => categoryCommissionConfigVersions.id,
			{ onDelete: "restrict" },
		),

		// Staff
		staffId: text("staff_id").notNull(), // References members.userId (cross-DB — no FK)

		// Split details
		splitPercentage: integer("split_percentage").notNull(), // 0–100 integer (e.g. 70 = 70%)
		calculatedAmount: integer("calculated_amount").notNull(), // Pre-tax amount in integer cents
		notes: text("notes"),

		// Lifecycle status: pending | approved | paid | void
		status: text("status").notNull().default("pending"),

		// Approval
		approvedBy: text("approved_by"), // References members.userId
		approvedAt: timestamp("approved_at", { withTimezone: true }),

		// Payment
		paidBy: text("paid_by"), // References members.userId
		paidAt: timestamp("paid_at", { withTimezone: true }),

		// Payout linkage (no Drizzle FK — avoids circular import with payouts.ts)
		payoutId: uuid("payout_id"),

		// Commission calculation snapshot fields (no FKs — historical integrity)
		slotIndex: integer("slot_index"),
		conditionId: uuid("condition_id"), // Snapshot; no FK — config may change after creation
		trainerTierId: uuid("trainer_tier_id"), // Snapshot at time of calculation; no FK
		weightageBasisPoints: integer("weightage_basis_points"),
		baseAmountCents: integer("base_amount_cents"), // Rate before weightage applied
		splitType: text("split_type").notNull().default("automatic"), // "automatic" | "manual"
		manualNote: text("manual_note"), // Required when splitType="manual"

		// Migration 0046 — calculation flags (set by commission engine at split-creation time)
		// capApplied: true when the trainer's monthly cap was hit and amount was trimmed
		// floorApplied: true when the floor was applied (amount raised to minimum)
		// excluded: true when this split was skipped (discount threshold exceeded, etc.)
		// isComplimentary: true when the source sales order is complimentary
		capApplied: boolean("cap_applied").notNull().default(false),
		floorApplied: boolean("floor_applied").notNull().default(false),
		excluded: boolean("excluded").notNull().default(false),
		isComplimentary: boolean("is_complimentary").notNull().default(false),

		// Migration 0093 — staff dispute / contest workflow.
		// A trainer may contest a `pending`|`approved` split they believe is wrong.
		// The split moves to status='contested' (leaving the payout-eligible pool —
		// liability + batch queries filter on approved/paid), and a manager resolves
		// it (uphold → restore prior status, void, or adjust → void + new adjustment).
		// All cross-DB user references are plain text (no FK), per convention.
		contestedBy: text("contested_by"), // members.userId of the earner who contested
		contestedReason: text("contested_reason"), // free-text justification
		contestedCategory: text("contested_category"), // wrong_amount | wrong_staff | should_not_earn | missing_split | other
		contestedAt: timestamp("contested_at", { withTimezone: true }),
		contestedFromStatus: text("contested_from_status"), // status to restore on "uphold"
		resolvedBy: text("resolved_by"), // members.userId of the manager who resolved
		resolvedAt: timestamp("resolved_at", { withTimezone: true }),
		resolutionNote: text("resolution_note"),

		// Use earnedAt (not createdAt) for payroll period filtering
		earnedAt: timestamp("earned_at", { withTimezone: true }).notNull(),

		// Phase 1 (sales-pipeline-fixes): why this split was earned
		// "completion" | "cancellation" | "pos_product" | "manual"
		// nullable for historical rows pre-migration 0051
		earnReason: text("earn_reason"),

		// Actor who created this split (for manual adjustments / Review tab "created by").
		// Plain text; no FK — cross-DB user reference.
		createdByUserId: text("created_by_user_id"),

		// Migration 0083 — commission tracks columns (nullable; NULL for pre-migration rows)
		// trackId:        which CommissionTrack produced this split
		// roleType:       CommissionRoleType snapshot at split-creation time
		// trackVersionId: which CommissionTrackVersion was active at creation
		trackId: uuid("track_id").references(() => commissionTracks.id, {
			onDelete: "set null",
		}),
		roleType: text("role_type").$type<CommissionRoleType>(),
		trackVersionId: uuid("track_version_id").references(
			() => commissionTrackVersions.id,
			{ onDelete: "set null" },
		),

		// Migration 0092 — Phase D: per-installment origination commission.
		// NULL for single-payment / front-loaded rows (pre-Phase D and single plans).
		// Set to the installments.id that triggered this split for multi-installment plans.
		// No FK reference — plain column, matches cross-cutting style (avoids import cycle).
		installmentId: uuid("installment_id"),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => ({
		// Partial unique indexes handled in migration SQL (Drizzle can't express WHERE clause)
		// commission_splits_appt_staff_unique  ON (appointment_id, staff_id) WHERE appointment_id IS NOT NULL
		// commission_splits_so_staff_unique    ON (sales_order_id, staff_id) WHERE sales_order_id IS NOT NULL
		// commission_splits_so_track_staff_inst_unique — replaces 0083 index; one row per
		// (sales_order_id, track_id, staff_id, COALESCE(installment_id, sentinel_uuid))
		// managed in raw SQL (migration 0092) — Drizzle cannot express WHERE + COALESCE.

		// Regular indexes for query performance
		appointmentIdIdx: index("commission_splits_appointment_idx").on(
			table.appointmentId,
		),
		staffIdIdx: index("commission_splits_staff_idx").on(table.staffId),
		statusIdx: index("commission_splits_status_idx").on(table.status),
		payoutIdx: index("commission_splits_payout_idx").on(table.payoutId),
		salesOrderIdx: index("commission_splits_sales_order_idx").on(
			table.salesOrderId,
		),
		earnedAtIdx: index("commission_splits_earned_at_idx").on(table.earnedAt),
		packageInstanceIdx: index("commission_splits_package_instance_idx").on(
			table.packageInstanceId,
		),
		configVersionIdx: index("commission_splits_config_version_idx").on(
			table.configVersionId,
		),
		// Composite: payout query — find splits by staff+status sorted by earned date
		staffStatusEarnedIdx: index("commission_splits_staff_status_earned_idx").on(
			table.staffId,
			table.status,
			table.earnedAt,
		),
		// Migration 0083 — track lookups
		trackIdx: index("commission_splits_track_idx").on(table.trackId),
		// Migration 0092 — installment lookup
		installmentIdx: index("commission_splits_installment_idx").on(
			table.installmentId,
		),
		// NOTE: The partial unique indexes for (sales_order_id, track_id, staff_id)
		// and (appointment_id, track_id, staff_id) are managed in raw SQL (migrations
		// 0083 and 0092) — Drizzle uniqueIndex() cannot express WHERE/COALESCE clauses.
	}),
);
