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
import { members } from "@avantej-core/db/schema/tenant/members";
import { services } from "@avantej-core/db/schema/tenant/services";
import { taxRates } from "@avantej-core/db/schema/tenant/tax-rates";
import {
	promotions,
	promotionUsages,
} from "@avantej-core/db/schema/tenant/promotions";
import { installmentPlans } from "@avantej-core/db/schema/tenant/installment-plans";
import { walkInCustomers } from "@avantej-core/db/schema/tenant/walk-in-customers";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { ORPCError } from "@orpc/server";
import { writeAudit } from "./audit-log.service";
import { applyCreditPointDeltaTx } from "./customer-profile.service";
import { validatePromoCode } from "./promotions.service";
import {
	createInstallmentSchedule,
	calculateCreditsUnlocked,
	calculateInstallmentAmounts,
	confirmInstallmentPayment,
} from "./installment.service";
import {
	enrichPosItemTrainerAssignments,
	getLeadAttributionForCustomer,
	writePackageInstanceLeadStaff,
} from "./lead-attribution.service";
// Agent 2.3 — Phase 2 Wave 3b — J2 — fallback tax-rate resolution
import { resolveTaxRate } from "./tax.service";
import * as branchStatsCache from "./branch-stats-cache.service";

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
	// Credit-point redemption (F-CRM-02). Non-negative integer count of points to
	// spend. Applied as a discount AFTER any promo, at 1 point = 1 cent (best-guess
	// product decision — see comment in recordPosSale), capped at the post-promo
	// subtotal so the payable total never goes below zero. Only consumed if the
	// sale commits (redeemed inside the same transaction). Members only.
	creditPointsToRedeem?: number;
	// Tax — undefined means no tax (0%)
	taxRateId?: string;
	// Payment
	paymentMethod: "cash" | "card" | "manual_transfer" | "fpx" | "stripe";
	paymentReference?: string; // card auth code, bank transfer ref, etc.
	amountTenderedCents?: number; // for cash, may exceed total — change calculated
	// Installment (only valid if items contains exactly one "package")
	installmentPlanCode?: string; // matches installment_plans.code
	// Notes
	notes?: string;
	/** Per-item trainer assignments. Key = item index (0-based). Optional — POS commission is optional. */
	itemTrainerAssignments?: Record<
		number,
		{ staffId: string; slotIndex: number }[]
	>;
	/** Preferred trainer for package instances created by this sale. Written to package_instances.preferred_trainer_id. */
	preferredTrainerId?: string;
	/**
	 * Phase 3 — origination attribution.
	 * soldBy: cross-DB userId of the closer (salesperson who converted the deal).
	 *   Persisted to sales_orders.sold_by and used for origination commission.
	 * leadSourceUserId: cross-DB userId of the lead source (referrer/marketing).
	 *   Persisted to sales_orders.lead_source_user_id.
	 * Both are optional — origination commission is optional.
	 */
	soldBy?: string;
	leadSourceUserId?: string;
	// Actor
	actor: { userId: string; memberId: string; role: string };
}

export interface RecordPosSaleResult {
	salesOrderId: string;
	salesOrderNumber: string;
	invoiceId: string;
	invoiceNumber: string;
	paymentId: string;
	packageInstanceIds?: string[];
	installmentIds?: string[];
	subtotalCents: number;
	discountCents: number;
	/** F-CRM-02: credit points actually redeemed on this sale (1 point = 1 cent). */
	creditPointsRedeemed: number;
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

async function generateSalesOrderNumber(
	tx: TenantTx,
	date: Date,
): Promise<string> {
	const datePart = formatDateYYYYMMDD(date);
	const result = await tx.execute<{ seq: string }>(
		sql`SELECT nextval('tenant_sales_order_seq') AS seq`,
	);
	const seq = Number((result.rows[0] as { seq: string | number }).seq);
	return `SO-${datePart}-${String(seq).padStart(6, "0")}`;
}

async function generatePaymentNumber(
	tx: TenantTx,
	date: Date,
): Promise<string> {
	const datePart = formatDateYYYYMMDD(date);
	const result = await tx.execute<{ seq: string }>(
		sql`SELECT nextval('tenant_payment_seq') AS seq`,
	);
	const seq = Number((result.rows[0] as { seq: string | number }).seq);
	return `PAY-${datePart}-${String(seq).padStart(6, "0")}`;
}

async function generateInvoiceNumber(
	tx: TenantTx,
	date: Date,
): Promise<string> {
	const datePart = formatDateYYYYMMDD(date);
	const result = await tx.execute<{ seq: string }>(
		sql`SELECT nextval('tenant_invoice_seq') AS seq`,
	);
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
	// BE-C3: Reject zero-price non-custom items
	// ------------------------------------------------------------------
	for (const item of input.items) {
		if (item.type !== "custom" && item.unitPriceCents === 0) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Service/package items must have a price greater than zero.",
			});
		}
	}

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
				message:
					"An installment plan can only be applied when there is exactly one package item.",
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

	const leadAttribution =
		input.customerType === "member"
			? await getLeadAttributionForCustomer(tenantDb, input.customerId)
			: { primaryStaffMemberId: null, primaryStaffUserId: null };

	const effectiveItemTrainerAssignments = enrichPosItemTrainerAssignments(
		input.items,
		input.itemTrainerAssignments,
		leadAttribution.primaryStaffUserId,
	);

	// ------------------------------------------------------------------
	// F-CRM-02: credit-point redemption is members-only (balance lives on
	// customer_profiles keyed by the member's userId). Reject up front so the
	// operator gets a clean error rather than a silent no-op.
	// ------------------------------------------------------------------
	const requestedRedeemPoints = Math.max(
		0,
		Math.floor(input.creditPointsToRedeem ?? 0),
	);
	if (requestedRedeemPoints > 0 && input.customerType !== "member") {
		throw new ORPCError("BAD_REQUEST", {
			message: "Credit points can only be redeemed for member customers.",
		});
	}

	// ------------------------------------------------------------------
	// BE-C5: Validate walk-in customerId against walk_in_customers table
	// ------------------------------------------------------------------
	if (input.customerType === "walk_in" && input.customerId !== "anonymous") {
		const walkInRecord = await tenantDb.query.walkInCustomers.findFirst({
			where: eq(walkInCustomers.id, input.customerId),
		});
		if (!walkInRecord) {
			throw new ORPCError("NOT_FOUND", {
				message: "Walk-in customer record not found.",
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
				where: eq(members.userId, input.customerId),
			});
			if (!member) {
				throw new ORPCError("NOT_FOUND", {
					message: `Member not found for userId: ${input.customerId}`,
				});
			}
			// 7.8a: surface a typed BAD_REQUEST so the frontend can show a friendly message
			// (e.g. "This staff member cannot be sold to via POS")
			if (member.role !== "client") {
				throw new ORPCError("BAD_REQUEST", {
					message: `Cannot create a POS sale for a member with role '${member.role}'. Only members with role 'client' may purchase via POS.`,
					cause: "non_client_member",
				});
			}
		}

		// Step 3: Validate line items and compute subtotal
		// D.1.1: Reject items with negative price or zero/negative quantity
		for (const item of input.items) {
			if (item.unitPriceCents < 0 || item.quantity < 1) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Item price must be non-negative and quantity must be at least 1",
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
			// Audit-prove H1: a promotion scoped solely to products (applicableProductIds
			// non-empty, applicableServiceIds empty) is wrongly rejected unless the cart's
			// product refIds are passed too. Collect product line-item refIds alongside
			// services so validatePromoCode can match product-scoped promos.
			const productIds = input.items
				.filter((i) => i.type === "product")
				.map((i) => i.refId)
				.filter((id): id is string => !!id);

			// validatePromoCode throws on failure — use the tx-compatible call
			// (Drizzle tx is structurally compatible with TenantDb for SELECT operations)
			const { promotion, discountAmount } = await validatePromoCode(
				tx as unknown as TenantDb,
				input.promotionCode,
				{
					// BE-M2: walk-in sales bypass per-customer limit check (Agent 2 makes customerId optional)
					customerId:
						input.customerType === "walk_in" ? undefined : input.customerId,
					orderAmount: subtotalCents,
					serviceIds: serviceIds.length > 0 ? serviceIds : undefined,
					productIds: productIds.length > 0 ? productIds : undefined,
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

		// Step 4b: Apply credit-point redemption (F-CRM-02).
		//
		// ASSUMPTION (best-guess product decision, flagged for review):
		//   1 credit point == 1 cent of discount.
		//
		// Redemption is applied AFTER the promo discount and capped at the
		// post-promo subtotal (subtotal - promoDiscount) so it can never push the
		// payable total below zero. We additionally clamp to the customer's actual
		// available balance (read with FOR UPDATE inside this tx) so an over-request
		// degrades gracefully to "spend what you have" instead of failing the sale.
		// The deduction + ledger insert run in THIS transaction, so points are only
		// consumed if the whole sale commits.
		let creditPointsRedeemed = 0;
		let creditDiscountCents = 0;
		if (requestedRedeemPoints > 0 && input.customerType === "member") {
			const postPromoSubtotalCents = subtotalCents - discountCents;

			// Lock the profile row and read the live balance.
			const [profile] = await tx
				.select({ creditPoints: customerProfiles.creditPoints })
				.from(customerProfiles)
				.where(eq(customerProfiles.userId, input.customerId))
				.for("update")
				.limit(1);

			const availablePoints = profile?.creditPoints ?? 0;
			// 1 point = 1 cent, capped at post-promo subtotal and available balance.
			creditPointsRedeemed = Math.min(
				requestedRedeemPoints,
				postPromoSubtotalCents,
				availablePoints,
			);

			if (creditPointsRedeemed > 0) {
				creditDiscountCents = creditPointsRedeemed; // 1 point == 1 cent
				// Persist the deduction + ledger row atomically within this tx.
				// sourceId backfilled below once the sales order id is known would be
				// ideal, but sourceType+reason are recorded now; we instead defer the
				// ledger write until after the sales order is inserted (see Step 7b)
				// so sourceId can reference it.
			}
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
			// SP-04: no active default tax rate and none explicitly provided — fail loudly
			// so the operator knows to configure one rather than silently recording 0% tax.
			if (!taxRate) {
				throw new Error(
					"NO_TAX_RATE: No active tax rate configured for this organisation. Set a default tax rate or provide an explicit taxRateId.",
				);
			}
		}
		const resolvedTaxRateId: string | null = taxRate?.id ?? null;

		// F-CRM-02: credit redemption reduces the taxable base alongside the promo
		// discount (1 point = 1 cent). Already capped to the post-promo subtotal and
		// available balance above, so (subtotal - discount - creditDiscount) >= 0.
		const taxBase = Math.max(
			0,
			subtotalCents - discountCents - creditDiscountCents,
		);
		const taxCents = Math.floor(
			(taxBase * (taxRate?.rateInBasisPoints ?? 0)) / 10000,
		);
		const totalCents = taxBase + taxCents;

		// BE-M1: compute the amount actually due at POS counter.
		// For installment plans, the payment row and invoice record only the first
		// installment amount (including any price premium). For full/non-installment
		// sales, dueNowCents === totalCents.
		const totalWithPremiumCents = installmentPlan
			? Math.round(totalCents * (1 + installmentPlan.pricePremiumBps / 10000))
			: totalCents;
		const dueNowCents = installmentPlan
			? calculateInstallmentAmounts(
					totalWithPremiumCents,
					installmentPlan.numInstallments,
				)[0]!
			: totalCents;

		// BE-C1: Reject cash sales where tendered amount is less than due amount
		if (
			input.paymentMethod === "cash" &&
			(input.amountTenderedCents ?? 0) < dueNowCents
		) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Cash tendered (${input.amountTenderedCents ?? 0}) is less than the amount due (${dueNowCents}). Please collect at least the due amount.`,
			});
		}

		// Step 6: Generate numbers
		const salesOrderNumber = await generateSalesOrderNumber(tx, now);
		const paymentNumber = await generatePaymentNumber(tx, now);
		const invoiceNumber = await generateInvoiceNumber(tx, now);

		// Step 7: Insert sales_orders
		// totalAmount = subtotal - discount (PRE-TAX, per existing schema convention)
		// Walk-in customers: when customerType='walk_in', customerId references
		// walk_in_customers.id. Mirror it into the typed FK column so cross-joins
		// (Cancelled Sales, repeat-offender count, etc.) work even when the text
		// columns drift. Members keep walk_in_customer_id NULL.
		// Only mirror a REAL walk_in_customers UUID into the typed FK column. The UI sends
		// the sentinel "anonymous" when there is no registered walk-in record; writing that
		// into a uuid column throws (invalid uuid syntax) and 500s the whole sale. Match the
		// guard used below for package instances / promo usage.
		const walkInCustomerId =
			input.customerType === "walk_in" && input.customerId !== "anonymous"
				? input.customerId
				: null;

		const [salesOrder] = await tx
			.insert(salesOrders)
			.values({
				salesOrderNumber,
				date: now,
				customerId: input.customerId,
				customerName: input.customerName,
				customerType: input.customerType,
				walkInCustomerId,
				createdBy: input.actor.userId,
				branchId: input.branchId,
				// Plan B Phase 3c.1 — online sale stays "pending" until webhook
				// (payment_intent.succeeded for sales_order) flips it to "completed".
				status: input.paymentMethod === "stripe" ? "pending" : "confirmed",
				totalAmount: taxBase, // pre-tax, post-discount
				notes: input.notes ?? null,
				// Phase 3 — origination attribution
				...(input.soldBy ? { soldBy: input.soldBy } : {}),
				...(input.leadSourceUserId
					? { leadSourceUserId: input.leadSourceUserId }
					: {}),
			})
			.returning();

		if (!salesOrder) throw new Error("Failed to insert sales_order");

		// Step 7b: Consume redeemed credit points (F-CRM-02).
		// Now that we have the sales order id we record the deduction + ledger row
		// with sourceType='pos_redemption' and sourceId = the sales order id. The
		// profile row was already locked FOR UPDATE above; applyCreditPointDeltaTx
		// re-locks (cheap, same tx) and validates the balance stays non-negative.
		if (creditPointsRedeemed > 0) {
			await applyCreditPointDeltaTx(tx, {
				customerUserId: input.customerId,
				signedDelta: -creditPointsRedeemed,
				reason: `POS sale ${salesOrder.salesOrderNumber} — credit redemption`,
				sourceType: "pos_redemption",
				sourceId: salesOrder.id,
				actorUserId: input.actor.userId,
			});
		}

		// Step 8: Insert N sales_order_items
		// Agent 2.3 — J2: snapshot the active tax rate id on every line so
		// historical orders reproduce the correct rate after rate edits.
		// Phase 3 Task 3.1: also snapshot rateInBasisPoints and code so
		// the historical rate is self-contained even after rate row edits.
		for (const item of input.items) {
			// Service items (serviceId IS NOT NULL) do NOT earn commission at sale time.
			// Commission is deferred until the linked appointment is delivered
			// (completed or cancelled). Mark the line so the appointment handler
			// can read it without a commission_pending_intents table (Open Q-2 Option B).
			const isServiceItem =
				(item.type === "service" || item.type === "package") &&
				Boolean(item.refId);
			const isProductItem = item.type === "product" && Boolean(item.refId);
			// commissionDeferred = true  → service item, wait for appointment delivery
			// commissionDeferred = false → product item or no refId, earn at sale
			const commissionDeferred = isServiceItem && !isProductItem;

			await tx.insert(salesOrderItems).values({
				salesOrderId: salesOrder.id,
				serviceId: isServiceItem ? item.refId! : null,
				productId: isProductItem ? item.refId! : null,
				taxRateId: resolvedTaxRateId,
				taxRateBps: taxRate?.rateInBasisPoints ?? null,
				taxRateCode: taxRate?.code ?? null,
				description: item.description,
				quantity: item.quantity,
				unitPrice: item.unitPriceCents,
				totalPrice: item.unitPriceCents * item.quantity,
				commissionDeferred,
			});
		}

		// Step 9: Insert payments
		// POS forces currency='myr' — the payments.currency default is 'usd' which is
		// correct for Stripe-initiated payments elsewhere; we explicitly override here
		// because POS is the create site for in-store MYR payments (plan.md §4.4).
		// Plan B Phase 3c.1 — "online" sales park the payment row in pending
		// state; webhook flips it to "succeeded" once Stripe confirms.
		const paymentStatus =
			input.paymentMethod === "stripe"
				? "pending"
				: input.paymentMethod === "card" && !input.paymentReference
					? "pending"
					: "succeeded";

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
				totalAmount: dueNowCents, // BE-M1: record the amount collected at POS (first installment, not full order total)
				currency: "myr", // POS override; default is 'usd' for Stripe payments
				platformFeeAmount: 0,
				platformFeePercentage: 0,
				franchiserAmount: dueNowCents, // no platform fee at POS
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

		// Credit-point redemption discount item (F-CRM-02, 1 point = 1 cent)
		if (creditDiscountCents > 0) {
			await tx.insert(paymentItems).values({
				paymentId: payment.id,
				itemType: "discount",
				description: `Credit points redeemed (${creditPointsRedeemed} pts)`,
				quantity: 1,
				unitPrice: -creditDiscountCents,
				totalPrice: -creditDiscountCents,
			});
		}

		// Step 11: Apply promotion usage (inline — applyPromotion opens its own tx,
		// which would conflict with this outer tx. We inline the two operations here
		// to keep everything in the same transaction and ensure rollback atomicity.)
		if (promotionId) {
			// 7.10: For walk-in customers, store the actual walkInCustomer.id when available
			// rather than the literal string "anonymous", so per-customer usage limits
			// apply correctly. The sentinel "anonymous" is only used when no walkInId
			// is known (e.g. quick add without a registered walk-in record).
			const promoCustomerId =
				input.customerType === "walk_in" && input.customerId !== "anonymous"
					? input.customerId
					: input.customerType === "member"
						? input.customerId
						: null; // truly anonymous — do not write a usage row per-customer
			await tx.insert(promotionUsages).values({
				promotionId,
				customerId: promoCustomerId ?? "anonymous",
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
				// Plan B Phase 3c.1 — online sales aren't paid until webhook fires.
				// BE-M1: for installment plans, amountPaid = first installment only (dueNowCents), not full order total.
				amountPaid: input.paymentMethod === "stripe" ? 0 : dueNowCents,
				// BE-M2: use "partially_paid" when only the first instalment was collected (dueNowCents < totalCents).
				status:
					input.paymentMethod === "stripe"
						? "pending"
						: dueNowCents < totalCents
							? "partially_paid"
							: "paid",
			})
			.returning();

		if (!invoice) throw new Error("Failed to insert invoice");

		// Step 13: Package instances + installments
		// Installment plan flow: schedule is created with installment 1 due today (day 0),
		// installment 2 due at intervalDays, etc. Installment 1 is immediately confirmed paid
		// inline because the customer is paying right now at the POS counter.
		// 7.2: Schedule creation delegated to createInstallmentSchedule (replaces open-coded loop).
		// 7.3: salesOrderId backfilled on both package_instance and installment rows.

		// BE-M3: Validate preferredTrainerId before creating package instances
		if (input.preferredTrainerId) {
			const trainer = await tx.query.members.findFirst({
				where: and(
					eq(members.id, input.preferredTrainerId),
					eq(members.role, "trainer"),
				),
			});
			if (!trainer) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Preferred trainer not found or is not a trainer.",
				});
			}
		}

		let packageInstanceIds: string[] = [];
		const installmentIds: string[] = [];

		if (packageItems.length > 0) {
			for (const item of packageItems) {
				const service = packageServiceMap.get(item.refId!);
				if (!service)
					throw new Error(
						`Service not found in pre-validated map: ${item.refId}`,
					);

				// P0: installment principal must reflect any promo discount, and the package's
				// tax must be its OWN share — not the whole order's. Allocate the discount
				// proportionally by gross, then tax the discounted (net) price at the order
				// rate. Keeps principal & tax consistent and excludes non-package tax.
				const itemGross = item.unitPriceCents * item.quantity;
				const itemDiscount =
					subtotalCents > 0
						? Math.floor((discountCents * itemGross) / subtotalCents)
						: 0;
				const itemNet = itemGross - itemDiscount;
				const itemTaxAmount = Math.floor(
					(itemNet * (taxRate?.rateInBasisPoints ?? 0)) / 10000,
				);

				const startsAt = now;
				const expiresAt = addDays(now, service.expiryDays!);

				const installmentsTotal = installmentPlan?.numInstallments ?? 1;
				const isInstallmentPlan = !!installmentPlan && installmentsTotal > 1;

				// 7.1: Web semantics — start at 0, credits unlocked starts at 0 for plans
				const [pkgInstance] = await tx
					.insert(packageInstances)
					.values({
						serviceId: item.refId!,
						clientId: input.customerType === "member" ? input.customerId : null,
						walkInCustomerId:
							input.customerType === "walk_in" &&
							input.customerId !== "anonymous"
								? input.customerId
								: null,
						source: "purchased",
						salesOrderId: salesOrder.id, // 7.3
						paymentId: payment.id,
						totalPrice: itemNet,
						taxAmount: itemTaxAmount,
						paymentStatus: isInstallmentPlan ? "partially_paid" : "paid",
						paymentMethod: input.paymentMethod,
						creditsTotal: service.sessionCount!,
						creditsUsed: 0,
						startsAt,
						expiresAt,
						status: input.paymentMethod === "stripe" ? "pending" : "active",
						paymentPlanType: input.installmentPlanCode ?? "full",
						installmentsTotal,
						installmentsPaid: 0, // 7.1: web semantics — starts at 0
						// creditsUnlocked: null = all credits available (full/single payment)
						// For installment plans: 0 = no credits until first installment confirmed
						creditsUnlocked: isInstallmentPlan ? 0 : null,
						preferredTrainerId: input.preferredTrainerId ?? null,
					})
					.returning();

				if (!pkgInstance) throw new Error("Failed to insert package_instance");
				packageInstanceIds.push(pkgInstance.id);

				if (input.customerType === "member") {
					await writePackageInstanceLeadStaff(
						tx as unknown as typeof tenantDb,
						{
							packageInstanceId: pkgInstance.id,
							customerUserId: input.customerId,
							preferredTrainerMemberId: input.preferredTrainerId ?? null,
							assignedBy: input.actor.userId,
						},
					);
				}

				// Step 13c: Installment schedule — 7.2: use shared helper
				if (isInstallmentPlan && installmentPlan) {
					const intervalDays = installmentPlan.defaultIntervalDays ?? 30;
					const scheduleRows = await createInstallmentSchedule(
						tx,
						{
							packageInstanceId: pkgInstance.id,
							creditsTotal: service.sessionCount!,
							totalPrice: itemNet,
							taxAmount: itemTaxAmount,
							installmentsTotal,
							intervalDays,
							purchaseDate: now,
							salesOrderId: salesOrder.id,
						},
						{ inTransaction: true },
					);
					for (const row of scheduleRows) {
						installmentIds.push(row.id);
					}

					// Auto-confirm installment #1: customer pays the first installment at the counter.
					// F-INS-2: route through confirmInstallmentPayment so audit + completion fire
					if (scheduleRows.length > 0) {
						const first = scheduleRows[0]!;
						const creditsAfterFirst = calculateCreditsUnlocked(
							service.sessionCount!,
							1,
							installmentsTotal,
						);
						const nextDueDate = scheduleRows[1]?.dueDate ?? null;
						console.log("[pos] auto-confirming installment #1", {
							packageInstanceId: pkgInstance.id,
							installmentId: first.id,
							amount: first.amount,
							creditsAfterFirst,
							nextDueDate: nextDueDate?.toISOString() ?? null,
						});

						await confirmInstallmentPayment(
							tx,
							{
								installmentId: first.id,
								paymentMethod: input.paymentMethod,
								confirmedBy: input.actor.userId,
							},
							{ inTransaction: true },
						);
						console.log("[pos] installment #1 auto-confirmed", {
							packageInstanceId: pkgInstance.id,
							creditsAfterFirst,
						});
					}
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
				creditPointsRedeemed,
				taxCents,
				totalCents,
				items: input.items.length,
				customerType: input.customerType,
				customerId: input.customerId,
				paymentMethod: input.paymentMethod,
				hasPromo: !!promotionId,
				hasInstallment: !!(
					installmentPlan && (installmentPlan.numInstallments ?? 1) > 1
				),
			},
		});

		// Step 15: Return result
		// BE-M1: change due is against what was actually tendered vs. what was due now (first installment, not full order)
		const changeDueCents =
			input.paymentMethod === "cash" &&
			input.amountTenderedCents != null &&
			input.amountTenderedCents > dueNowCents
				? input.amountTenderedCents - dueNowCents
				: undefined;

		return {
			salesOrderId: salesOrder.id,
			salesOrderNumber,
			invoiceId: invoice.id,
			invoiceNumber,
			paymentId: payment.id,
			packageInstanceIds:
				packageInstanceIds.length > 0 ? packageInstanceIds : undefined,
			installmentIds: installmentIds.length > 0 ? installmentIds : undefined,
			subtotalCents,
			discountCents,
			creditPointsRedeemed,
			taxCents,
			totalCents,
			changeDueCents,
		};
	});

	// Commission: fire per-item for PRODUCT items only (commission earns at sale time).
	// Service items (type === "service" | "package") are deferred — commission fires
	// when the linked appointment is delivered (completed or cancelled). The line's
	// commissionDeferred flag is already set to true in the transaction above.
	if (
		effectiveItemTrainerAssignments &&
		Object.keys(effectiveItemTrainerAssignments).length > 0
	) {
		const { calculateCommissionForPos } = await import(
			"./commission-calculator.service"
		);

		// Fix #13 (defensive): the calculator's Pre-step B2 only bails when *all*
		// lines on the order are commission_excluded. It can't tell which specific
		// line each invocation is for. So we must filter excluded lines at the
		// caller. Today no UI sets this flag (POS service writes it as default
		// false), but a future admin "mark line excluded" flow would silently
		// double-pay otherwise. Fetch the persisted rows once and build an
		// excluded-set keyed by service/product refId.
		const persistedItems = await tenantDb
			.select({
				serviceId: salesOrderItems.serviceId,
				productId: salesOrderItems.productId,
				commissionExcluded: salesOrderItems.commissionExcluded,
			})
			.from(salesOrderItems)
			.where(eq(salesOrderItems.salesOrderId, result.salesOrderId));
		const excludedRefIds = new Set(
			persistedItems
				.filter((r) => r.commissionExcluded)
				.map((r) => r.serviceId ?? r.productId)
				.filter((id): id is string => id != null),
		);

		for (const [indexStr, staffAssignments] of Object.entries(
			effectiveItemTrainerAssignments,
		)) {
			const itemIndex = parseInt(indexStr, 10);
			const item = input.items[itemIndex];
			if (!item || !item.refId) continue; // Skip items without a refId

			// Only products earn commission at sale time.
			// Services/packages defer to appointment delivery — skip here.
			if (item.type !== "product") {
				console.info(
					JSON.stringify({
						event: "commission_deferred_service_item",
						salesOrderId: result.salesOrderId,
						itemIndex,
						itemType: item.type,
					}),
				);
				try {
					await writeAudit(tenantDb, {
						actorUserId: input.actor.userId,
						actorMemberId: input.actor.memberId,
						action: "commission.deferred",
						entityType: "sales_order",
						entityId: result.salesOrderId,
						summary: `Commission deferred for ${item.type} item (index ${itemIndex}, serviceId ${item.refId ?? "unknown"}) — fires on appointment delivery`,
						changes: {
							itemIndex,
							serviceId: item.refId ?? null,
							itemType: item.type,
						},
					});
				} catch {
					// best-effort — deferred audit must not block the sale
				}
				continue;
			}

			// Fix #13: skip per-line commission_excluded items.
			if (excludedRefIds.has(item.refId)) {
				console.info(
					JSON.stringify({
						event: "commission_skipped_line_excluded",
						salesOrderId: result.salesOrderId,
						itemIndex,
						refId: item.refId,
					}),
				);
				continue;
			}

			// Fix #19: wrap each per-item commission calc in its own transaction.
			// Previously the calculator's per-staff inserts ran on the bare
			// `tenantDb` outside any tx; a mid-loop throw left partial rows
			// committed and re-runs hit the 23505 path inconsistently. Each item
			// is its own atomic unit — one item failing shouldn't roll back
			// commissions for sibling items.
			try {
				await tenantDb.transaction(async (tx) => {
					await calculateCommissionForPos(tx as unknown as typeof tenantDb, {
						salesOrderId: result.salesOrderId,
						serviceId: item.refId!,
						unitPriceCents: item.unitPriceCents,
						quantity: item.quantity,
						staffAssignments,
						actor: input.actor,
						earnReason: "pos_product",
					});
				});
			} catch (err) {
				// Commission failure must not fail the sale — log and continue.
				// The per-item tx ensures any partial inserts are rolled back.
				console.error(
					JSON.stringify({
						event: "commission_calculation_failed",
						salesOrderId: result.salesOrderId,
						itemIndex,
						error: err instanceof Error ? err.message : String(err),
					}),
				);
			}
		}
	}

	// Phase 3 — Origination commission: fires ONCE per order for confirmed (non-Stripe) orders.
	// Stripe orders fire at the payment_intent.succeeded webhook instead.
	// Must be outside the per-item loop — one split per order, not per item.
	if (
		input.paymentMethod !== "stripe" &&
		(input.soldBy || input.leadSourceUserId)
	) {
		const { calculateOriginationCommission } = await import(
			"./commission-calculator.service"
		);
		try {
			await calculateOriginationCommission(tenantDb, {
				salesOrderId: result.salesOrderId,
				soldByUserId: input.soldBy ?? null,
				leadSourceUserId: input.leadSourceUserId ?? null,
				actor: input.actor,
			});
		} catch (err) {
			// Commission failure must not fail the sale — log and move on.
			console.error(
				JSON.stringify({
					event: "origination_commission_failed",
					salesOrderId: result.salesOrderId,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	}

	// Enqueue branch stats cache refresh for revenue (debounced, fire-and-forget)
	if (input.branchId) {
		branchStatsCache.refresh(tenantDb, input.branchId, "revenue");
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
		where: and(eq(members.role, "client"), eq(members.status, "active")),
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
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				phone: user.phone,
			})
			.from(user)
			.where(inArray(user.id, userIds));

		const userMap = new Map(users.map((u) => [u.id, u]));

		// Step 3: Filter by query (name or email or phone match)
		const lowerQuery = query.toLowerCase();
		for (const member of scopedMembers) {
			const userDetail = userMap.get(member.userId);
			if (!userDetail) continue;

			const nameMatch = userDetail.name?.toLowerCase().includes(lowerQuery);
			const emailMatch = userDetail.email?.toLowerCase().includes(lowerQuery);
			const phoneMatch = userDetail.phone?.toLowerCase().includes(lowerQuery);

			if (nameMatch || emailMatch || phoneMatch) {
				results.push({
					type: "member",
					id: member.userId,
					name: userDetail.name ?? "Unknown",
					email: userDetail.email ?? null,
					phone: userDetail.phone ?? null, // 7.9: joined from control panel user table
					branchId: member.hierarchyScopeId,
					lastVisitAt: null,
				});
			}

			if (results.length >= 10) break;
		}
	}

	return results.slice(0, 10);
}
