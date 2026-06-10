/**
 * POS Router — query procedures
 *
 * - searchCustomers: customer lookup combobox (requires pos:create)
 * - getReceiptData: receipt-printable DTO for a given sale (requires pos:create)
 */

import { eq, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	guardBranchAccessible,
	requirePermissionOrpc,
} from "../../guards";
import { searchPosCustomers } from "@avantej-core/services/pos.service";
import { getControlPanelDb } from "../../lib/context-helpers";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { services } from "@avantej-core/db/schema/tenant/services";

export const posQueryProcedures = {
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
