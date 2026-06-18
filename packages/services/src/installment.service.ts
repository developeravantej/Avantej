/**
 * Installment Service
 *
 * Handles installment-based credit unlocking for package instances.
 * Supports schedule creation, payment confirmation, lock/unlock logic,
 * and admin overview queries.
 */

import {
	eq,
	and,
	isNull,
	asc,
	isNotNull,
	or,
	ilike,
	lt,
	lte,
	gt,
	gte,
	inArray,
	sql,
} from "drizzle-orm";
import { appendPackageInstanceStatusHistory } from "./status-history.helper";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { installmentEvents } from "@avantej-core/db/schema/tenant/installment-events";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { notifications } from "@avantej-core/db/schema/tenant/notifications";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user } from "@avantej-core/db/schema/auth";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { writeAudit } from "./audit-log.service";
import { markCompleteIfFinal } from "./package-instance.service";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;
// Drizzle transaction type: same shape as base DB client within a tx callback
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default grace period used when a service has no per-service override. */
export const DEFAULT_GRACE_PERIOD_DAYS = 7;

// ---------------------------------------------------------------------------
// Grace period helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the grace period for a given package instance by joining to its service.
 * Returns the service's gracePeriodDays if set, otherwise DEFAULT_GRACE_PERIOD_DAYS.
 */
export async function getGracePeriodDaysForPackage(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
): Promise<number> {
	const rows = await tenantDb
		.select({ gracePeriodDays: services.gracePeriodDays })
		.from(packageInstances)
		.leftJoin(services, eq(packageInstances.serviceId, services.id))
		.where(eq(packageInstances.id, packageInstanceId))
		.limit(1);
	const gracePeriodDays = rows[0]?.gracePeriodDays;
	return gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS;
}

// ---------------------------------------------------------------------------
// Pure math helpers
// ---------------------------------------------------------------------------

/**
 * Calculate credits unlocked given how many installments have been paid.
 */
export function calculateCreditsUnlocked(
	creditsTotal: number,
	installmentsPaid: number,
	installmentsTotal: number,
): number {
	if (installmentsPaid >= installmentsTotal) return creditsTotal;
	if (installmentsPaid <= 0) return 0;
	return Math.floor((creditsTotal * installmentsPaid) / installmentsTotal);
}

/**
 * Split a total price into installment amounts.
 * The LAST installment absorbs any rounding remainder, matching the tax-
 * remainder convention used elsewhere in this service (see :247-249).
 * Audit F-INS-1 (2026-05-27 audit-prove-a session): prior implementation
 * placed the remainder on installment #1, which was inconsistent with the
 * tax-remainder behaviour and surprising for operators reading schedules.
 * Returns an array of length `installmentsTotal`.
 */
export function calculateInstallmentAmounts(
	totalPrice: number,
	installmentsTotal: number,
): number[] {
	const base = Math.floor(totalPrice / installmentsTotal);
	const remainder = totalPrice - base * installmentsTotal;
	const amounts: number[] = [];
	for (let i = 0; i < installmentsTotal; i++) {
		amounts.push(i === installmentsTotal - 1 ? base + remainder : base);
	}
	return amounts;
}

export type SuggestedRefundInput = {
	creditsTotal: number;
	creditsUnlocked: number;
	creditsUsed: number;
	totalPrice: number; // cents
	paidAmount: number; // sum of paid installment amounts, cents
	paidTaxAmount: number; // sum of paid installment tax amounts, cents
};

export type SuggestedRefundResult = {
	pricePerCredit: number;
	unusedCredits: number;
	unusedCreditValue: number;
	suggestedRefund: number;
	suggestedRefundTax: number;
	reasoning: string;
};

/**
 * Pure function: calculate a suggested refund amount based on package state.
 * No DB access. Safe to call multiple times.
 *
 * Logic:
 * - pricePerCredit = floor(totalPrice / creditsTotal)
 * - unusedCredits = creditsUnlocked - creditsUsed (clamped ≥ 0)
 * - unusedCreditValue = pricePerCredit × unusedCredits
 * - suggestedRefund = min(unusedCreditValue, paidAmount) — capped at what was paid
 * - suggestedRefundTax = proportional share of paidTaxAmount
 */
export function calculateSuggestedRefund(
	input: SuggestedRefundInput,
): SuggestedRefundResult {
	const {
		creditsTotal,
		creditsUnlocked,
		creditsUsed,
		totalPrice,
		paidAmount,
		paidTaxAmount,
	} = input;

	if (creditsTotal <= 0) {
		return {
			pricePerCredit: 0,
			unusedCredits: 0,
			unusedCreditValue: 0,
			suggestedRefund: 0,
			suggestedRefundTax: 0,
			reasoning: "No credits in this package.",
		};
	}

	const pricePerCredit = Math.floor(totalPrice / creditsTotal);
	const unusedCredits = Math.max(0, creditsUnlocked - creditsUsed);
	const unusedCreditValue = pricePerCredit * unusedCredits;
	const suggestedRefund = Math.min(unusedCreditValue, paidAmount);
	const suggestedRefundTax =
		paidAmount > 0
			? Math.round(paidTaxAmount * (suggestedRefund / paidAmount))
			: 0;

	const reasoning =
		unusedCredits === 0
			? "All unlocked credits have been used — no refund value."
			: `${unusedCredits} unused credit${unusedCredits === 1 ? "" : "s"} × RM ${(pricePerCredit / 100).toFixed(2)} = RM ${(unusedCreditValue / 100).toFixed(2)}, capped at amount paid.`;

	return {
		pricePerCredit,
		unusedCredits,
		unusedCreditValue,
		suggestedRefund,
		suggestedRefundTax,
		reasoning,
	};
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

type LogInstallmentEventParams = {
	packageInstanceId: string;
	installmentId?: string | null;
	eventType: string;
	actorId?: string | null;
	amount?: number | null;
	reason?: string | null;
	metadata?: string | null;
};

async function logInstallmentEvent(
	tenantDb: TenantDb | TenantTx,
	params: LogInstallmentEventParams,
): Promise<void> {
	await tenantDb.insert(installmentEvents).values({
		packageInstanceId: params.packageInstanceId,
		installmentId: params.installmentId ?? null,
		eventType: params.eventType,
		actorId: params.actorId ?? null,
		amount: params.amount ?? null,
		reason: params.reason ?? null,
		metadata: params.metadata ?? null,
	});
}

function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

/** Returns the start of the given day in UTC (midnight). Used for date-only comparisons. */
function startOfDayUTC(date: Date): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
}

// ---------------------------------------------------------------------------
// Schedule creation
// ---------------------------------------------------------------------------

export type CreateInstallmentScheduleParams = {
	packageInstanceId: string;
	creditsTotal: number;
	totalPrice: number;
	taxAmount: number;
	installmentsTotal: number;
	intervalDays: number;
	purchaseDate: Date;
	/** Reconciliation FK added by migration 0051. Pass the sales_order id when
	 *  the schedule originates from a POS or web package purchase. */
	salesOrderId?: string | null;
};

/**
 * Create an installment schedule for a package instance.
 * Also updates nextDueDate and installmentsTotal on the package instance.
 *
 * Pass `opts.inTransaction = true` when calling from inside an existing transaction —
 * this runs the body directly instead of opening a new transaction (or savepoint).
 * Do NOT use duck-typing on `db` — both TenantDb and TenantTx expose `.transaction`.
 */
export async function createInstallmentSchedule(
	db: TenantDb | TenantTx,
	params: CreateInstallmentScheduleParams,
	opts?: { inTransaction?: boolean },
): Promise<(typeof installments.$inferSelect)[]> {
	console.log("[installment] createInstallmentSchedule", {
		packageInstanceId: params.packageInstanceId,
		installmentsTotal: params.installmentsTotal,
		totalPrice: params.totalPrice,
		intervalDays: params.intervalDays,
		purchaseDate: params.purchaseDate.toISOString(),
	});

	const installmentsTotal = params.installmentsTotal;
	const amounts = calculateInstallmentAmounts(
		params.totalPrice,
		installmentsTotal,
	);
	const baseTaxPerInstallment = Math.floor(
		params.taxAmount / installmentsTotal,
	);
	const taxRemainder =
		params.taxAmount - baseTaxPerInstallment * installmentsTotal;

	const run = async (tx: TenantTx) => {
		const rows: (typeof installments.$inferSelect)[] = [];

		for (let i = 1; i <= installmentsTotal; i++) {
			const amount = amounts[i - 1] ?? 0;
			// Last installment absorbs the tax rounding remainder
			const taxAmount =
				i === installmentsTotal
					? baseTaxPerInstallment + taxRemainder
					: baseTaxPerInstallment;
			// i=1 → day 0 (due at purchase), i=2 → day intervalDays, etc.
			const dueDate = addDays(
				params.purchaseDate,
				(i - 1) * params.intervalDays,
			);
			const creditsUnlockedByThis =
				calculateCreditsUnlocked(params.creditsTotal, i, installmentsTotal) -
				calculateCreditsUnlocked(params.creditsTotal, i - 1, installmentsTotal);

			const [row] = await tx
				.insert(installments)
				.values({
					packageInstanceId: params.packageInstanceId,
					salesOrderId: params.salesOrderId ?? null,
					installmentNumber: i,
					amount,
					taxAmount,
					status: "pending",
					dueDate,
					creditsUnlockedByThis,
				})
				.returning();

			if (row) {
				console.log("[installment] created installment row", {
					installmentNumber: row.installmentNumber,
					amount: row.amount,
					dueDate: row.dueDate.toISOString(),
					creditsUnlockedByThis: row.creditsUnlockedByThis,
				});
				rows.push(row);
			}
		}

		console.log("[installment] schedule created", {
			packageInstanceId: params.packageInstanceId,
			count: rows.length,
		});

		// Update packageInstance with schedule metadata — atomic with inserts
		const firstDueDate =
			rows[0]?.dueDate ?? addDays(params.purchaseDate, params.intervalDays);
		await tx
			.update(packageInstances)
			.set({
				installmentsTotal,
				nextDueDate: firstDueDate,
				updatedAt: new Date(),
			})
			.where(eq(packageInstances.id, params.packageInstanceId));

		return rows;
	};

	if (opts?.inTransaction) {
		return run(db as TenantTx);
	}
	return (db as TenantDb).transaction(run);
}

// ---------------------------------------------------------------------------
// Payment confirmation
// ---------------------------------------------------------------------------

export type ConfirmInstallmentPaymentParams = {
	installmentId: string;
	paymentMethod: "manual_transfer" | "cash" | "card" | "fpx" | "stripe";
	notes?: string;
	confirmedBy: string;
	nextIntervalDays?: number;
	/**
	 * Phase C — partial payments. Cents to apply against this installment.
	 * Omitted = pay the full remaining balance (legacy behaviour). Clamped to
	 * the remaining balance; the installment only flips to "paid" once
	 * cumulative amount_paid covers amount + taxAmount.
	 */
	amount?: number;
	/** Stripe correlation ids (Phase E) — persisted on the installment row. */
	stripePaymentIntentId?: string;
	stripePaymentLinkId?: string;
};

export async function confirmInstallmentPayment(
	tenantDb: TenantDb | TenantTx,
	params: ConfirmInstallmentPaymentParams,
	opts?: { inTransaction?: boolean },
): Promise<{
	installment: typeof installments.$inferSelect;
	packageInstance: typeof packageInstances.$inferSelect;
}> {
	console.log("[installment] confirmInstallmentPayment", {
		installmentId: params.installmentId,
		paymentMethod: params.paymentMethod,
		confirmedBy: params.confirmedBy,
		inTransaction: opts?.inTransaction ?? false,
	});

	const run = async (tx: TenantTx) => {
		// -----------------------------------------------------------------------
		// CANONICAL LOCK ORDER: PARENT (package_instances) → CHILD (installments)
		//
		// Both confirmInstallmentPayment and evaluateAndLockIfOverdue (sweep path)
		// must acquire locks in this order to prevent deadlocks.  Taking the child
		// lock first would create a cycle when the sweep concurrently holds the
		// parent and waits for the child.
		//
		// When opts.inTransaction = true the caller already holds its own tx and
		// its own row locks; the FOR UPDATE clauses below are still issued so that
		// concurrent sweep jobs that share the canonical lock order will block
		// rather than conflict.
		// -----------------------------------------------------------------------

		// 1. Lock the package instance first (PARENT)
		// We must read packageInstanceId from the installment row first.
		const [probe] = await tx
			.select({ packageInstanceId: installments.packageInstanceId })
			.from(installments)
			.where(eq(installments.id, params.installmentId));
		if (!probe) throw new Error("Installment not found");

		const [pkg] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, probe.packageInstanceId))
			.for("update");
		if (!pkg) throw new Error("Package instance not found");

		// 2. Lock the installment row second (CHILD)
		const [installment] = await tx
			.select()
			.from(installments)
			.where(eq(installments.id, params.installmentId))
			.for("update");
		if (!installment) throw new Error("Installment not found");

		// CAS-style re-check: status may have changed while we waited for locks
		if (installment.status !== "pending" && installment.status !== "overdue") {
			throw new Error(`Installment is already ${installment.status}`);
		}

		// LC-M3: reject payment confirmation on terminal package statuses
		if (["cancelled", "expired", "completed"].includes(pkg.status)) {
			throw new Error(`Cannot confirm payment for a ${pkg.status} package.`);
		}

		const now = new Date();

		// -------- Phase C: partial-payment accounting --------
		const dueTotal = installment.amount + (installment.taxAmount ?? 0);
		const alreadyPaid = installment.amountPaid ?? 0;
		const remaining = Math.max(0, dueTotal - alreadyPaid);
		// Default = pay the full remaining balance (legacy callers: POS, webhook).
		const requested = params.amount ?? remaining;
		const payment = Math.min(Math.max(0, requested), remaining);
		if (payment <= 0) {
			throw new Error("Installment already fully paid — nothing to collect.");
		}
		const newAmountPaidThis = alreadyPaid + payment;
		const isFull = newAmountPaidThis >= dueTotal;

		// Update the installment row. Status only flips to "paid" on full
		// settlement; a partial payment leaves it pending/overdue but records
		// amount_paid so subsequent top-ups accumulate.
		const [updatedInstallment] = await tx
			.update(installments)
			.set({
				...(isFull ? { status: "paid", paidAt: now } : {}),
				amountPaid: newAmountPaidThis,
				paymentMethod: params.paymentMethod,
				confirmedBy: params.confirmedBy,
				notes: params.notes ?? installment.notes ?? null,
				...(params.stripePaymentIntentId
					? { stripePaymentIntentId: params.stripePaymentIntentId }
					: {}),
				...(params.stripePaymentLinkId
					? { stripePaymentLinkId: params.stripePaymentLinkId }
					: {}),
				updatedAt: now,
			})
			.where(eq(installments.id, params.installmentId))
			.returning();

		if (!updatedInstallment) throw new Error("Failed to update installment");

		// installmentsPaid only advances when an installment fully clears.
		const newInstallmentsPaid = pkg.installmentsPaid + (isFull ? 1 : 0);

		// -------- Credits: proportional to total money paid across the package --------
		// User decision 2026-06-13: unlock credits proportional to amount paid.
		// Basis is money paid / total due (converges to creditsTotal at full
		// settlement). max() so an admin override / prior unlock never rolls back.
		const allRows = await tx
			.select({
				amount: installments.amount,
				taxAmount: installments.taxAmount,
				amountPaid: installments.amountPaid,
			})
			.from(installments)
			.where(eq(installments.packageInstanceId, pkg.id));
		const totalDueAll = allRows.reduce(
			(s, r) => s + r.amount + (r.taxAmount ?? 0),
			0,
		);
		const totalPaidAll = allRows.reduce((s, r) => s + (r.amountPaid ?? 0), 0);
		const proportionalCredits =
			totalDueAll > 0
				? Math.floor((pkg.creditsTotal * totalPaidAll) / totalDueAll)
				: 0;
		const newCreditsUnlocked = Math.max(
			pkg.creditsUnlocked ?? 0,
			proportionalCredits,
		);

		// -------- nextDueDate / grace: only advance on full settlement --------
		let newNextDueDate: Date | null = pkg.nextDueDate;
		let newGracePeriodEndsAt: Date | null = pkg.gracePeriodEndsAt;
		if (isFull) {
			newGracePeriodEndsAt = null; // a full payment clears grace pressure
			if (newInstallmentsPaid < pkg.installmentsTotal) {
				if (params.nextIntervalDays !== undefined) {
					newNextDueDate = addDays(now, params.nextIntervalDays);
				} else {
					// Next still-owed installment (pending OR overdue)
					const nextInstallment = await tx.query.installments.findFirst({
						where: and(
							eq(installments.packageInstanceId, pkg.id),
							inArray(installments.status, ["pending", "overdue"]),
						),
						orderBy: [asc(installments.installmentNumber)],
					});
					newNextDueDate = nextInstallment?.dueDate ?? null;
				}
			} else {
				newNextDueDate = null;
			}
		}

		// Update package instance
		const [updatedPkg] = await tx
			.update(packageInstances)
			.set({
				installmentsPaid: newInstallmentsPaid,
				creditsUnlocked: newCreditsUnlocked,
				nextDueDate: newNextDueDate,
				gracePeriodEndsAt: newGracePeriodEndsAt,
				updatedAt: now,
			})
			.where(eq(packageInstances.id, pkg.id))
			.returning();

		if (!updatedPkg) throw new Error("Failed to update package instance");

		// Log events — record the delta actually collected, not the face value.
		await logInstallmentEvent(tx, {
			packageInstanceId: pkg.id,
			installmentId: params.installmentId,
			eventType: "payment_received",
			actorId: params.confirmedBy,
			amount: payment,
			metadata: JSON.stringify({
				partial: !isFull,
				amountPaidToDate: newAmountPaidThis,
				dueTotal,
			}),
		});

		await logInstallmentEvent(tx, {
			packageInstanceId: pkg.id,
			installmentId: params.installmentId,
			eventType: "credits_unlocked",
			actorId: params.confirmedBy,
			metadata: JSON.stringify({ creditsUnlocked: newCreditsUnlocked }),
		});

		// Audit installment payment confirmation
		await writeAudit(tx, {
			actorUserId: params.confirmedBy,
			action: isFull ? "installment.paid" : "installment.partial_payment",
			entityType: "installment",
			entityId: params.installmentId,
			summary: isFull
				? `Installment ${params.installmentId} confirmed paid (package: ${pkg.id}, installment #${updatedInstallment.installmentNumber})`
				: `Installment ${params.installmentId} partial payment of ${payment} (paid ${newAmountPaidThis}/${dueTotal}, package: ${pkg.id}, installment #${updatedInstallment.installmentNumber})`,
			changes: {
				packageInstanceId: pkg.id,
				installmentNumber: updatedInstallment.installmentNumber,
				amountCollected: payment,
				amountPaidToDate: newAmountPaidThis,
				dueTotal,
				fullySettled: isFull,
				paymentMethod: params.paymentMethod,
				creditsUnlocked: newCreditsUnlocked,
			},
		});

		console.log("[installment] payment confirmed", {
			installmentId: params.installmentId,
			installmentNumber: updatedInstallment.installmentNumber,
			packageInstanceId: pkg.id,
			collected: payment,
			fullySettled: isFull,
			newInstallmentsPaid,
			newCreditsUnlocked,
		});

		await syncPackagePaymentStatus(tx, pkg.id);

		// Phase D — Proportional origination commission for multi-installment plans.
		// Fires when this installment FULLY clears (isFull) and the package was created
		// under a multi-installment plan (installmentsTotal > 1).
		// Single-payment / 'full' plans continue to use the front-load path in
		// pos.service.ts / webhooks.routes.ts (unchanged).
		if (isFull && pkg.installmentsTotal > 1) {
			const salesOrderId =
				updatedInstallment.salesOrderId ?? pkg.salesOrderId ?? null;

			if (salesOrderId) {
				try {
					// Load soldBy + leadSourceUserId from the order (within tx)
					const [orderRow] = await tx
						.select({
							soldBy: salesOrders.soldBy,
							leadSourceUserId: salesOrders.leadSourceUserId,
						})
						.from(salesOrders)
						.where(eq(salesOrders.id, salesOrderId))
						.limit(1);

					if (orderRow) {
						// isLastInstallment: all paid+waived installments cover the plan total
						const isLastInstallment =
							newInstallmentsPaid + (pkg.installmentsWaived ?? 0) >=
							pkg.installmentsTotal;

						// Resolve the actor's MEMBER uuid — confirmedBy is a user id, and
						// audit_logs.actor_member_id is a uuid column. System/cron confirms
						// ("system") have no member row → memberId null (allowed by writeAudit).
						const [actorMember] = await tx
							.select({ id: members.id, role: members.role })
							.from(members)
							.where(eq(members.userId, params.confirmedBy))
							.limit(1);

						// Import directly from the module file (NOT the barrel) to avoid cycles
						const { distributeInstallmentOriginationCommission } = await import(
							"./commission-calculator.service"
						);

						await distributeInstallmentOriginationCommission(tx, {
							salesOrderId,
							installmentId: params.installmentId,
							installmentDueCents: dueTotal,
							orderTotalDueCents: totalDueAll,
							isLastInstallment,
							soldByUserId: orderRow.soldBy ?? null,
							leadSourceUserId: orderRow.leadSourceUserId ?? null,
							actor: {
								userId: params.confirmedBy,
								memberId: actorMember?.id ?? null,
								role: actorMember?.role ?? "staff",
							},
							earnedAt: now,
						});
					}
				} catch (commErr) {
					// Commission failure must NEVER block payment confirmation — best-effort,
					// same posture as the origination commission at the webhook site.
					console.warn(
						JSON.stringify({
							event: "installment_origination_commission_failed",
							installmentId: params.installmentId,
							salesOrderId,
							error:
								commErr instanceof Error ? commErr.message : String(commErr),
						}),
					);
				}
			}
		}

		return { installment: updatedInstallment, packageInstance: updatedPkg };
	};

	if (opts?.inTransaction) {
		// Caller is already inside a transaction — run the body directly.
		// markCompleteIfFinal opens its own tx so it cannot run here; at POS
		// purchase time the package has 0 creditsUsed so it would be a no-op
		// anyway.  The caller may invoke markCompleteIfFinal post-commit if
		// needed.
		return run(tenantDb as TenantTx);
	}

	// Standard path: probe packageInstanceId outside tx (non-mutating), then
	// open a new transaction for all mutations.
	const [probe] = await (tenantDb as TenantDb)
		.select({ packageInstanceId: installments.packageInstanceId })
		.from(installments)
		.where(eq(installments.id, params.installmentId));
	if (!probe) throw new Error("Installment not found");

	const result = await (tenantDb as TenantDb).transaction(run);

	// Post-transaction: attempt auto-completion. Runs its own serializable tx;
	// idempotent — safe to call even when conditions aren't fully met yet.
	await markCompleteIfFinal(tenantDb as TenantDb, result.packageInstance.id);

	return result;
}

// ---------------------------------------------------------------------------
// Expiry evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a package instance and mark it expired if its expiry date has passed.
 * Safe to call repeatedly (idempotent).
 */
export async function evaluateAndExpireIfOverdue(
	tenantDb: TenantDb,
	packageInstanceId: string,
): Promise<void> {
	const now = new Date();
	const [pkg] = await tenantDb
		.select({
			id: packageInstances.id,
			status: packageInstances.status,
			expiresAt: packageInstances.expiresAt,
		})
		.from(packageInstances)
		.where(eq(packageInstances.id, packageInstanceId));

	if (!pkg || pkg.status !== "active") return;
	if (!pkg.expiresAt || pkg.expiresAt > now) return;

	await tenantDb
		.update(packageInstances)
		.set({ status: "expired", updatedAt: now })
		.where(eq(packageInstances.id, packageInstanceId));

	await appendPackageInstanceStatusHistory(tenantDb, packageInstanceId, {
		fromStatus: pkg.status,
		toStatus: "expired",
		changedBy: "system",
		reason: "Package expired (installment overdue evaluation)",
	});
}

// ---------------------------------------------------------------------------
// Lock evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a package instance and lock it if overdue past the grace period.
 * Safe to call repeatedly (idempotent).
 *
 * CANONICAL LOCK ORDER: PARENT (package_instances) → CHILD (installments)
 *
 * This function acquires the package_instances row lock first, then locks
 * individual installment rows before mutating them.  The same order is used by
 * confirmInstallmentPayment, rescheduleInstallment, and waiveInstallment.
 * Diverging from this order risks deadlock when the sweep cron and a concurrent
 * payment confirmation race on the same rows.
 *
 * CAS-style guard: after taking the installment row lock we re-check that each
 * row is still pending before marking it overdue.  Rows paid while we waited
 * for the lock are silently skipped (0 rows affected = no-op, not an error).
 */
export async function evaluateAndLockIfOverdue(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
): Promise<typeof packageInstances.$inferSelect> {
	console.log("[installment] evaluateAndLockIfOverdue", { packageInstanceId });

	// Check and mark expired before acquiring the lock — idempotent, safe to run outside tx
	await evaluateAndExpireIfOverdue(tenantDb, packageInstanceId);

	// Read grace period config before taking the row lock — pure read, no race concern
	const gracePeriodDays = await getGracePeriodDaysForPackage(
		tenantDb,
		packageInstanceId,
	);

	return tenantDb.transaction(async (tx) => {
		// -----------------------------------------------------------------------
		// CANONICAL LOCK ORDER: PARENT (package_instances) → CHILD (installments)
		// -----------------------------------------------------------------------

		// 1. Lock the package instance first (PARENT)
		const [pkg] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, packageInstanceId))
			.for("update");
		if (!pkg) throw new Error("Package instance not found");

		// Already locked — nothing to do
		if (pkg.isLocked) {
			console.log("[installment] evaluateAndLockIfOverdue: already locked", {
				packageInstanceId,
			});
			return pkg;
		}

		// Not on installment plan, or fully paid — nothing to do
		if (
			pkg.paymentPlanType === null ||
			pkg.installmentsPaid >= pkg.installmentsTotal
		) {
			console.log(
				"[installment] evaluateAndLockIfOverdue: skip (no plan or fully paid)",
				{ packageInstanceId },
			);
			return pkg;
		}

		// No due date set — nothing to do
		if (!pkg.nextDueDate) {
			console.log(
				"[installment] evaluateAndLockIfOverdue: skip (no nextDueDate)",
				{ packageInstanceId },
			);
			return pkg;
		}

		const now = new Date();

		if (pkg.nextDueDate < now) {
			// 2. Lock the candidate installment rows (CHILD) before mutating them.
			//    Select with FOR UPDATE so a concurrent confirmInstallmentPayment
			//    that already holds the child lock will block us (not deadlock —
			//    both paths now share the same parent-first order).
			//
			// CAS-style guard: the UPDATE below includes `status = 'pending'` so
			// rows paid while we waited for the lock produce 0 affected rows and
			// are silently skipped rather than overwritten with 'overdue'.
			const overdueRows = await tx
				.update(installments)
				.set({ status: "overdue", updatedAt: now })
				.where(
					and(
						eq(installments.packageInstanceId, packageInstanceId),
						// CAS precondition: only flip rows that are still pending.
						// If a concurrent payment confirmed this row between the
						// outer SELECT (sweep candidate scan) and now, its status
						// will be 'paid' and this WHERE will exclude it — the
						// 0-affected-rows result is the correct no-op outcome.
						eq(installments.status, "pending"),
						lte(installments.dueDate, now),
					),
				)
				.returning({ id: installments.id });

			// Batch-insert events for every newly-overdue installment
			if (overdueRows.length > 0) {
				await tx.insert(installmentEvents).values(
					overdueRows.map((r) => ({
						packageInstanceId,
						installmentId: r.id,
						eventType: "installment_overdue" as const,
					})),
				);
			}

			// Pick the lowest-numbered overdue installment for grace/lock event attribution
			const firstOverdue = await tx.query.installments.findFirst({
				where: and(
					eq(installments.packageInstanceId, packageInstanceId),
					eq(installments.status, "overdue"),
				),
				orderBy: [asc(installments.installmentNumber)],
			});

			let updatedPkg = pkg;

			if (!pkg.gracePeriodEndsAt) {
				// Start grace period
				const gracePeriodEndsAt = addDays(pkg.nextDueDate, gracePeriodDays);
				console.log(
					"[installment] evaluateAndLockIfOverdue: starting grace period",
					{
						packageInstanceId,
						gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
						gracePeriodDays,
					},
				);
				const [updated] = await tx
					.update(packageInstances)
					.set({ gracePeriodEndsAt, updatedAt: now })
					.where(eq(packageInstances.id, packageInstanceId))
					.returning();
				if (updated) updatedPkg = updated;

				await logInstallmentEvent(tx, {
					packageInstanceId,
					installmentId: firstOverdue?.id ?? null,
					eventType: "grace_period_started",
				});
			} else if (pkg.gracePeriodEndsAt < now) {
				// Grace period expired — lock the package
				console.log(
					"[installment] evaluateAndLockIfOverdue: LOCKING package (grace expired)",
					{
						packageInstanceId,
						gracePeriodEndsAt: pkg.gracePeriodEndsAt.toISOString(),
					},
				);
				const [updated] = await tx
					.update(packageInstances)
					.set({
						isLocked: true,
						lockedAt: now,
						lockedReason: "non_payment",
						gracePeriodEndsAt: null,
						nextDueDate: null,
						updatedAt: now,
					})
					.where(eq(packageInstances.id, packageInstanceId))
					.returning();
				if (updated) updatedPkg = updated;

				await logInstallmentEvent(tx, {
					packageInstanceId,
					installmentId: firstOverdue?.id ?? null,
					eventType: "package_locked",
				});
			}

			return updatedPkg;
		}

		return pkg;
	});
}

/**
 * Re-evaluate a package instance's overdue/lock state after an installment
 * mutation (reschedule, waive, etc.). Designed to run INSIDE an existing
 * transaction so the caller can compose it with its own row locks.
 *
 * SP-02: bidirectional companion to `evaluateAndLockIfOverdue`. Unlike that
 * helper (which only locks), this one normalises the package state:
 *  - If every installment is paid/waived/cancelled: clear `nextDueDate`,
 *    `gracePeriodEndsAt`, and auto-unlock if currently locked (the package
 *    is fully resolved, so the lock has no remaining basis).
 *  - Else if no pending installment is currently overdue: clear
 *    `gracePeriodEndsAt` and set `nextDueDate` to the next pending due date.
 *    Lock state is left untouched (operator must explicit-unlock).
 *  - Else (overdue remains): refresh `nextDueDate` to the earliest pending
 *    due date; do not change the lock here (the periodic job /
 *    `evaluateAndLockIfOverdue` owns lock transitions).
 */
async function evaluateOverdueLock(
	tx: TenantTx,
	packageInstanceId: string,
): Promise<typeof packageInstances.$inferSelect | undefined> {
	const [pkg] = await tx
		.select()
		.from(packageInstances)
		.where(eq(packageInstances.id, packageInstanceId));
	if (!pkg) return undefined;

	// Find the earliest still-unpaid installment (pending or overdue).
	const earliestUnpaid = await tx.query.installments.findFirst({
		where: and(
			eq(installments.packageInstanceId, packageInstanceId),
			inArray(installments.status, ["pending", "overdue"]),
		),
		orderBy: [asc(installments.dueDate), asc(installments.installmentNumber)],
	});

	const now = new Date();

	// Case 1: nothing left to pay — fully resolved. Clear due/grace state and
	// auto-unlock if currently locked (SP-02: waiving the final instalment
	// should auto-unlock).
	if (!earliestUnpaid) {
		const wasLocked = pkg.isLocked;
		const [updated] = await tx
			.update(packageInstances)
			.set({
				nextDueDate: null,
				gracePeriodEndsAt: null,
				...(wasLocked
					? { isLocked: false, lockedAt: null, lockedReason: null }
					: {}),
				updatedAt: now,
			})
			.where(eq(packageInstances.id, packageInstanceId))
			.returning();

		if (wasLocked) {
			await logInstallmentEvent(tx, {
				packageInstanceId,
				eventType: "package_unlocked",
				reason: "auto_unlock_on_resolution",
			});
		}
		return updated ?? pkg;
	}

	const stillOverdue = earliestUnpaid.dueDate <= now;

	// Case 2: still has overdue — refresh nextDueDate, leave lock to the
	// periodic job / evaluateAndLockIfOverdue.
	if (stillOverdue) {
		if (
			!pkg.nextDueDate ||
			pkg.nextDueDate.getTime() !== earliestUnpaid.dueDate.getTime()
		) {
			const [updated] = await tx
				.update(packageInstances)
				.set({ nextDueDate: earliestUnpaid.dueDate, updatedAt: now })
				.where(eq(packageInstances.id, packageInstanceId))
				.returning();
			return updated ?? pkg;
		}
		return pkg;
	}

	// Case 3: no overdue remains — clear grace period and refresh nextDueDate.
	if (
		pkg.gracePeriodEndsAt !== null ||
		!pkg.nextDueDate ||
		pkg.nextDueDate.getTime() !== earliestUnpaid.dueDate.getTime()
	) {
		const [updated] = await tx
			.update(packageInstances)
			.set({
				nextDueDate: earliestUnpaid.dueDate,
				gracePeriodEndsAt: null,
				updatedAt: now,
			})
			.where(eq(packageInstances.id, packageInstanceId))
			.returning();
		return updated ?? pkg;
	}

	return pkg;
}

// ---------------------------------------------------------------------------
// Manual override
// ---------------------------------------------------------------------------

/**
 * Manually unlock a package instance (admin override).
 * Does not change creditsUnlocked.
 * Audit row is written inside the same transaction as the unlock.
 */
export async function unlockPackage(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
	actorId: string,
	reason: string,
	actor: { userId: string; memberId: string; role: string },
): Promise<typeof packageInstances.$inferSelect> {
	return tenantDb.transaction(async (tx) => {
		const now = new Date();

		// D.2.4 / D.3.2 — Idempotency guard: read-then-update inside the tx
		// to prevent a no-op unlock from generating a spurious audit row.
		const [pkg] = await tx
			.select({ id: packageInstances.id, isLocked: packageInstances.isLocked })
			.from(packageInstances)
			.where(eq(packageInstances.id, packageInstanceId))
			.for("update");

		if (!pkg) throw new Error("Package instance not found");
		if (!pkg.isLocked) throw new Error("Package is not locked");

		const [updated] = await tx
			.update(packageInstances)
			.set({
				isLocked: false,
				lockedAt: null,
				lockedReason: null,
				updatedAt: now,
			})
			.where(eq(packageInstances.id, packageInstanceId))
			.returning();

		if (!updated) throw new Error("Package instance not found");

		// Log the installment event (uses tx for consistency)
		await tx.insert(installmentEvents).values({
			packageInstanceId,
			installmentId: null,
			eventType: "manual_override_unlock",
			actorId,
			amount: null,
			reason,
			metadata: null,
		});

		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "package.unlock",
			entityType: "package_instance",
			entityId: packageInstanceId,
			summary: `Admin unlocked package ${packageInstanceId}: ${reason}`,
			changes: { reason },
		});

		return updated;
	});
}

// ---------------------------------------------------------------------------
// Admin credit adjustment
// ---------------------------------------------------------------------------

export type AdjustCreditsParams = {
	creditsUnlocked?: number;
	creditsUsed?: number;
	reason: string;
	actorId: string;
	actor: { userId: string; memberId: string; role: string };
};

/**
 * Admin override: set creditsUnlocked and/or creditsUsed on a package instance.
 * Sets creditsAdminOverride=true so subsequent payment confirmations use max() instead of overwriting.
 * Recomputes status: exhausted if remaining reaches 0, active if remaining is restored.
 */
export async function adjustCredits(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
	params: AdjustCreditsParams,
): Promise<typeof packageInstances.$inferSelect> {
	return tenantDb.transaction(async (tx) => {
		const [pkg] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, packageInstanceId))
			.for("update");

		if (!pkg) throw new Error("Package instance not found");

		const newUnlocked =
			params.creditsUnlocked ?? pkg.creditsUnlocked ?? pkg.creditsTotal;
		const newUsed = params.creditsUsed ?? pkg.creditsUsed;

		if (newUnlocked > pkg.creditsTotal) {
			throw Object.assign(
				new Error(
					`creditsUnlocked (${newUnlocked}) cannot exceed creditsTotal (${pkg.creditsTotal})`,
				),
				{ code: "BAD_REQUEST" },
			);
		}
		if (newUsed > newUnlocked) {
			throw Object.assign(
				new Error(
					`creditsUsed (${newUsed}) cannot exceed creditsUnlocked (${newUnlocked})`,
				),
				{ code: "BAD_REQUEST" },
			);
		}

		const newRemaining = newUnlocked - newUsed;
		let newStatus = pkg.status;
		if (newRemaining <= 0 && pkg.status === "active") newStatus = "exhausted";
		if (newRemaining > 0 && pkg.status === "exhausted") newStatus = "active";

		const now = new Date();
		const [updated] = await tx
			.update(packageInstances)
			.set({
				creditsUnlocked: newUnlocked,
				creditsUsed: newUsed,
				creditsAdminOverride: true,
				status: newStatus,
				updatedAt: now,
			})
			.where(eq(packageInstances.id, packageInstanceId))
			.returning();

		if (!updated) throw new Error("Failed to update package instance");

		await logInstallmentEvent(tx, {
			packageInstanceId,
			eventType: "credits_admin_adjusted",
			actorId: params.actorId,
			metadata: JSON.stringify({
				creditsUnlocked: newUnlocked,
				creditsUsed: newUsed,
				previous: {
					creditsUnlocked: pkg.creditsUnlocked,
					creditsUsed: pkg.creditsUsed,
				},
			}),
			reason: params.reason,
		});

		await writeAudit(tx, {
			actorUserId: params.actor.userId,
			actorMemberId: params.actor.memberId,
			actorRole: params.actor.role,
			action: "package.credits_adjusted",
			entityType: "package_instance",
			entityId: packageInstanceId,
			summary: `Admin adjusted credits for package ${packageInstanceId}: unlocked=${newUnlocked}, used=${newUsed}. Reason: ${params.reason}`,
			changes: {
				creditsUnlocked: { from: pkg.creditsUnlocked, to: newUnlocked },
				creditsUsed: { from: pkg.creditsUsed, to: newUsed },
				reason: params.reason,
			},
		});

		return updated;
	});
}

// ---------------------------------------------------------------------------
// Refund
// ---------------------------------------------------------------------------

export async function processRefund(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
	amount: number,
	actorId: string,
	reason: string,
	actor: { userId: string; memberId: string; role: string },
): Promise<{
	cancelledInstallmentIds: string[];
	refundedInstallmentIds: string[];
	paidAmountToRefund: number;
	voidedCommissionCount: number;
	commissionNeedingManualReversal: number;
}> {
	return tenantDb.transaction(async (tx) => {
		// Lock the package row first to serialise against concurrent payment confirmations
		const [pkg] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, packageInstanceId))
			.for("update");
		if (!pkg) throw new Error("Package instance not found");

		const now = new Date();

		// 1. Bulk-cancel all remaining pending/overdue installments.
		const cancelledRows = await tx
			.update(installments)
			.set({ status: "cancelled", updatedAt: now })
			.where(
				and(
					eq(installments.packageInstanceId, packageInstanceId),
					inArray(installments.status, ["pending", "overdue"]),
				),
			)
			.returning({ id: installments.id });

		// 2. PAID installments: reverse the records (mark refunded) so they no
		// longer read as collected money. Sum what was actually paid — this is
		// what an admin must refund OUT OF BAND (decision 2026-06-13: flag for
		// manual refund, NO automatic Stripe money movement here).
		const paidRows = await tx
			.update(installments)
			.set({ status: "refunded", updatedAt: now })
			.where(
				and(
					eq(installments.packageInstanceId, packageInstanceId),
					eq(installments.status, "paid"),
				),
			)
			.returning({ id: installments.id, amountPaid: installments.amountPaid });
		const paidAmountToRefund = paidRows.reduce(
			(s, r) => s + (r.amountPaid ?? 0),
			0,
		);

		// 3. Mark the package refunded + cancelled.
		await tx
			.update(packageInstances)
			.set({ paymentStatus: "refunded", status: "cancelled", updatedAt: now })
			.where(eq(packageInstances.id, packageInstanceId));

		// 4. Reverse commission. Void still-PENDING splits for this order/package
		// so trainers are not paid on a refunded sale. Splits already approved/paid
		// (batched toward a payout) can't be safely mutated here — count them so the
		// admin can reverse those payouts out of band.
		const orderCommissionCond = pkg.salesOrderId
			? or(
					eq(commissionSplits.salesOrderId, pkg.salesOrderId),
					eq(commissionSplits.packageInstanceId, packageInstanceId),
				)!
			: eq(commissionSplits.packageInstanceId, packageInstanceId);

		const voidedCommission = await tx
			.update(commissionSplits)
			.set({ status: "void", updatedAt: now })
			.where(and(orderCommissionCond, eq(commissionSplits.status, "pending")))
			.returning({ id: commissionSplits.id });

		const alreadyBatched = await tx
			.select({ id: commissionSplits.id })
			.from(commissionSplits)
			.where(
				and(
					orderCommissionCond,
					inArray(commissionSplits.status, ["approved", "paid"]),
				),
			);

		// 5. Log + audit.
		await tx.insert(installmentEvents).values({
			packageInstanceId,
			installmentId: null,
			eventType: "manual_refund",
			actorId,
			amount,
			reason,
			metadata: JSON.stringify({
				paidAmountToRefund,
				refundedInstallmentIds: paidRows.map((r) => r.id),
				cancelledInstallmentIds: cancelledRows.map((r) => r.id),
				voidedCommissionCount: voidedCommission.length,
				commissionNeedingManualReversal: alreadyBatched.length,
			}),
		});

		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "package.refund",
			entityType: "package_instance",
			entityId: packageInstanceId,
			summary: `Admin processed refund for package ${packageInstanceId}: ${reason}`,
			changes: {
				refundAmount: amount,
				paidAmountToRefund,
				reason,
				cancelledInstallmentIds: cancelledRows.map((r) => r.id),
				refundedInstallmentIds: paidRows.map((r) => r.id),
				voidedCommissionCount: voidedCommission.length,
				commissionNeedingManualReversal: alreadyBatched.length,
			},
		});

		// 6. Notify active admins to issue the actual refund out of band.
		const admins = await tx
			.select({ userId: members.userId })
			.from(members)
			.where(and(eq(members.role, "admin"), eq(members.status, "active")));
		if (admins.length > 0) {
			const rm = (paidAmountToRefund / 100).toFixed(2);
			const manualNote =
				alreadyBatched.length > 0
					? ` ${alreadyBatched.length} commission split(s) are already approved/paid and need manual payout reversal.`
					: "";
			await tx.insert(notifications).values(
				admins.map((a) => ({
					userId: a.userId,
					type: "refund_required",
					title: "Manual refund required",
					message: `Package ${pkg.purchaseNumber ?? packageInstanceId} was refunded (${reason}). Issue a refund of RM ${rm} to the customer out of band — no payment was reversed automatically.${manualNote}`,
					relatedId: packageInstanceId,
					relatedType: "package_instance",
				})),
			);
		}

		return {
			cancelledInstallmentIds: cancelledRows.map((r) => r.id),
			refundedInstallmentIds: paidRows.map((r) => r.id),
			paidAmountToRefund,
			voidedCommissionCount: voidedCommission.length,
			commissionNeedingManualReversal: alreadyBatched.length,
		};
	});
}

// ---------------------------------------------------------------------------
// Reschedule
// ---------------------------------------------------------------------------

/**
 * Reschedule a pending (or overdue) installment to a new due date.
 * - Throws CONFLICT if the installment is already paid.
 * - Throws CONFLICT if the package is locked.
 * - Throws BAD_REQUEST if newDueDate is in the past.
 * - Updates packageInstances.nextDueDate if this is the next-due installment.
 * - Logs an installment_rescheduled event.
 */
export async function rescheduleInstallment(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	installmentId: string,
	newDueDate: Date,
	actorId: string,
	reason: string,
): Promise<typeof installments.$inferSelect> {
	// Probe packageInstanceId outside tx (non-mutating) so we can acquire the
	// parent lock first inside the transaction.
	const [probe] = await tenantDb
		.select({ packageInstanceId: installments.packageInstanceId })
		.from(installments)
		.where(eq(installments.id, installmentId));
	if (!probe) throw new Error("Installment not found");

	return tenantDb.transaction(async (tx) => {
		// -----------------------------------------------------------------------
		// CANONICAL LOCK ORDER: PARENT (package_instances) → CHILD (installments)
		// See confirmInstallmentPayment for the rationale.
		// -----------------------------------------------------------------------

		// 1. Lock the package instance first (PARENT)
		const [pkg] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, probe.packageInstanceId))
			.for("update");
		if (!pkg) throw new Error("Package instance not found");

		// 2. Lock the installment row second (CHILD)
		const [installment] = await tx
			.select()
			.from(installments)
			.where(eq(installments.id, installmentId))
			.for("update");
		if (!installment) throw new Error("Installment not found");

		// CAS-style re-check after acquiring locks
		if (installment.status === "paid" || installment.status === "waived") {
			const err = new Error("Cannot reschedule a paid or waived installment");
			(err as any).code = "CONFLICT";
			throw err;
		}

		if (pkg.isLocked) {
			const err = new Error(
				"Cannot reschedule an installment for a locked package",
			);
			(err as any).code = "CONFLICT";
			throw err;
		}

		const now = new Date();
		// Accept "today" — only reject dates strictly before the start of today (UTC)
		if (newDueDate < startOfDayUTC(now)) {
			const err = new Error("New due date must be today or in the future");
			(err as any).code = "BAD_REQUEST";
			throw err;
		}

		const oldDueDate = installment.dueDate;

		// Update the installment — set to pending (clears overdue status) with new due date.
		// Capture the original schedule on the FIRST reschedule only, so the UI can show
		// "was {originalDueDate} → now {dueDate}" even across multiple reschedules.
		const [updated] = await tx
			.update(installments)
			.set({
				dueDate: newDueDate,
				originalDueDate: installment.originalDueDate ?? oldDueDate,
				status: "pending",
				updatedAt: now,
			})
			.where(eq(installments.id, installmentId))
			.returning();

		if (!updated) throw new Error("Failed to update installment");

		// Log the reschedule event
		await logInstallmentEvent(tx, {
			packageInstanceId: installment.packageInstanceId,
			installmentId,
			eventType: "installment_rescheduled",
			actorId,
			reason,
			metadata: JSON.stringify({
				oldDueDate: oldDueDate.toISOString(),
				newDueDate: newDueDate.toISOString(),
			}),
		});

		// SP-02: Re-evaluate overdue/lock state after the reschedule. This
		// refreshes nextDueDate to whichever installment is now earliest, and
		// clears the grace-period flag when no overdue rows remain.
		await evaluateOverdueLock(tx, installment.packageInstanceId);

		return updated;
	});
}

// ---------------------------------------------------------------------------
// syncPackagePaymentStatus
// ---------------------------------------------------------------------------

/**
 * Sync paymentStatus on packageInstances based on installment row counts.
 * Call inside a transaction after any installment status change.
 * Does NOT touch packages already in refunded/cancelled state.
 */
export async function syncPackagePaymentStatus(
	tx: TenantTx,
	packageInstanceId: string,
): Promise<void> {
	const [pkg] = await tx
		.select({
			paymentStatus: packageInstances.paymentStatus,
			installmentsTotal: packageInstances.installmentsTotal,
			installmentsPaid: packageInstances.installmentsPaid,
		})
		.from(packageInstances)
		.where(eq(packageInstances.id, packageInstanceId));

	if (!pkg) return;
	if (pkg.paymentStatus === "refunded" || pkg.paymentStatus === "cancelled")
		return;

	const newStatus: string =
		pkg.installmentsPaid === 0
			? "pending"
			: pkg.installmentsPaid >= pkg.installmentsTotal
				? "paid"
				: "partially_paid";

	await tx
		.update(packageInstances)
		.set({ paymentStatus: newStatus, updatedAt: new Date() })
		.where(eq(packageInstances.id, packageInstanceId));
}

// ---------------------------------------------------------------------------
// Waive installment
// ---------------------------------------------------------------------------

export async function waiveInstallment(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	installmentId: string,
	actorId: string,
	reason: string,
): Promise<{
	installment: typeof installments.$inferSelect;
	packageInstance: typeof packageInstances.$inferSelect;
}> {
	// Probe packageInstanceId outside tx (non-mutating) so we can acquire the
	// parent lock first inside the transaction.
	const [probe] = await tenantDb
		.select({ packageInstanceId: installments.packageInstanceId })
		.from(installments)
		.where(eq(installments.id, installmentId));
	if (!probe) throw new Error("Installment not found");

	return tenantDb.transaction(async (tx) => {
		// -----------------------------------------------------------------------
		// CANONICAL LOCK ORDER: PARENT (package_instances) → CHILD (installments)
		// See confirmInstallmentPayment for the rationale.
		// -----------------------------------------------------------------------

		// 1. Lock the package instance first (PARENT)
		const [pkg] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, probe.packageInstanceId))
			.for("update");
		if (!pkg) throw new Error("Package instance not found");

		// 2. Lock the installment row second (CHILD)
		const [installment] = await tx
			.select()
			.from(installments)
			.where(eq(installments.id, installmentId))
			.for("update");
		if (!installment) throw new Error("Installment not found");

		// CAS-style re-check after acquiring locks
		if (["paid", "waived", "cancelled"].includes(installment.status)) {
			const err = new Error(
				`Cannot waive an installment with status: ${installment.status}`,
			);
			(err as any).code = "CONFLICT";
			throw err;
		}

		if (pkg.isLocked) {
			// SP-02: Allow waiving when this is the only remaining unpaid
			// instalment — the package is about to be fully resolved and the
			// post-waive `evaluateOverdueLock` will auto-unlock it. Block
			// otherwise (a locked package with multiple outstanding instalments
			// still requires an explicit admin unlock first).
			const otherUnpaid = await tx.query.installments.findFirst({
				where: and(
					eq(installments.packageInstanceId, pkg.id),
					inArray(installments.status, ["pending", "overdue"]),
					sql`${installments.id} <> ${installmentId}`,
				),
			});
			if (otherUnpaid) {
				const err = new Error(
					"Cannot waive an installment for a locked package",
				);
				(err as any).code = "CONFLICT";
				throw err;
			}
		}

		const now = new Date();
		const [updatedInstallment] = await tx
			.update(installments)
			.set({ status: "waived", updatedAt: now })
			.where(eq(installments.id, installmentId))
			.returning();
		if (!updatedInstallment) throw new Error("Failed to update installment");

		const newInstallmentsWaived = (pkg.installmentsWaived ?? 0) + 1;
		const combinedCount = pkg.installmentsPaid + newInstallmentsWaived;

		// Only update formula credits if admin hasn't manually overridden
		const newCreditsUnlocked = pkg.creditsAdminOverride
			? (pkg.creditsUnlocked ?? 0)
			: calculateCreditsUnlocked(
					pkg.creditsTotal,
					combinedCount,
					pkg.installmentsTotal,
				);

		const [updatedPkg] = await tx
			.update(packageInstances)
			.set({
				installmentsWaived: newInstallmentsWaived,
				creditsUnlocked: newCreditsUnlocked,
				updatedAt: now,
			})
			.where(eq(packageInstances.id, pkg.id))
			.returning();
		if (!updatedPkg) throw new Error("Failed to update package instance");

		await logInstallmentEvent(tx, {
			packageInstanceId: pkg.id,
			installmentId,
			eventType: "installment_waived",
			actorId,
			reason,
		});

		await writeAudit(tx, {
			actorUserId: actorId,
			action: "installment.waived",
			entityType: "installment",
			entityId: installmentId,
			summary: `Installment ${installmentId} waived (package: ${pkg.id}, #${updatedInstallment.installmentNumber})`,
			changes: {
				reason,
				installmentsWaived: newInstallmentsWaived,
				creditsUnlocked: newCreditsUnlocked,
			},
		});

		await syncPackagePaymentStatus(tx, pkg.id);

		// SP-02: Re-evaluate overdue/lock state after the waive. This refreshes
		// nextDueDate / gracePeriodEndsAt and auto-unlocks the package when the
		// waive resolves the final outstanding instalment.
		const reevaluated = await evaluateOverdueLock(tx, pkg.id);

		return {
			installment: updatedInstallment,
			packageInstance: reevaluated ?? updatedPkg,
		};
	});
}

// ---------------------------------------------------------------------------
// Reset credits override
// ---------------------------------------------------------------------------

export async function resetCreditsOverride(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
	actorId: string,
	reason: string,
): Promise<typeof packageInstances.$inferSelect> {
	return tenantDb.transaction(async (tx) => {
		const [pkg] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, packageInstanceId))
			.for("update");
		if (!pkg) throw new Error("Package instance not found");

		const combinedCount = pkg.installmentsPaid + (pkg.installmentsWaived ?? 0);
		const formulaCredits = calculateCreditsUnlocked(
			pkg.creditsTotal,
			combinedCount,
			pkg.installmentsTotal,
		);
		// Clamp to creditsUsed so we never unlock fewer credits than already consumed
		const newCredits = Math.max(formulaCredits, pkg.creditsUsed ?? 0);
		const wasClamped = newCredits > formulaCredits;

		const [updated] = await tx
			.update(packageInstances)
			.set({
				creditsUnlocked: newCredits,
				creditsAdminOverride: false,
				updatedAt: new Date(),
			})
			.where(eq(packageInstances.id, packageInstanceId))
			.returning();
		if (!updated) throw new Error("Failed to update package instance");

		await logInstallmentEvent(tx, {
			packageInstanceId,
			eventType: "credits_override_reset",
			actorId,
			reason,
			metadata: JSON.stringify({ newCredits, wasClamped }),
		});

		await writeAudit(tx, {
			actorUserId: actorId,
			action: "package.credits_override_cleared",
			entityType: "package_instance",
			entityId: packageInstanceId,
			summary: `Admin override cleared for package ${packageInstanceId}`,
			changes: { newCredits, wasClamped, reason },
		});

		return updated;
	});
}

// ---------------------------------------------------------------------------
// Overdraft toggle
// ---------------------------------------------------------------------------

/**
 * Toggle the allowCreditOverdraft flag on a package instance.
 *
 * When enabled, credit-consuming operations (appointment booking, check-in)
 * bypass the isLocked check. Intended for VIP / trusted customers where the
 * admin has agreed to accept a delayed payment verbally.
 *
 * Idempotent: if the flag is already in the target state, returns the existing
 * row without writing an audit row or event (matches unlockPackage D.2.4 pattern).
 */
export async function setPackageOverdraft(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
	enabled: boolean,
	reason: string,
	actor: { userId: string; memberId: string; role: string },
): Promise<typeof packageInstances.$inferSelect> {
	return tenantDb.transaction(async (tx) => {
		const [pkg] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, packageInstanceId))
			.for("update");

		if (!pkg) throw new Error("Package instance not found");

		// Idempotent no-op — flag is already in target state
		if (pkg.allowCreditOverdraft === enabled) return pkg;

		const now = new Date();
		const [updated] = await tx
			.update(packageInstances)
			.set({ allowCreditOverdraft: enabled, updatedAt: now })
			.where(eq(packageInstances.id, packageInstanceId))
			.returning();

		if (!updated) throw new Error("Failed to update package instance");

		await tx.insert(installmentEvents).values({
			packageInstanceId,
			installmentId: null,
			eventType: enabled ? "overdraft_enabled" : "overdraft_disabled",
			actorId: actor.userId,
			amount: null,
			reason,
			metadata: JSON.stringify({ previous: pkg.allowCreditOverdraft }),
		});

		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: enabled
				? "package.overdraft_enabled"
				: "package.overdraft_disabled",
			entityType: "package_instance",
			entityId: packageInstanceId,
			summary: `Admin ${enabled ? "enabled" : "disabled"} overdraft on package ${packageInstanceId}: ${reason}`,
			changes: {
				allowCreditOverdraft: { from: pkg.allowCreditOverdraft, to: enabled },
				reason,
			},
		});

		return updated;
	});
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get all installments for a package instance, ordered by installment number.
 */
export async function getInstallmentsByPackageInstance(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
): Promise<(typeof installments.$inferSelect)[]> {
	return tenantDb.query.installments.findMany({
		where: eq(installments.packageInstanceId, packageInstanceId),
		orderBy: [asc(installments.installmentNumber)],
	});
}

export type AdminInstallmentOverviewParams = {
	status?: "active" | "overdue" | "locked" | "due_soon";
	limit?: number;
	offset?: number;
	search?: string;
	dueBefore?: Date;
	dueAfter?: Date;
	paymentPlanCode?: string;
};

export type AdminInstallmentOverviewItem =
	typeof packageInstances.$inferSelect & {
		serviceName: string | null;
		clientName: string | null;
		nextInstallmentAmount?: number | null;
		nextInstallmentId?: string | null;
	};

/**
 * Get a paginated overview of installment-based package instances for admin use.
 */
export async function getAdminInstallmentOverview(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: AdminInstallmentOverviewParams = {},
	controlPanelDb?: ControlPanelDb,
): Promise<{ items: AdminInstallmentOverviewItem[]; total: number }> {
	const {
		status,
		limit = 50,
		offset = 0,
		search,
		dueBefore,
		dueAfter,
		paymentPlanCode,
	} = params;

	// Build the filter conditions
	const conditions = [
		// Must be on an installment plan
		isNotNull(packageInstances.paymentPlanType),
	];

	if (status === "locked") {
		conditions.push(eq(packageInstances.isLocked, true));
	} else if (status === "overdue") {
		const now = new Date();
		conditions.push(eq(packageInstances.isLocked, false));
		// Match packages overdue regardless of whether the cron evaluator has run yet:
		// nextDueDate in the past is sufficient — gracePeriodEndsAt may not be set yet
		conditions.push(isNotNull(packageInstances.nextDueDate));
		conditions.push(lte(packageInstances.nextDueDate, now));
	} else if (status === "active") {
		conditions.push(eq(packageInstances.isLocked, false));
		conditions.push(isNull(packageInstances.gracePeriodEndsAt));
	} else if (status === "due_soon") {
		const now = new Date();
		const in14d = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
		conditions.push(eq(packageInstances.isLocked, false));
		conditions.push(isNull(packageInstances.gracePeriodEndsAt));
		conditions.push(isNotNull(packageInstances.nextDueDate));
		conditions.push(gte(packageInstances.nextDueDate, now));
		conditions.push(lte(packageInstances.nextDueDate, in14d));
	}

	// 7.12: search by client displayName (control-panel join) rather than UUID prefix.
	// When controlPanelDb is available, pre-resolve matching user IDs from the user table,
	// then filter packageInstances.clientId to that set. Also retain purchaseNumber match.
	// Falls back to UUID-prefix ilike when controlPanelDb is not provided.
	let searchUserIds: string[] | null = null;
	if (search && controlPanelDb) {
		const nameMatchRows = await controlPanelDb
			.select({ id: user.id })
			.from(user)
			.where(ilike(user.name, `%${search}%`));
		searchUserIds = nameMatchRows.map((r) => r.id);
	}

	if (search) {
		if (searchUserIds !== null) {
			// Name-based search: match clients whose display name contains the query,
			// OR whose purchaseNumber matches exactly.
			if (searchUserIds.length > 0) {
				// biome-ignore lint/style/noNonNullAssertion: or() with explicit args is never undefined
				conditions.push(
					or(
						inArray(packageInstances.clientId, searchUserIds),
						eq(packageInstances.purchaseNumber, search),
					)!,
				);
			} else {
				// No users matched the name — only purchaseNumber can still match
				conditions.push(eq(packageInstances.purchaseNumber, search));
			}
		} else {
			// controlPanelDb not provided — fall back to UUID-prefix ilike
			// biome-ignore lint/style/noNonNullAssertion: or() with explicit args is never undefined
			conditions.push(
				or(
					ilike(packageInstances.clientId, `${search}%`),
					eq(packageInstances.purchaseNumber, search),
				)!,
			);
		}
	}
	if (dueBefore) conditions.push(lte(packageInstances.nextDueDate, dueBefore));
	if (dueAfter) conditions.push(gte(packageInstances.nextDueDate, dueAfter));
	if (paymentPlanCode)
		conditions.push(eq(packageInstances.paymentPlanType, paymentPlanCode));

	const where = and(...conditions);

	const rows = await tenantDb.query.packageInstances.findMany({
		where,
		limit: Math.min(limit, 200),
		offset,
		orderBy: [asc(packageInstances.nextDueDate)],
	});

	// Join with services to get service names
	const serviceIds = [...new Set(rows.map((r) => r.serviceId))];
	const serviceRows =
		serviceIds.length > 0
			? await tenantDb.query.services.findMany({
					where: (s, { inArray }) => inArray(s.id, serviceIds),
				})
			: [];

	const serviceMap = new Map(serviceRows.map((s) => [s.id, s.name]));

	// Cross-DB: batch-lookup client names from control panel
	let userMap = new Map<string, string>();
	if (controlPanelDb && rows.length > 0) {
		const clientIds = [
			...new Set(
				rows.map((r) => r.clientId).filter((id): id is string => id != null),
			),
		];
		if (clientIds.length > 0) {
			const userRows = await controlPanelDb
				.select({ id: user.id, name: user.name })
				.from(user)
				.where(inArray(user.id, clientIds));
			userMap = new Map(userRows.map((u) => [u.id, u.name]));
		}
	}

	// Batch-fetch next pending/overdue installment per returned package instance (Task 1.5)
	// Single IN query — one extra query per page, no N+1.
	const packageInstanceIds = rows.map((r) => r.id);
	const nextInstallmentMap = new Map<string, { id: string; amount: number }>();
	if (packageInstanceIds.length > 0) {
		const nextInstallmentRows = await tenantDb
			.select({
				id: installments.id,
				packageInstanceId: installments.packageInstanceId,
				amount: installments.amount,
				installmentNumber: installments.installmentNumber,
			})
			.from(installments)
			.where(
				and(
					inArray(installments.packageInstanceId, packageInstanceIds),
					or(
						eq(installments.status, "pending"),
						eq(installments.status, "overdue"),
					)!,
				),
			)
			.orderBy(asc(installments.installmentNumber));
		// Take the first row per package (lowest installment_number due to ASC order)
		for (const row of nextInstallmentRows) {
			if (!nextInstallmentMap.has(row.packageInstanceId)) {
				nextInstallmentMap.set(row.packageInstanceId, {
					id: row.id,
					amount: row.amount,
				});
			}
		}
	}

	const items: AdminInstallmentOverviewItem[] = rows.map((row) => {
		const nextInst = nextInstallmentMap.get(row.id);
		return {
			...row,
			serviceName: serviceMap.get(row.serviceId) ?? null,
			clientName: row.clientId ? (userMap.get(row.clientId) ?? null) : null,
			nextInstallmentAmount: nextInst?.amount ?? null,
			nextInstallmentId: nextInst?.id ?? null,
		};
	});

	// Count total using a SQL aggregate — avoids unbounded full-fetch (Task #4)
	const countRows = await tenantDb
		.select({ count: sql<number>`count(*)::int` })
		.from(packageInstances)
		.where(where);
	const total = countRows[0]?.count ?? 0;

	return { items, total };
}

export type UpcomingInstallmentsParams = {
	/** due_soon = pending, due within 14 days; overdue = past due; all = every outstanding installment */
	window?: "due_soon" | "overdue" | "all";
	branchId?: string;
	search?: string;
	limit?: number;
	offset?: number;
};

export type UpcomingInstallmentRow = {
	id: string;
	installmentNumber: number;
	amount: number;
	taxAmount: number;
	/** Phase C — cumulative cents paid against this installment (partial payments). */
	amountPaid: number;
	status: string;
	dueDate: Date;
	originalDueDate: Date | null;
	packageInstanceId: string;
	branchId: string | null;
	purchaseNumber: string | null;
	installmentsTotal: number;
	installmentsPaid: number;
	isLocked: boolean;
	clientId: string | null;
	serviceId: string;
	serviceName: string | null;
	clientName: string | null;
};

/**
 * Hard ceiling on rows returned by listUpcomingInstallments. The tab list passes
 * limit:50, so this only bites the CSV export, which requests the full set. Sized
 * well above any realistic per-tenant outstanding-installment count for an SME gym.
 */
export const UPCOMING_INSTALLMENTS_MAX_LIMIT = 5000;

export interface UpcomingWindowBounds {
	from: Date | null;
	fromInclusive: boolean;
	to: Date | null;
	toInclusive: boolean;
}

/**
 * Pure date-range descriptor for the upcoming-installments window. Kept side-effect
 * free (now injected) so the boundary logic is unit-testable without a DB:
 *   - due_soon: [now, now + 14d] inclusive both ends
 *   - overdue:  (-∞, now) — strictly before now (exclusive upper)
 *   - all:      unbounded (status filter alone decides membership)
 */
export function resolveUpcomingWindow(
	window: "due_soon" | "overdue" | "all",
	now: Date,
): UpcomingWindowBounds {
	switch (window) {
		case "due_soon":
			return {
				from: now,
				fromInclusive: true,
				to: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
				toInclusive: true,
			};
		case "overdue":
			return { from: null, fromInclusive: false, to: now, toInclusive: false };
		default:
			return { from: null, fromInclusive: false, to: null, toInclusive: false };
	}
}

/**
 * List individual outstanding installments (one row per scheduled payment),
 * joined to their package instance and originating sales order for branch scoping.
 *
 * Branch resolution: an installment's branch is its own sales_order link when present,
 * falling back to the package instance's sales_order (legacy schedules created before 0051
 * have neither and are excluded when a branchId filter is applied).
 */
export async function listUpcomingInstallments(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: UpcomingInstallmentsParams = {},
	controlPanelDb?: ControlPanelDb,
): Promise<{ items: UpcomingInstallmentRow[]; total: number }> {
	const {
		window = "due_soon",
		branchId,
		search,
		limit = 50,
		offset = 0,
	} = params;

	const now = new Date();
	const conditions = [inArray(installments.status, ["pending", "overdue"])];

	const bounds = resolveUpcomingWindow(window, now);
	if (bounds.from) {
		conditions.push(
			(bounds.fromInclusive ? gte : gt)(installments.dueDate, bounds.from),
		);
	}
	if (bounds.to) {
		conditions.push(
			(bounds.toInclusive ? lte : lt)(installments.dueDate, bounds.to),
		);
	}

	if (branchId) {
		conditions.push(eq(salesOrders.branchId, branchId));
	}

	// Same search semantics as getAdminInstallmentOverview: client display-name
	// match via control panel, OR exact purchaseNumber; UUID-prefix fallback.
	if (search) {
		let searchUserIds: string[] | null = null;
		if (controlPanelDb) {
			const nameMatchRows = await controlPanelDb
				.select({ id: user.id })
				.from(user)
				.where(ilike(user.name, `%${search}%`));
			searchUserIds = nameMatchRows.map((r) => r.id);
		}
		if (searchUserIds !== null) {
			if (searchUserIds.length > 0) {
				// biome-ignore lint/style/noNonNullAssertion: or() with explicit args is never undefined
				conditions.push(
					or(
						inArray(packageInstances.clientId, searchUserIds),
						eq(packageInstances.purchaseNumber, search),
					)!,
				);
			} else {
				conditions.push(eq(packageInstances.purchaseNumber, search));
			}
		} else {
			// biome-ignore lint/style/noNonNullAssertion: or() with explicit args is never undefined
			conditions.push(
				or(
					ilike(packageInstances.clientId, `${search}%`),
					eq(packageInstances.purchaseNumber, search),
				)!,
			);
		}
	}

	const where = and(...conditions);
	const salesOrderJoin = eq(
		salesOrders.id,
		sql`COALESCE(${installments.salesOrderId}, ${packageInstances.salesOrderId})`,
	);

	const rows = await tenantDb
		.select({
			id: installments.id,
			installmentNumber: installments.installmentNumber,
			amount: installments.amount,
			taxAmount: installments.taxAmount,
			amountPaid: installments.amountPaid,
			status: installments.status,
			dueDate: installments.dueDate,
			originalDueDate: installments.originalDueDate,
			packageInstanceId: installments.packageInstanceId,
			branchId: salesOrders.branchId,
			purchaseNumber: packageInstances.purchaseNumber,
			installmentsTotal: packageInstances.installmentsTotal,
			installmentsPaid: packageInstances.installmentsPaid,
			isLocked: packageInstances.isLocked,
			clientId: packageInstances.clientId,
			serviceId: packageInstances.serviceId,
		})
		.from(installments)
		.innerJoin(
			packageInstances,
			eq(packageInstances.id, installments.packageInstanceId),
		)
		.leftJoin(salesOrders, salesOrderJoin)
		.where(where)
		.orderBy(asc(installments.dueDate), asc(installments.installmentNumber))
		.limit(Math.min(limit, UPCOMING_INSTALLMENTS_MAX_LIMIT))
		.offset(offset);

	const serviceIds = [...new Set(rows.map((r) => r.serviceId))];
	const serviceRows =
		serviceIds.length > 0
			? await tenantDb.query.services.findMany({
					where: (s, { inArray: inArr }) => inArr(s.id, serviceIds),
				})
			: [];
	const serviceMap = new Map(serviceRows.map((s) => [s.id, s.name]));

	let userMap = new Map<string, string>();
	if (controlPanelDb && rows.length > 0) {
		const clientIds = [
			...new Set(
				rows.map((r) => r.clientId).filter((id): id is string => id != null),
			),
		];
		if (clientIds.length > 0) {
			const userRows = await controlPanelDb
				.select({ id: user.id, name: user.name })
				.from(user)
				.where(inArray(user.id, clientIds));
			userMap = new Map(userRows.map((u) => [u.id, u.name]));
		}
	}

	const items: UpcomingInstallmentRow[] = rows.map((row) => ({
		...row,
		serviceName: serviceMap.get(row.serviceId) ?? null,
		clientName: row.clientId ? (userMap.get(row.clientId) ?? null) : null,
	}));

	const countRows = await tenantDb
		.select({ count: sql<number>`count(*)::int` })
		.from(installments)
		.innerJoin(
			packageInstances,
			eq(packageInstances.id, installments.packageInstanceId),
		)
		.leftJoin(salesOrders, salesOrderJoin)
		.where(where);
	const total = countRows[0]?.count ?? 0;

	return { items, total };
}

function escapeInstallmentCsvField(
	value: string | number | null | undefined,
): string {
	if (value == null) return "";
	const str = String(value);
	if (str.includes(",") || str.includes('"') || str.includes("\n")) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

const UPCOMING_INSTALLMENTS_CSV_HEADER =
	"purchase_number,customer_name,package,installment_number,installments_total,installments_paid,due_date,original_due_date,amount_due_cents,status,is_locked,branch_id,package_instance_id\n";

/**
 * Build a CSV of upcoming/outstanding installments matching the SAME filters as
 * listUpcomingInstallments (window/branch/search) — it delegates to that query so
 * the export can never drift from what the tab shows. Caps at
 * UPCOMING_INSTALLMENTS_MAX_LIMIT and reports truncation.
 */
export async function exportUpcomingInstallmentsCsv(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: Omit<UpcomingInstallmentsParams, "limit" | "offset">,
	controlPanelDb?: ControlPanelDb,
): Promise<{ csv: string; truncated: boolean; totalMatching: number }> {
	const { items, total } = await listUpcomingInstallments(
		tenantDb,
		{ ...params, limit: UPCOMING_INSTALLMENTS_MAX_LIMIT, offset: 0 },
		controlPanelDb,
	);

	const body = items
		.map((r) =>
			[
				escapeInstallmentCsvField(r.purchaseNumber),
				escapeInstallmentCsvField(r.clientName),
				escapeInstallmentCsvField(r.serviceName),
				escapeInstallmentCsvField(r.installmentNumber),
				escapeInstallmentCsvField(r.installmentsTotal),
				escapeInstallmentCsvField(r.installmentsPaid),
				escapeInstallmentCsvField(r.dueDate.toISOString()),
				escapeInstallmentCsvField(r.originalDueDate?.toISOString() ?? null),
				escapeInstallmentCsvField(r.amount + (r.taxAmount ?? 0)),
				escapeInstallmentCsvField(r.status),
				escapeInstallmentCsvField(r.isLocked ? "true" : "false"),
				escapeInstallmentCsvField(r.branchId),
				escapeInstallmentCsvField(r.packageInstanceId),
			].join(","),
		)
		.join("\n");

	return {
		csv: UPCOMING_INSTALLMENTS_CSV_HEADER + body + (body ? "\n" : ""),
		truncated: total > items.length,
		totalMatching: total,
	};
}

// ---------------------------------------------------------------------------
// Package installment state query
// ---------------------------------------------------------------------------

export type PackageInstallmentState = {
	isLocked: boolean;
	lockedReason: string | null;
	lockedAt: Date | null;
	creditsTotal: number;
	creditsUnlocked: number | null;
	creditsUsed: number;
	allowCreditOverdraft: boolean;
	creditsAdminOverride: boolean;
	paymentStatus: string;
	status: string;
	installmentsTotal: number;
	installmentsPaid: number;
	installmentsWaived: number;
	/** Phase E2 — Stripe customer id saved for auto-charge (null if no card on file). */
	stripeCustomerId: string | null;
	/** Phase E2 — Whether automatic off-session charging is enabled for this package. */
	autoChargeEnabled: boolean;
};

/**
 * Return the package-level installment and credit state for a single package instance.
 * Used by admin action dialogs to render the correct set of available operations.
 */
export async function getPackageInstallmentState(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
): Promise<PackageInstallmentState> {
	const [pkg] = await tenantDb
		.select({
			isLocked: packageInstances.isLocked,
			lockedReason: packageInstances.lockedReason,
			lockedAt: packageInstances.lockedAt,
			creditsTotal: packageInstances.creditsTotal,
			creditsUnlocked: packageInstances.creditsUnlocked,
			creditsUsed: packageInstances.creditsUsed,
			allowCreditOverdraft: packageInstances.allowCreditOverdraft,
			creditsAdminOverride: packageInstances.creditsAdminOverride,
			paymentStatus: packageInstances.paymentStatus,
			status: packageInstances.status,
			installmentsTotal: packageInstances.installmentsTotal,
			installmentsPaid: packageInstances.installmentsPaid,
			installmentsWaived: packageInstances.installmentsWaived,
			stripeCustomerId: packageInstances.stripeCustomerId,
			autoChargeEnabled: packageInstances.autoChargeEnabled,
		})
		.from(packageInstances)
		.where(eq(packageInstances.id, packageInstanceId))
		.limit(1);

	if (!pkg) throw new Error("Package instance not found");
	return pkg;
}

/**
 * Calculate a suggested refund for a package instance.
 * Fetches the package state and paid installment totals, then delegates to calculateSuggestedRefund.
 */
export async function getSuggestedRefund(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
): Promise<SuggestedRefundResult & SuggestedRefundInput> {
	const pkg = await tenantDb.query.packageInstances.findFirst({
		where: eq(packageInstances.id, packageInstanceId),
	});
	if (!pkg) throw new Error("Package instance not found");

	const paidInstallments = await tenantDb.query.installments.findMany({
		where: and(
			eq(installments.packageInstanceId, packageInstanceId),
			eq(installments.status, "paid"),
		),
	});

	const paidAmount = paidInstallments.reduce((sum, i) => sum + i.amount, 0);
	const paidTaxAmount = paidInstallments.reduce(
		(sum, i) => sum + (i.taxAmount ?? 0),
		0,
	);

	const input: SuggestedRefundInput = {
		creditsTotal: pkg.creditsTotal,
		creditsUnlocked: pkg.creditsUnlocked ?? pkg.creditsTotal, // null = all available
		creditsUsed: pkg.creditsUsed ?? 0,
		totalPrice: pkg.totalPrice ?? 0,
		paidAmount,
		paidTaxAmount,
	};

	const result = calculateSuggestedRefund(input);

	return { ...input, ...result };
}
