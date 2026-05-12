/**
 * POS Service — Point of Sale Orchestrator
 *
 * Provides a single atomic `recordPosSale` function that records an in-store
 * sale end-to-end: customer validation, item subtotal, promo discount, tax,
 * sales order, payment, invoices, package instances, installment schedule,
 * and audit log — all inside a single Drizzle transaction.
 *
 * Also provides `searchPosCustomers` for the customer-lookup combobox.
 */

import { eq, and, sql } from "drizzle-orm";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import { paymentItems } from "@avantej-core/db/schema/tenant/payment-items";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { members } from "@avantej-core/db/schema/tenant/members";
import { services } from "@avantej-core/db/schema/tenant/services";
import { taxRates } from "@avantej-core/db/schema/tenant/tax-rates";
import { promotions, promotionUsages } from "@avantej-core/db/schema/tenant/promotions";
import { installmentPlans } from "@avantej-core/db/schema/tenant/installment-plans";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { ORPCError } from "@orpc/server";
import { writeAudit } from "./audit-log.service";
import { validatePromoCode } from "./promotions.service";
import { calculateInstallmentAmounts, calculateCreditsUnlocked } from "./installment.service";
// Agent 2.3 — Phase 2 Wave 3b — J2 — fallback tax-rate resolution
import { resolveTaxRate } from "./tax.service";

type TenantDb = NeonDatabase<typeof tenantSchema>;
// Drizzle transaction type — structurally compatible with TenantDb for inserts/selects
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface PosLineItem {
	type: "service" | "package" | "product" | "custom";
	refId?: string; // services.id | products.id; null for custom
	description: string; // freeform display text
	quantity: number;
	unitPriceCents: number; // pre-tax, in integer cents
}

export interface RecordPosSaleInput {
	// Customer
	customerType: "member" | "walk_in";
	customerId: string; // member.userId OR walk_in_customers.id
	customerName: string;
	branchId: string; // resolved by frontend; verified in router before calling this
	// Items
	items: PosLineItem[];
	// Promo
	promotionCode?: string; // validated server-side
	// Tax — undefined means no tax (0%)
	taxRateId?: string;
	// Payment
	paymentMethod: "cash" | "card" | "bank_transfer";
	paymentReference?: string; // card auth code, bank transfer ref, etc.
	amountTenderedCents?: number; // for cash, may exceed total — change calculated
	// Installment (only valid if items contains exactly one "package")
	installmentPlanCode?: string; // matches installment_plans.code
	// Notes
	notes?: string;
	/** Per-item trainer assignments. Key = item index (0-based). Optional — POS commission is optional. */
	itemTrainerAssignments?: Record<number, { staffId: string; slotIndex: number }[]>;
	// Actor
	actor: { userId: string; memberId: string; role: string };
}

export interface RecordPosSaleResult {
	salesOrderId: string;
	salesOrderNumber: string;
	invoiceId: string;
	invoiceNumber: string;
	paymentId: string;
	packageInstanceId?: string;
	installmentIds?: string[];
	subtotalCents: number;
	discountCents: number;
	taxCents: number;
	totalCents: number;
	changeDueCents?: number; // for cash payments where tendered > total
}

// ---------------------------------------------------------------------------
// Search types
// ---------------------------------------------------------------------------

export interface PosCustomerResult {
	type: "member" | "walk_in";
	id: string; // member.userId or walk_in_customers.id
	name: string;
	phone?: string | null;
	email?: string | null;
	branchId: string | null;
	lastVisitAt?: Date | null;
}

export interface SearchPosCustomersParams {
	query: string; // min 2 chars
	branchId?: string;
	accessibleNodeIds: string[];
}

// ---------------------------------------------------------------------------
// Utility: date formatting for order number generation
// ---------------------------------------------------------------------------

function formatDateYYYYMMDD(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}${m}${d}`;
}

function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

// ---------------------------------------------------------------------------
// Number generators — use atomic PostgreSQL sequences to eliminate the
// count()+1 race condition when parallel inserts run in the same millisecond.
// Sequences are created by migration 0026 on every tenant DB.
// Format: SO-YYYYMMDD-000001 (6-digit global sequence, not daily-reset)
// ---------------------------------------------------------------------------

async function generateSalesOrderNumber(tx: TenantTx, date: Date): Promise<string> {
	const datePart = formatDateYYYYMMDD(date);
	const result = await tx.execute<{ seq: string }>(sql`SELECT nextval('tenant_sales_order_seq') AS seq`);
	const seq = Number((result.rows[0] as { seq: string | number }).seq);
	return `SO-${datePart}-${String(seq).padStart(6, "0")}`;
}

async function generatePaymentNumber(tx: TenantTx, date: Date): Promise<string> {
	const datePart = formatDateYYYYMMDD(date);
	const result = await tx.execute<{ seq: string }>(sql`SELECT nextval('tenant_payment_seq') AS seq`);
	const seq = Number((result.rows[0] as { seq: string | number }).seq);
	return `PAY-${datePart}-${String(seq).padStart(6, "0")}`;
}

async function generateInvoiceNumber(tx: TenantTx, date: Date): Promise<string> {
	const datePart = formatDateYYYYMMDD(date);
	const result = await tx.execute<{ seq: string }>(sql`SELECT nextval('tenant_invoice_seq') AS seq`);
	const seq = Number((result.rows[0] as { seq: string | number }).seq);
	return `INV-${datePart}-${String(seq).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Record a POS sale atomically.
 *
 * IMPORTANT: Caller (router) must verify branchId ∈ context.accessibleNodeIds
 * BEFORE calling this function. The service does not re-check that invariant.
 *
 * Validates package-service config BEFORE opening the transaction so failures
 * return a clean BAD_REQUEST (not a rolled-back tx).
 */
export async function recordPosSale(
	tenantDb: TenantDb,
	input: RecordPosSaleInput,
): Promise<RecordPosSaleResult> {
	const packageItems = input.items.filter((i) => i.type === "package");

	// ------------------------------------------------------------------
	// Pre-transaction validation: package service eligibility
	// ------------------------------------------------------------------
	const packageServiceMap = new Map<string, typeof services.$inferSelect>();

	if (packageItems.length > 0) {
		for (const item of packageItems) {
			if (!item.refId) {
				throw new ORPCError("BAD_REQUEST", {
					message: `Package line item is missing refId (service ID): "${item.description}"`,
				});
			}

			const service = await tenantDb.query.services.findFirst({
				where: eq(services.id, item.refId),
			});

			if (!service) {
				throw new ORPCError("NOT_FOUND", {
					message: `Service not found: ${item.refId}`,
				});
			}

			if (service.sessionCount == null) {
				throw new ORPCError("BAD_REQUEST", {
					message: `Service "${service.name}" is not sellable as a package: missing sessionCount configuration.`,
				});
			}

			if (!service.expirable || service.expiryDays == null) {
				throw new ORPCError("BAD_REQUEST", {
					message: `Service "${service.name}" is not sellable as a package: expirable must be true and expiryDays must be set.`,
				});
			}

			packageServiceMap.set(item.refId, service);
		}
	}

	// ------------------------------------------------------------------
	// Pre-transaction: resolve installment plan (outside tx to fail fast)
	// ------------------------------------------------------------------
	let installmentPlan: typeof installmentPlans.$inferSelect | null = null;

	if (input.installmentPlanCode) {
		if (packageItems.length !== 1) {
			throw new ORPCError("BAD_REQUEST", {
				message: "An installment plan can only be applied when there is exactly one package item.",
			});
		}

		installmentPlan =
			(await tenantDb.query.installmentPlans.findFirst({
				where: eq(installmentPlans.code, input.installmentPlanCode),
			})) ?? null;

		if (!installmentPlan) {
			throw new ORPCError("NOT_FOUND", {
				message: `Installment plan not found: ${input.installmentPlanCode}`,
			});
		}

		if (!installmentPlan.isActive) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Installment plan "${input.installmentPlanCode}" is not active.`,
			});
		}
	}

	// Walk-ins cannot purchase packages — UI enforces this but we guard server-side
	// to prevent the pkg_owner_xor CHECK constraint from firing with an opaque DB error.
	if (input.customerType === "walk_in") {
		const hasPackage = input.items.some((it) => it.type === "package");
		if (hasPackage) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Walk-in customers cannot purchase packages",
			});
		}
	}

	// ------------------------------------------------------------------
	// Transaction
	// ------------------------------------------------------------------
	const result = await tenantDb.transaction(async (tx) => {
		const now = new Date();

		// Step 1: Validate customer
		if (input.customerType === "member") {
			const member = await tx.query.members.findFirst({
				where: and(
					eq(members.userId, input.customerId),
					eq(members.role, "client"),
				),
			});
			if (!member) {
				throw new ORPCError("NOT_FOUND", {
					message: `Member (client) not found for userId: ${input.customerId}`,
				});
			}
		}

		// Step 3: Validate line items and compute subtotal
		// D.1.1: Reject items with negative price or zero/negative quantity
		for (const item of input.items) {
			if (item.unitPriceCents < 0 || item.quantity < 1) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Item price must be non-negative and quantity must be at least 1",
				});
			}
		}

		let subtotalCents = 0;
		for (const item of input.items) {
			subtotalCents += item.unitPriceCents * item.quantity;
		}

		// Step 4: Apply promotion
		let discountCents = 0;
		let promotionId: string | undefined;

		if (input.promotionCode) {
			const serviceIds = input.items
				.filter((i) => i.type === "service" || i.type === "package")
				.map((i) => i.refId)
				.filter((id): id is string => !!id);

			// validatePromoCode throws on failure — use the tx-compatible call
			// (Drizzle tx is structurally compatible with TenantDb for SELECT operations)
			const { promotion, discountAmount } = await validatePromoCode(
				tx as unknown as TenantDb,
				input.promotionCode,
				{
					customerId: input.customerId,
					orderAmount: subtotalCents,
					serviceIds: serviceIds.length > 0 ? serviceIds : undefined,
					branchId: input.branchId,
				},
			);
			discountCents = discountAmount;
			promotionId = promotion.id;
		}

		// D.1.2: Discount must not exceed subtotal
		if (discountCents > subtotalCents) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Discount cannot exceed subtotal",
			});
		}

		// Step 5: Compute tax
		// Agent 2.3 — J2: when caller passes taxRateId, honor it (back-compat).
		// Otherwise fall back to resolveTaxRate(branchId, now) so the active
		// org-wide rate is captured automatically. The resolved id is later
		// snapshotted on each sales_order_item + the payment_item type='tax'.
		let taxRate: typeof taxRates.$inferSelect | undefined;
		if (input.taxRateId) {
			taxRate = await tx.query.taxRates.findFirst({
				where: eq(taxRates.id, input.taxRateId),
			});
			if (!taxRate) {
				throw new ORPCError("NOT_FOUND", {
					message: `Tax rate not found: ${input.taxRateId}`,
				});
			}
		} else {
			const resolved = await resolveTaxRate(
				tx as unknown as TenantDb,
				input.branchId,
				now,
			);
			if (resolved) {
				taxRate = await tx.query.taxRates.findFirst({
					where: eq(taxRates.id, resolved.id),
				});
			}
		}
		const resolvedTaxRateId: string | null = taxRate?.id ?? null;

		const taxBase = Math.max(0, subtotalCents - discountCents);
		const taxCents = Math.floor((taxBase * (taxRate?.rateInBasisPoints ?? 0)) / 10000);
		const totalCents = taxBase + taxCents;

		// Step 6: Generate numbers
		const salesOrderNumber = await generateSalesOrderNumber(tx, now);
		const paymentNumber = await generatePaymentNumber(tx, now);
		const invoiceNumber = await generateInvoiceNumber(tx, now);

		// Step 7: Insert sales_orders
		// totalAmount = subtotal - discount (PRE-TAX, per existing schema convention)
		const [salesOrder] = await tx
			.insert(salesOrders)
			.values({
				salesOrderNumber,
				date: now,
				customerId: input.customerId,
				customerName: input.customerName,
				customerType: input.customerType,
				createdBy: input.actor.userId,
				branchId: input.branchId,
				status: "confirmed",
				totalAmount: taxBase, // pre-tax, post-discount
				notes: input.notes ?? null,
			})
			.returning();

		if (!salesOrder) throw new Error("Failed to insert sales_order");

		// Step 8: Insert N sales_order_items
		// Agent 2.3 — J2: snapshot the active tax rate id on every line so
		// historical orders reproduce the correct rate after rate edits.
		// Phase 3 Task 3.1: also snapshot rateInBasisPoints and code so
		// the historical rate is self-contained even after rate row edits.
		for (const item of input.items) {
			await tx.insert(salesOrderItems).values({
				salesOrderId: salesOrder.id,
				serviceId:
					(item.type === "service" || item.type === "package") && item.refId
						? item.refId
						: null,
				taxRateId: resolvedTaxRateId,
				taxRateBps: taxRate?.rateInBasisPoints ?? null,
				taxRateCode: taxRate?.code ?? null,
				description: item.description,
				quantity: item.quantity,
				unitPrice: item.unitPriceCents,
				totalPrice: item.unitPriceCents * item.quantity,
			});
		}

		// Step 9: Insert payments
		// POS forces currency='myr' — the payments.currency default is 'usd' which is
		// correct for Stripe-initiated payments elsewhere; we explicitly override here
		// because POS is the create site for in-store MYR payments (plan.md §4.4).
		const paymentStatus =
			input.paymentMethod === "card" && !input.paymentReference ? "pending" : "succeeded";

		// Generate a unique placeholder for stripePaymentIntentId.
		// The payments table requires a NOT NULL UNIQUE value even for non-Stripe POS payments.
		// Convention: "pos_<uuid>" to distinguish from real Stripe PI IDs (pi_xxx).
		const posPaymentIntentId = `pos_${crypto.randomUUID()}`;

		const [payment] = await tx
			.insert(payments)
			.values({
				stripePaymentIntentId: posPaymentIntentId,
				customerId: input.customerId,
				amount: taxBase, // pre-tax, post-discount
				taxAmount: taxCents,
				totalAmount: totalCents,
				currency: "myr", // POS override; default is 'usd' for Stripe payments
				platformFeeAmount: 0,
				platformFeePercentage: 0,
				franchiserAmount: totalCents, // no platform fee at POS
				status: paymentStatus,
				paymentNumber,
				paymentMethod: input.paymentMethod,
				description: `POS sale ${salesOrderNumber}`,
				userId: input.actor.userId,
			})
			.returning();

		if (!payment) throw new Error("Failed to insert payment");

		// Step 10: Insert payment_items
		// Line items
		for (const item of input.items) {
			const itemType =
				item.type === "package"
					? "package"
					: item.type === "service"
						? "booking"
						: "fee";
			await tx.insert(paymentItems).values({
				paymentId: payment.id,
				itemType,
				itemId: item.refId ? item.refId : null,
				description: item.description,
				quantity: item.quantity,
				unitPrice: item.unitPriceCents,
				totalPrice: item.unitPriceCents * item.quantity,
			});
		}

		// Tax item — Agent 2.3 — J2: snapshot the rate id on the type='tax' row.
		// Phase 3 Task 3.1: also snapshot rateInBasisPoints and code.
		if (taxCents > 0 && taxRate) {
			await tx.insert(paymentItems).values({
				paymentId: payment.id,
				itemType: "tax",
				taxRateId: taxRate.id,
				taxRateBps: taxRate.rateInBasisPoints,
				taxRateCode: taxRate.code,
				description: `${taxRate.name} (${(taxRate.rateInBasisPoints / 100).toFixed(2)}%)`,
				quantity: 1,
				unitPrice: taxCents,
				totalPrice: taxCents,
			});
		}

		// Discount item
		if (discountCents > 0) {
			await tx.insert(paymentItems).values({
				paymentId: payment.id,
				itemType: "discount",
				promotionId: promotionId ?? null,
				description: `Promotion discount`,
				quantity: 1,
				unitPrice: -discountCents, // negative to represent deduction
				totalPrice: -discountCents,
			});
		}

		// Step 11: Apply promotion usage (inline — applyPromotion opens its own tx,
		// which would conflict with this outer tx. We inline the two operations here
		// to keep everything in the same transaction and ensure rollback atomicity.)
		if (promotionId) {
			await tx.insert(promotionUsages).values({
				promotionId,
				customerId: input.customerId,
				salesOrderId: salesOrder.id,
				discountAmount: discountCents,
			});

			await tx
				.update(promotions)
				.set({ usageCount: sql`${promotions.usageCount} + 1` })
				.where(eq(promotions.id, promotionId));
		}

		// Step 12: Insert invoice
		const [invoice] = await tx
			.insert(invoices)
			.values({
				invoiceNumber,
				salesOrderId: salesOrder.id,
				paymentId: payment.id,
				date: now,
				dueDate: now,
				customerId: input.customerId,
				customerName: input.customerName,
				createdBy: input.actor.userId,
				paymentMode: input.paymentMethod,
				totalAmount: totalCents,
				amountPaid: totalCents, // paid in full at POS
				status: "paid",
			})
			.returning();

		if (!invoice) throw new Error("Failed to insert invoice");

		// Step 13: Package instances + installments
		let packageInstanceId: string | undefined;
		const installmentIds: string[] = [];

		if (packageItems.length > 0) {
			// Apportion tax evenly across package items
			const totalPackagePrice = packageItems.reduce(
				(sum, i) => sum + i.unitPriceCents * i.quantity,
				0,
			);

			for (const item of packageItems) {
				const service = packageServiceMap.get(item.refId!);
				if (!service) throw new Error(`Service not found in pre-validated map: ${item.refId}`);

				// Proportional tax for this package item
				const itemTotal = item.unitPriceCents * item.quantity;
				const itemTaxAmount =
					totalPackagePrice > 0
						? Math.floor((taxCents * itemTotal) / totalPackagePrice)
						: 0;

				const startsAt = now;
				const expiresAt = addDays(now, service.expiryDays!);

				const installmentsTotal = installmentPlan?.numInstallments ?? 1;

				// installmentsPaid=1: first installment is paid at POS
				const [pkgInstance] = await tx
					.insert(packageInstances)
					.values({
						serviceId: item.refId!,
						clientId: input.customerType === "member" ? input.customerId : null,
						walkInCustomerId: input.customerType === "walk_in" && input.customerId !== "anonymous" ? input.customerId : null,
						source: "purchased",
						paymentId: payment.id,
						totalPrice: itemTotal,
						taxAmount: itemTaxAmount,
						paymentStatus: "paid",
						paymentMethod: input.paymentMethod,
						creditsTotal: service.sessionCount!,
						creditsUsed: 0,
						startsAt,
						expiresAt,
						status: "active",
						paymentPlanType: input.installmentPlanCode ?? "full",
						installmentsTotal,
						installmentsPaid: 1,
						// creditsUnlocked: null = all credits available (full payment)
						// For installment plans, will be set below after schedule creation
						creditsUnlocked:
							installmentPlan && installmentsTotal > 1
								? calculateCreditsUnlocked(service.sessionCount!, 1, installmentsTotal)
								: null,
					})
					.returning();

				if (!pkgInstance) throw new Error("Failed to insert package_instance");
				packageInstanceId = pkgInstance.id;

				// Step 13c: Installment schedule
				if (installmentPlan && installmentsTotal > 1) {
					const amounts = calculateInstallmentAmounts(itemTotal, installmentsTotal);
					const baseTax = Math.floor(itemTaxAmount / installmentsTotal);
					const taxRemainder = itemTaxAmount - baseTax * installmentsTotal;
					const intervalDays =
						installmentPlan.defaultIntervalDays ?? 30;

					for (let i = 1; i <= installmentsTotal; i++) {
						const amount = amounts[i - 1] ?? 0;
						const instTaxAmount =
							i === installmentsTotal ? baseTax + taxRemainder : baseTax;
						const dueDate = addDays(now, i * intervalDays);
						const creditsUnlockedByThis =
							calculateCreditsUnlocked(service.sessionCount!, i, installmentsTotal) -
							calculateCreditsUnlocked(service.sessionCount!, i - 1, installmentsTotal);

						const [installmentRow] = await tx
							.insert(installments)
							.values({
								packageInstanceId: pkgInstance.id,
								installmentNumber: i,
								amount,
								taxAmount: instTaxAmount,
								status: i === 1 ? "paid" : "pending", // first paid at POS
								dueDate,
								paidAt: i === 1 ? now : null,
								paymentMethod: i === 1 ? input.paymentMethod : null,
								confirmedBy: i === 1 ? input.actor.userId : null,
								creditsUnlockedByThis,
							})
							.returning();

						if (installmentRow) {
							installmentIds.push(installmentRow.id);
						}
					}

					// Update package instance with schedule metadata
					const firstDueDate = addDays(now, installmentPlan.defaultIntervalDays ?? 30);
					await tx
						.update(packageInstances)
						.set({
							installmentsTotal,
							nextDueDate: installmentIds.length > 1
								? addDays(now, 2 * intervalDays) // next due = 2nd installment
								: firstDueDate,
							updatedAt: now,
						})
						.where(eq(packageInstances.id, pkgInstance.id));
				}
			}
		}

		// Step 14: Audit log (inside same tx per plan §4.8 contract)
		await writeAudit(tx, {
			actorUserId: input.actor.userId,
			actorMemberId: input.actor.memberId,
			actorRole: input.actor.role,
			action: "sale.create",
			entityType: "sales_order",
			entityId: salesOrder.id,
			branchId: input.branchId,
			summary: `POS sale ${salesOrderNumber} — ${input.customerName} — total ${(totalCents / 100).toFixed(2)} MYR`,
			changes: {
				subtotalCents,
				discountCents,
				taxCents,
				totalCents,
				items: input.items.length,
				customerType: input.customerType,
				customerId: input.customerId,
				paymentMethod: input.paymentMethod,
				hasPromo: !!promotionId,
				hasInstallment: !!(installmentPlan && (installmentPlan.numInstallments ?? 1) > 1),
			},
		});

		// Step 15: Return result
		const changeDueCents =
			input.paymentMethod === "cash" &&
			input.amountTenderedCents != null &&
			input.amountTenderedCents > totalCents
				? input.amountTenderedCents - totalCents
				: undefined;

		return {
			salesOrderId: salesOrder.id,
			salesOrderNumber,
			invoiceId: invoice.id,
			invoiceNumber,
			paymentId: payment.id,
			packageInstanceId,
			installmentIds: installmentIds.length > 0 ? installmentIds : undefined,
			subtotalCents,
			discountCents,
			taxCents,
			totalCents,
			changeDueCents,
		};
	});

	// Commission: fire per-item if trainer assignments provided (outside transaction)
	if (input.itemTrainerAssignments && Object.keys(input.itemTrainerAssignments).length > 0) {
		const { calculateCommissionForPos } = await import("./commission-calculator.service");

		for (const [indexStr, staffAssignments] of Object.entries(input.itemTrainerAssignments)) {
			const itemIndex = parseInt(indexStr, 10);
			const item = input.items[itemIndex];
			if (!item || !item.refId) continue; // Skip items without a service refId

			try {
				await calculateCommissionForPos(tenantDb, {
					salesOrderId: result.salesOrderId,
					serviceId: item.refId,
					unitPriceCents: item.unitPriceCents,
					quantity: item.quantity,
					staffAssignments,
					actor: input.actor,
				});
			} catch (err) {
				// Commission failure must not fail the sale — log and continue
				console.error(JSON.stringify({
					event: "commission_calculation_failed",
					salesOrderId: result.salesOrderId,
					itemIndex,
					error: err instanceof Error ? err.message : String(err),
				}));
			}
		}
	}

	return result;
}

// ---------------------------------------------------------------------------
// Customer search helper
// ---------------------------------------------------------------------------

/**
 * Search for POS customers (members + walk-ins) by name / email / phone.
 *
 * Returns up to 10 results. Members are searched cross-DB (control panel for
 * user name/email; tenant DB for hierarchyScopeId RBAC filter). Walk-ins are
 * searched directly in the tenant DB filtered by branchId.
 *
 * RBAC: only returns results whose branchId / hierarchyScopeId is in accessibleNodeIds.
 */
export async function searchPosCustomers(
	controlPanelDb: ControlPanelDb,
	tenantDb: TenantDb,
	params: SearchPosCustomersParams,
): Promise<PosCustomerResult[]> {
	const { query, accessibleNodeIds } = params;

	if (accessibleNodeIds.length === 0) return [];

	const results: PosCustomerResult[] = [];

	// ---- Members (cross-DB) ----
	// Step 1: Get all client members scoped to accessible nodes
	const clientMembers = await tenantDb.query.members.findMany({
		where: and(
			eq(members.role, "client"),
			eq(members.status, "active"),
		),
	});

	const scopedMembers = clientMembers.filter((m) =>
		accessibleNodeIds.includes(m.hierarchyScopeId),
	);

	if (scopedMembers.length > 0) {
		// Step 2: Fetch user details from control panel in a single batch
		const userIds = scopedMembers.map((m) => m.userId);

		const { user } = await import("@avantej-core/db/schema/auth");
		const { inArray } = await import("drizzle-orm");

		const users = await controlPanelDb
			.select({ id: user.id, name: user.name, email: user.email })
			.from(user)
			.where(inArray(user.id, userIds));

		const userMap = new Map(users.map((u) => [u.id, u]));

		// Step 3: Filter by query (name or email match)
		const lowerQuery = query.toLowerCase();
		for (const member of scopedMembers) {
			const userDetail = userMap.get(member.userId);
			if (!userDetail) continue;

			const nameMatch = userDetail.name?.toLowerCase().includes(lowerQuery);
			const emailMatch = userDetail.email?.toLowerCase().includes(lowerQuery);

			if (nameMatch || emailMatch) {
				results.push({
					type: "member",
					id: member.userId,
					name: userDetail.name ?? "Unknown",
					email: userDetail.email ?? null,
					phone: null, // control panel user table may not have phone
					branchId: member.hierarchyScopeId,
					lastVisitAt: null,
				});
			}

			if (results.length >= 10) break;
		}
	}

	return results.slice(0, 10);
}
