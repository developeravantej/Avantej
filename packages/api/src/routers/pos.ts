/**
 * POS Router
 *
 * Provides three procedures for the Point-of-Sale flow:
 * - recordSale: atomic single-tx sale creation (requires pos:create)
 * - searchCustomers: customer lookup combobox (requires pos:create)
 * - getReceiptData: receipt-printable DTO for a given sale (requires pos:create)
 *
 * RBAC: all procedures require pos:create permission.
 * Branch scope: recordSale verifies branchId ∈ context.accessibleNodeIds before
 * delegating to the service — this is the router-layer defence per plan §4.1 point 3.
 */

import { and, eq, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {
	assertOrgContextMatch,
	guardBranchAccessible,
	guardInputBranchForContext,
	requirePermissionOrpc,
} from "../guards";
import {
	recordPosSale,
	searchPosCustomers,
} from "@avantej-core/services/pos.service";
import { getControlPanelDb } from "../lib/context-helpers";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { services } from "@avantej-core/db/schema/tenant/services";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";

// Zod schema for a single line item
const posLineItemSchema = z.object({
	type: z.enum(["service", "package", "product", "custom"]),
	refId: z.string().uuid().optional(),
	description: z.string().min(1),
	quantity: z.number().int().min(1),
	unitPriceCents: z.number().int().min(0),
});

export const posRouter = {
	/**
	 * Record an in-store POS sale atomically.
	 *
	 * Performs a branch-scope check at the router level (FORBIDDEN if branchId
	 * is not in caller's accessibleNodeIds), then delegates to recordPosSale.
	 */
	recordSale: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				// Customer
				customerType: z.enum(["member", "walk_in"]),
				customerId: z.string().min(1),
				customerName: z.string().min(1),
				branchId: z.string().uuid(),
				// Items
				items: z.array(posLineItemSchema).min(1),
				// Promo
				promotionCode: z.string().optional(),
				// Credit-point redemption (F-CRM-02). Non-negative integer; applied as a
				// discount at 1 point = 1 cent, capped at the post-promo subtotal. Members only.
				creditPointsToRedeem: z.number().int().min(0).optional(),
				// Tax
				taxRateId: z.string().uuid().optional(),
				// Payment
				paymentMethod: z
					.enum([
						"cash",
						"card",
						"manual_transfer",
						"bank_transfer",
						"fpx",
						"stripe",
						"online",
					])
					.transform(
						(v): "manual_transfer" | "cash" | "card" | "fpx" | "stripe" =>
							v === "bank_transfer"
								? "manual_transfer"
								: v === "online"
									? "stripe"
									: (v as
											| "manual_transfer"
											| "cash"
											| "card"
											| "fpx"
											| "stripe"),
					),
				paymentReference: z.string().optional(),
				amountTenderedCents: z.number().int().min(0).optional(),
				// Installment
				installmentPlanCode: z.string().optional(),
				// Notes
				notes: z.string().optional(),
				// Package: preferred trainer (optional, written to package_instances.preferred_trainer_id)
				preferredTrainerId: z.string().uuid().optional(),
				// Commission: per-item trainer assignments
				itemTrainerAssignments: z
					.record(
						z.string(),
						z.array(
							z.object({
								staffId: z.string().uuid(),
								slotIndex: z.number().int().min(0),
							}),
						),
					)
					.optional(),
				// Phase 3 — origination attribution (optional).
				// soldBy: cross-DB userId of the closer who converted the deal.
				// leadSourceUserId: cross-DB userId of the referrer / lead source.
				// These are Better-Auth user IDs (text, NOT uuid — see auth.user.id and
				// sales_orders.sold_by/lead_source_user_id text columns). The form
				// auto-defaults soldBy to the logged-in user, so a .uuid() constraint
				// here rejects every attributed sale with "Input validation failed".
				soldBy: z.string().min(1).optional(),
				leadSourceUserId: z.string().min(1).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			assertOrgContextMatch(context, input);
			// Permission check: pos:create
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"pos",
				"create",
			);

			// Branch scope check (router-layer per plan §4.1 point 3)
			await guardInputBranchForContext(context, input.branchId);

			// SP-01: Reject stripe payment if the org has no active Stripe account configured
			if (input.paymentMethod === "stripe") {
				const controlPanelDb = getControlPanelDb(context);
				const [stripeAccount] = await controlPanelDb
					.select({ id: orgCountryStripeAccounts.id })
					.from(orgCountryStripeAccounts)
					.where(
						and(
							eq(orgCountryStripeAccounts.organizationId, input.organizationId),
							eq(orgCountryStripeAccounts.chargesEnabled, true),
						),
					)
					.limit(1);
				if (!stripeAccount) {
					throw new ORPCError("BAD_REQUEST", {
						message:
							"Stripe is not configured for this organisation. Use a different payment method.",
					});
				}
			}

			try {
				return await recordPosSale(context.tenantDb, {
					customerType: input.customerType,
					customerId: input.customerId,
					customerName: input.customerName,
					branchId: input.branchId,
					items: input.items,
					promotionCode: input.promotionCode,
					creditPointsToRedeem: input.creditPointsToRedeem,
					taxRateId: input.taxRateId,
					paymentMethod: input.paymentMethod,
					paymentReference: input.paymentReference,
					amountTenderedCents: input.amountTenderedCents,
					installmentPlanCode: input.installmentPlanCode,
					notes: input.notes,
					preferredTrainerId: input.preferredTrainerId,
					itemTrainerAssignments: input.itemTrainerAssignments
						? Object.fromEntries(
								Object.entries(input.itemTrainerAssignments).map(([k, v]) => [
									parseInt(k, 10),
									v,
								]),
							)
						: undefined,
					// Phase 3 — origination attribution
					soldBy: input.soldBy,
					leadSourceUserId: input.leadSourceUserId,
					actor: {
						userId: context.session.user.id,
						memberId: context.member.id,
						role: context.member.role,
					},
				});
			} catch (err) {
				// SP-04: remap service-layer NO_TAX_RATE sentinel to a client-visible BAD_REQUEST
				if (err instanceof Error && err.message.startsWith("NO_TAX_RATE:")) {
					throw new ORPCError("BAD_REQUEST", {
						message: "No active tax rate is configured for this organisation.",
					});
				}
				throw err;
			}
		}),

	/**
	 * Search for customers (members + walk-ins) by name, email, or phone.
	 * Returns up to 10 results, RBAC-filtered by accessible node IDs.
	 */
	searchCustomers: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				query: z.string(),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"pos",
				"create",
			);

			guardBranchAccessible(input.branchId, context.accessibleNodeIds);

			const controlPanelDb = getControlPanelDb(context);

			return searchPosCustomers(controlPanelDb, context.tenantDb, {
				query: input.query,
				branchId: input.branchId,
				accessibleNodeIds: context.accessibleNodeIds ?? [],
			});
		}),

	/**
	 * Get receipt-printable data for a completed sale.
	 *
	 * Joins sales_orders + sales_order_items + payments (via invoice.paymentId) +
	 * invoices + optional package_instances + installments.
	 * Customer name is enriched cross-DB for member customers.
	 */
	getReceiptData: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				salesOrderId: z.string().uuid(),
			}),
		)
		.handler(async ({ context, input }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"pos",
				"create",
			);

			const controlPanelDb = getControlPanelDb(context);
			const accessibleNodeIds = context.accessibleNodeIds ?? [];
			// Narrow tenantDb to non-null (already checked above)
			const db = context.tenantDb;

			// Fetch sales order
			const order = await db.query.salesOrders.findFirst({
				where: eq(salesOrders.id, input.salesOrderId),
			});

			if (!order) {
				throw new ORPCError("NOT_FOUND", { message: "Sales order not found" });
			}

			// Branch-scope check on the order
			if (!accessibleNodeIds.includes(order.branchId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "Sale is outside your accessible scope",
				});
			}

			// Fetch line items
			const items: (typeof salesOrderItems.$inferSelect)[] =
				await db.query.salesOrderItems.findMany({
					where: eq(salesOrderItems.salesOrderId, order.id),
				});

			// Fetch invoice (invoices link to sales order)
			const invoice = await db.query.invoices.findFirst({
				where: eq(invoices.salesOrderId, order.id),
			});

			// Fetch payment via invoice.paymentId (payments has no salesOrderId column)
			let payment: typeof payments.$inferSelect | null = null;
			if (invoice?.paymentId) {
				payment =
					(await db.query.payments.findFirst({
						where: eq(payments.id, invoice.paymentId),
					})) ?? null;
			}

			// Fetch package instances (by paymentId if payment exists)
			let packageInstance: typeof packageInstances.$inferSelect | null = null;
			let installmentList: (typeof installments.$inferSelect)[] = [];

			if (payment) {
				packageInstance =
					(await db.query.packageInstances.findFirst({
						where: eq(packageInstances.paymentId, payment.id),
					})) ?? null;

				if (packageInstance) {
					installmentList = await db.query.installments.findMany({
						where: eq(installments.packageInstanceId, packageInstance.id),
					});
				}
			}

			// Resolve service names for items
			const serviceIds = items
				.filter((item) => item.serviceId != null)
				.map((item) => item.serviceId as string);

			const serviceMap = new Map<string, string>();
			if (serviceIds.length > 0) {
				const serviceRows = await db
					.select({ id: services.id, name: services.name })
					.from(services)
					.where(inArray(services.id, serviceIds));
				for (const s of serviceRows) serviceMap.set(s.id, s.name);
			}

			// Enrich customer name cross-DB (best-effort)
			let customerDisplayName = order.customerName;
			if (order.customerType === "member" && order.customerId) {
				try {
					const userRow = await controlPanelDb.query.user.findFirst({
						where: (u, { eq: eqFn }) => eqFn(u.id, order.customerId!),
					});
					if (userRow?.name) customerDisplayName = userRow.name;
				} catch {
					// best-effort: control panel unavailable or user not found
				}
			}

			return {
				order: {
					id: order.id,
					salesOrderNumber: order.salesOrderNumber,
					date: order.date,
					customerType: order.customerType,
					customerId: order.customerId,
					customerName: customerDisplayName,
					branchId: order.branchId,
					status: order.status,
					totalAmount: order.totalAmount,
					notes: order.notes,
				},
				items: items.map((item) => ({
					id: item.id,
					serviceId: item.serviceId,
					serviceName: item.serviceId
						? (serviceMap.get(item.serviceId) ?? null)
						: null,
					description: item.description,
					quantity: item.quantity,
					unitPrice: item.unitPrice,
					totalPrice: item.totalPrice,
				})),
				payment: payment
					? {
							id: payment.id,
							paymentNumber: payment.paymentNumber,
							paymentMethod: payment.paymentMethod,
							amount: payment.amount,
							taxAmount: payment.taxAmount,
							totalAmount: payment.totalAmount,
							currency: payment.currency,
							status: payment.status,
						}
					: null,
				invoice: invoice
					? {
							id: invoice.id,
							invoiceNumber: invoice.invoiceNumber,
							date: invoice.date,
							totalAmount: invoice.totalAmount,
							amountPaid: invoice.amountPaid,
							status: invoice.status,
						}
					: null,
				packageInstance: packageInstance
					? {
							id: packageInstance.id,
							serviceId: packageInstance.serviceId,
							creditsTotal: packageInstance.creditsTotal,
							creditsUsed: packageInstance.creditsUsed,
							startsAt: packageInstance.startsAt,
							expiresAt: packageInstance.expiresAt,
							status: packageInstance.status,
							paymentPlanType: packageInstance.paymentPlanType,
							installmentsTotal: packageInstance.installmentsTotal,
							installmentsPaid: packageInstance.installmentsPaid,
						}
					: null,
				installments: installmentList.map((inst) => ({
					id: inst.id,
					installmentNumber: inst.installmentNumber,
					amount: inst.amount,
					taxAmount: inst.taxAmount,
					status: inst.status,
					dueDate: inst.dueDate,
					paidAt: inst.paidAt,
				})),
			};
		}),
};
