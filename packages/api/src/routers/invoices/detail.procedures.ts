import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	assertTenantContext,
} from "../../guards";
import {
	getInvoiceById,
	getInvoiceWithItems,
	getInvoicePrintView,
} from "@avantej-core/services";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { getControlPanelDb } from "../../lib/context-helpers";
import {
	resolveBranchDisplay,
	resolveCustomerContact,
	resolveDocumentIdentity,
} from "../../lib/print-view";
import { guardInvoiceSalesOrderBranch } from "./shared";

export const invoicesDetailProcedures = {
	getById: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"payments",
				"read",
			);

			const invoice = await getInvoiceById(context.tenantDb, input.id);
			if (!invoice) {
				throw new ORPCError("NOT_FOUND", {
					message: `Invoice not found: ${input.id}`,
				});
			}
			assertTenantContext(context);
			// Branch scope lives on the linked sales order (invoices have no branchId).
			// Mirror listInvoices: scoped staff get NOT_FOUND for the orphan/null-branch
			// class; an out-of-scope branch is FORBIDDEN; unscoped admins see everything.
			await guardInvoiceSalesOrderBranch(
				context,
				invoice.salesOrderId,
				input.id,
			);
			return invoice;
		}),

	/**
	 * Fetch an invoice with its line-item breakdown. Historical: this backed
	 * the deleted client-side jsPDF export; the print flow now uses
	 * getPrintView + the /print/invoice/$id page. Kept as public API surface —
	 * its contract is pinned by _e2e/web/payment/invoice-pdf.lifecycle.spec.ts.
	 * Same read permission + hierarchy scope as getById/list.
	 */
	getDetail: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"payments",
				"read",
			);

			const detail = await getInvoiceWithItems(context.tenantDb, input.id);
			if (!detail) {
				throw new ORPCError("NOT_FOUND", {
					message: `Invoice not found: ${input.id}`,
				});
			}
			assertTenantContext(context);
			// Same salesOrder-branch scope as getById (mirrors listInvoices): scoped
			// staff get NOT_FOUND for orphan/null-branch, out-of-scope is FORBIDDEN.
			await guardInvoiceSalesOrderBranch(
				context,
				detail.invoice.salesOrderId,
				input.id,
			);
			return detail;
		}),

	/**
	 * Everything the branded, printable invoice document needs in one call:
	 * classified line items (goods / snapshotted tax / discounts), installment
	 * summary for balance math, branch display block, tenant billing identity
	 * (logo inlined as data URL), and customer contact. Same permission +
	 * branch scope as getDetail.
	 */
	getPrintView: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"payments",
				"read",
			);

			const view = await getInvoicePrintView(context.tenantDb, input.id);
			if (!view) {
				throw new ORPCError("NOT_FOUND", {
					message: `Invoice not found: ${input.id}`,
				});
			}
			assertTenantContext(context);
			await guardInvoiceSalesOrderBranch(
				context,
				view.invoice.salesOrderId,
				input.id,
			);

			const cpDb = getControlPanelDb(context);
			const [identity, branch, contact, orgRow] = await Promise.all([
				resolveDocumentIdentity(context),
				resolveBranchDisplay(context.tenantDb, view.branchId),
				resolveCustomerContact(
					context,
					view.invoice.customerId,
					view.salesOrder?.customerType ?? null,
				),
				context.organizationId
					? cpDb
							.select({ name: organizations.name })
							.from(organizations)
							.where(eq(organizations.id, context.organizationId))
							.limit(1)
					: Promise.resolve([]),
			]);

			return {
				...view,
				identity: {
					...identity,
					orgName: orgRow[0]?.name ?? null,
				},
				branch,
				customer: {
					name: view.invoice.customerName,
					phone: contact.phone,
					email: contact.email,
				},
			};
		}),
};
