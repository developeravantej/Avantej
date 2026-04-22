/**
 * Installment Service
 *
 * Handles installment-based credit unlocking for package instances.
 * Supports schedule creation, payment confirmation, lock/unlock logic,
 * and admin overview queries.
 */

import { eq, and, isNull, asc, isNotNull, or, ilike, lte, gte, inArray } from "drizzle-orm";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { installmentEvents } from "@avantej-core/db/schema/tenant/installment-events";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { user } from "@avantej-core/db/schema/auth";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { writeAudit } from "./audit-log.service";

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
 * The first installment absorbs any rounding remainder.
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
		amounts.push(i === 0 ? base + remainder : base);
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
export function calculateSuggestedRefund(input: SuggestedRefundInput): SuggestedRefundResult {
	const { creditsTotal, creditsUnlocked, creditsUsed, totalPrice, paidAmount, paidTaxAmount } =
		input;

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
		paidAmount > 0 ? Math.round(paidTaxAmount * (suggestedRefund / paidAmount)) : 0;

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
};

/**
 * Create an installment schedule for a package instance.
 * Also updates nextDueDate and installmentsTotal on the package instance.
 */
export async function createInstallmentSchedule(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CreateInstallmentScheduleParams,
): Promise<(typeof installments.$inferSelect)[]> {
	const installmentsTotal = params.installmentsTotal;
	const amounts = calculateInstallmentAmounts(params.totalPrice, installmentsTotal);
	const baseTaxPerInstallment = Math.floor(params.taxAmount / installmentsTotal);
	const taxRemainder = params.taxAmount - baseTaxPerInstallment * installmentsTotal;

	return tenantDb.transaction(async (tx) => {
		const rows: (typeof installments.$inferSelect)[] = [];

		for (let i = 1; i <= installmentsTotal; i++) {
			const amount = amounts[i - 1] ?? 0;
			// Last installment absorbs the tax rounding remainder
			const taxAmount =
				i === installmentsTotal
					? baseTaxPerInstallment + taxRemainder
					: baseTaxPerInstallment;
			const dueDate = addDays(params.purchaseDate, i * params.intervalDays);
			const creditsUnlockedByThis =
				calculateCreditsUnlocked(params.creditsTotal, i, installmentsTotal) -
				calculateCreditsUnlocked(params.creditsTotal, i - 1, installmentsTotal);

			const [row] = await tx
				.insert(installments)
				.values({
					packageInstanceId: params.packageInstanceId,
					installmentNumber: i,
					amount,
					taxAmount,
					status: "pending",
					dueDate,
					creditsUnlockedByThis,
				})
				.returning();

			if (row) rows.push(row);
		}

		// Update packageInstance with schedule metadata — atomic with inserts
		const firstDueDate = rows[0]?.dueDate ?? addDays(params.purchaseDate, params.intervalDays);
		await tx
			.update(packageInstances)
			.set({
				installmentsTotal,
				nextDueDate: firstDueDate,
				updatedAt: new Date(),
			})
			.where(eq(packageInstances.id, params.packageInstanceId));

		return rows;
	});
}

// ---------------------------------------------------------------------------
// Payment confirmation
// ---------------------------------------------------------------------------

export type ConfirmInstallmentPaymentParams = {
	installmentId: string;
	paymentMethod: "manual_transfer" | "cash";
	notes?: string;
	confirmedBy: string;
	nextIntervalDays?: number;
};

export async function confirmInstallmentPayment(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: ConfirmInstallmentPaymentParams,
): Promise<{
	installment: typeof installments.$inferSelect;
	packageInstance: typeof packageInstances.$inferSelect;
}> {
	return tenantDb.transaction(async (tx) => {
		// Lock the installment row to prevent concurrent double-payment
		const [installment] = await tx
			.select()
			.from(installments)
			.where(eq(installments.id, params.installmentId))
			.for("update");
		if (!installment) throw new Error("Installment not found");
		if (installment.status !== "pending" && installment.status !== "overdue") {
			throw new Error(`Installment is already ${installment.status}`);
		}

		// Lock the package instance row to prevent concurrent installmentsPaid increment
		const [pkg] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, installment.packageInstanceId))
			.for("update");
		if (!pkg) throw new Error("Package instance not found");

		const now = new Date();

		// Mark installment as paid
		const [updatedInstallment] = await tx
			.update(installments)
			.set({
				status: "paid",
				paidAt: now,
				paymentMethod: params.paymentMethod,
				confirmedBy: params.confirmedBy,
				notes: params.notes ?? null,
				updatedAt: now,
			})
			.where(eq(installments.id, params.installmentId))
			.returning();

		if (!updatedInstallment) throw new Error("Failed to update installment");

		// Recalculate credits — use max() so an admin override is never rolled back by a payment
		const newInstallmentsPaid = pkg.installmentsPaid + 1;
		const formulaCredits = calculateCreditsUnlocked(
			pkg.creditsTotal,
			newInstallmentsPaid,
			pkg.installmentsTotal,
		);
		const newCreditsUnlocked = Math.max(pkg.creditsUnlocked ?? 0, formulaCredits);
		// Determine nextDueDate
		let newNextDueDate: Date | null = null;
		let newGracePeriodEndsAt: Date | null = null; // clear grace period on payment

		if (newInstallmentsPaid < pkg.installmentsTotal) {
			if (params.nextIntervalDays !== undefined) {
				newNextDueDate = addDays(now, params.nextIntervalDays);
			} else {
				// Find next pending installment
				const nextInstallment = await tx.query.installments.findFirst({
					where: and(
						eq(installments.packageInstanceId, pkg.id),
						eq(installments.status, "pending"),
					),
					orderBy: [asc(installments.installmentNumber)],
				});
				newNextDueDate = nextInstallment?.dueDate ?? null;
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

		// Log events
		await logInstallmentEvent(tx, {
			packageInstanceId: pkg.id,
			installmentId: params.installmentId,
			eventType: "payment_received",
			actorId: params.confirmedBy,
			amount: installment.amount,
		});

		await logInstallmentEvent(tx, {
			packageInstanceId: pkg.id,
			installmentId: params.installmentId,
			eventType: "credits_unlocked",
			actorId: params.confirmedBy,
			metadata: JSON.stringify({ creditsUnlocked: newCreditsUnlocked }),
		});

		// D.2.3 — Audit installment payment confirmation
		await writeAudit(tx, {
			actorUserId: params.confirmedBy,
			action: "installment.paid",
			entityType: "installment",
			entityId: params.installmentId,
			summary: `Installment ${params.installmentId} confirmed paid (package: ${pkg.id}, installment #${updatedInstallment.installmentNumber})`,
			changes: {
				packageInstanceId: pkg.id,
				installmentNumber: updatedInstallment.installmentNumber,
				amount: updatedInstallment.amount,
				paymentMethod: params.paymentMethod,
				creditsUnlocked: newCreditsUnlocked,
			},
		});

		return { installment: updatedInstallment, packageInstance: updatedPkg };
	});
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
		.select({ id: packageInstances.id, status: packageInstances.status, expiresAt: packageInstances.expiresAt })
		.from(packageInstances)
		.where(eq(packageInstances.id, packageInstanceId));

	if (!pkg || pkg.status !== "active") return;
	if (!pkg.expiresAt || pkg.expiresAt > now) return;

	await tenantDb
		.update(packageInstances)
		.set({ status: "expired", updatedAt: now })
		.where(eq(packageInstances.id, packageInstanceId));
}

// ---------------------------------------------------------------------------
// Lock evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a package instance and lock it if overdue past the grace period.
 * Safe to call repeatedly (idempotent).
 */
export async function evaluateAndLockIfOverdue(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
): Promise<typeof packageInstances.$inferSelect> {
	// Check and mark expired before acquiring the lock — idempotent, safe to run outside tx
	await evaluateAndExpireIfOverdue(tenantDb, packageInstanceId);

	// Read grace period config before taking the row lock — pure read, no race concern
	const gracePeriodDays = await getGracePeriodDaysForPackage(tenantDb, packageInstanceId);

	return tenantDb.transaction(async (tx) => {
		// Lock the package instance to prevent concurrent grace period start / lock
		const [pkg] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, packageInstanceId))
			.for("update");
		if (!pkg) throw new Error("Package instance not found");

		// Already locked — nothing to do
		if (pkg.isLocked) return pkg;

		// Not on installment plan, or fully paid — nothing to do
		if (pkg.paymentPlanType === null || pkg.installmentsPaid >= pkg.installmentsTotal) return pkg;

		// No due date set — nothing to do
		if (!pkg.nextDueDate) return pkg;

		const now = new Date();

		if (pkg.nextDueDate < now) {
			// Mark the next pending installment as overdue
			const nextPending = await tx.query.installments.findFirst({
				where: and(
					eq(installments.packageInstanceId, packageInstanceId),
					eq(installments.status, "pending"),
				),
				orderBy: [asc(installments.installmentNumber)],
			});

			if (nextPending) {
				await tx
					.update(installments)
					.set({ status: "overdue", updatedAt: now })
					.where(eq(installments.id, nextPending.id));
			}

			let updatedPkg = pkg;

			if (!pkg.gracePeriodEndsAt) {
				// Start grace period
				const gracePeriodEndsAt = addDays(pkg.nextDueDate, gracePeriodDays);
				const [updated] = await tx
					.update(packageInstances)
					.set({ gracePeriodEndsAt, updatedAt: now })
					.where(eq(packageInstances.id, packageInstanceId))
					.returning();
				if (updated) updatedPkg = updated;

				await logInstallmentEvent(tx, {
					packageInstanceId,
					installmentId: nextPending?.id ?? null,
					eventType: "grace_period_started",
				});
			} else if (pkg.gracePeriodEndsAt < now) {
				// Grace period expired — lock the package
				const [updated] = await tx
					.update(packageInstances)
					.set({
						isLocked: true,
						lockedAt: now,
						lockedReason: "non_payment",
						updatedAt: now,
					})
					.where(eq(packageInstances.id, packageInstanceId))
					.returning();
				if (updated) updatedPkg = updated;

				await logInstallmentEvent(tx, {
					packageInstanceId,
					installmentId: nextPending?.id ?? null,
					eventType: "package_locked",
				});
			}

			return updatedPkg;
		}

		return pkg;
	});
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

		const newUnlocked = params.creditsUnlocked ?? (pkg.creditsUnlocked ?? pkg.creditsTotal);
		const newUsed = params.creditsUsed ?? pkg.creditsUsed;

		if (newUnlocked > pkg.creditsTotal) {
			throw Object.assign(new Error(`creditsUnlocked (${newUnlocked}) cannot exceed creditsTotal (${pkg.creditsTotal})`), { code: "BAD_REQUEST" });
		}
		if (newUsed > newUnlocked) {
			throw Object.assign(new Error(`creditsUsed (${newUsed}) cannot exceed creditsUnlocked (${newUnlocked})`), { code: "BAD_REQUEST" });
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
				previous: { creditsUnlocked: pkg.creditsUnlocked, creditsUsed: pkg.creditsUsed },
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
): Promise<void> {
	await tenantDb.transaction(async (tx) => {
		await tx
			.update(packageInstances)
			.set({
				paymentStatus: "refunded",
				status: "cancelled",
				updatedAt: new Date(),
			})
			.where(eq(packageInstances.id, packageInstanceId));

		// Log the installment event (uses tx for consistency)
		await tx.insert(installmentEvents).values({
			packageInstanceId,
			installmentId: null,
			eventType: "manual_refund",
			actorId,
			amount,
			reason,
			metadata: null,
		});

		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "package.refund",
			entityType: "package_instance",
			entityId: packageInstanceId,
			summary: `Admin processed refund for package ${packageInstanceId}: ${reason}`,
			changes: { refundAmount: amount, reason },
		});
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
	const installment = await tenantDb.query.installments.findFirst({
		where: eq(installments.id, installmentId),
	});
	if (!installment) throw new Error("Installment not found");

	if (installment.status === "paid") {
		const err = new Error("Cannot reschedule a paid installment");
		(err as any).code = "CONFLICT";
		throw err;
	}

	const pkg = await tenantDb.query.packageInstances.findFirst({
		where: eq(packageInstances.id, installment.packageInstanceId),
	});
	if (!pkg) throw new Error("Package instance not found");

	if (pkg.isLocked) {
		const err = new Error("Cannot reschedule an installment for a locked package");
		(err as any).code = "CONFLICT";
		throw err;
	}

	const now = new Date();
	if (newDueDate <= now) {
		const err = new Error("New due date must be in the future");
		(err as any).code = "BAD_REQUEST";
		throw err;
	}

	const oldDueDate = installment.dueDate;

	// Update the installment — set to pending (clears overdue status) with new due date
	const [updated] = await tenantDb
		.update(installments)
		.set({
			dueDate: newDueDate,
			status: "pending",
			updatedAt: now,
		})
		.where(eq(installments.id, installmentId))
		.returning();

	if (!updated) throw new Error("Failed to update installment");

	// Find the next pending installment by installment number (lowest not yet paid)
	const nextPending = await tenantDb.query.installments.findFirst({
		where: and(
			eq(installments.packageInstanceId, installment.packageInstanceId),
			eq(installments.status, "pending"),
		),
		orderBy: [asc(installments.installmentNumber)],
	});

	// If the rescheduled installment is the next-due one, update the package's nextDueDate
	if (nextPending && nextPending.id === installmentId) {
		await tenantDb
			.update(packageInstances)
			.set({
				nextDueDate: newDueDate,
				gracePeriodEndsAt: null,
				updatedAt: now,
			})
			.where(eq(packageInstances.id, installment.packageInstanceId));
	}

	// Log the reschedule event
	await logInstallmentEvent(tenantDb, {
		packageInstanceId: installment.packageInstanceId,
		installmentId,
		eventType: "installment_rescheduled",
		actorId,
		reason,
		metadata: JSON.stringify({ oldDueDate: oldDueDate.toISOString(), newDueDate: newDueDate.toISOString() }),
	});

	return updated;
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
	status?: "active" | "overdue" | "locked";
	limit?: number;
	offset?: number;
	search?: string;
	dueBefore?: Date;
	dueAfter?: Date;
	paymentPlanCode?: string;
};

export type AdminInstallmentOverviewItem = typeof packageInstances.$inferSelect & {
	serviceName: string | null;
	clientName: string | null;
};

/**
 * Get a paginated overview of installment-based package instances for admin use.
 */
export async function getAdminInstallmentOverview(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: AdminInstallmentOverviewParams = {},
	controlPanelDb?: ControlPanelDb,
): Promise<{ items: AdminInstallmentOverviewItem[]; total: number }> {
	const { status, limit = 50, offset = 0, search, dueBefore, dueAfter, paymentPlanCode } = params;

	// Build the filter conditions
	const conditions = [
		// Must be on an installment plan
		isNotNull(packageInstances.paymentPlanType),
	];

	if (status === "locked") {
		conditions.push(eq(packageInstances.isLocked, true));
	} else if (status === "overdue") {
		conditions.push(eq(packageInstances.isLocked, false));
		conditions.push(isNotNull(packageInstances.gracePeriodEndsAt));
	} else if (status === "active") {
		conditions.push(eq(packageInstances.isLocked, false));
		conditions.push(isNull(packageInstances.gracePeriodEndsAt));
	}

	if (search) {
		// `or()` is always non-null here because we always pass arguments
		conditions.push(
			// biome-ignore lint/style/noNonNullAssertion: or() with explicit args is never undefined
			or(
				ilike(packageInstances.clientId, `${search}%`),
				eq(packageInstances.purchaseNumber, search),
			)!,
		);
	}
	if (dueBefore) conditions.push(lte(packageInstances.nextDueDate, dueBefore));
	if (dueAfter) conditions.push(gte(packageInstances.nextDueDate, dueAfter));
	if (paymentPlanCode) conditions.push(eq(packageInstances.paymentPlanType, paymentPlanCode));

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
		const clientIds = [...new Set(rows.map((r) => r.clientId).filter((id): id is string => id != null))];
		if (clientIds.length > 0) {
			const userRows = await controlPanelDb
				.select({ id: user.id, name: user.name })
				.from(user)
				.where(inArray(user.id, clientIds));
			userMap = new Map(userRows.map((u) => [u.id, u.name]));
		}
	}

	const items: AdminInstallmentOverviewItem[] = rows.map((row) => ({
		...row,
		serviceName: serviceMap.get(row.serviceId) ?? null,
		clientName: row.clientId ? (userMap.get(row.clientId) ?? null) : null,
	}));

	// Count total
	const allRows = await tenantDb.query.packageInstances.findMany({
		where,
		columns: { id: true },
	});
	const total = allRows.length;

	return { items, total };
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
	const paidTaxAmount = paidInstallments.reduce((sum, i) => sum + (i.taxAmount ?? 0), 0);

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
