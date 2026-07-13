import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	assertTenantContext,
} from "../../guards";
import { getOrIssueReceiptForInvoice } from "@avantej-core/services";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { getControlPanelDb } from "../../lib/context-helpers";
import {
	resolveBranchDisplay,
	resolveCustomerContact,
	resolveDocumentIdentity,
} from "../../lib/print-view";
import { guardInvoiceSalesOrderBranch } from "../invoices/shared";

export const receiptsPrintProcedures = {
	/**
	 * Get-or-issue the receipt for an invoice and return the full print
	 * payload. First call mints a stable RCP number; later calls refresh the
	 * snapshotted payment lines in place when the paid set changed (a newly
	 * confirmed installment) — the number never changes.
	 *
	 * SETTLED: issuance runs under `payments:read` BY DESIGN, even though the
	 * first call INSERTs a row. Printing a receipt is a front-desk read-path
	 * action (cashiers hold payments:read, not settings/write permissions), and
	 * issuance is idempotent + derived entirely from existing payment state —
	 * it creates no new business fact. Do not "fix" this to a write permission
	 * without revisiting who prints receipts.
	 *
	 * BAD_REQUEST when the invoice has no completed payment yet (e.g. a
	 * Stripe-pending sale) — a zero-line receipt must not be issued.
	 */
	getPrintViewForInvoice: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				invoiceId: z.string().uuid(),
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

			const invoice = await context.tenantDb.query.invoices.findFirst({
				where: eq(invoices.id, input.invoiceId),
			});
			if (!invoice) {
				throw new ORPCError("NOT_FOUND", {
					message: `Invoice not found: ${input.invoiceId}`,
				});
			}
			assertTenantContext(context);
			await guardInvoiceSalesOrderBranch(
				context,
				invoice.salesOrderId,
				input.invoiceId,
			);

			const receipt = await getOrIssueReceiptForInvoice(
				context.tenantDb,
				input.invoiceId,
				context.member.userId,
			);
			if (!receipt) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"No completed payment is recorded for this invoice yet — a receipt cannot be issued.",
				});
			}

			const customerType = invoice.salesOrderId
				? ((
						await context.tenantDb.query.salesOrders.findFirst({
							where: eq(salesOrders.id, invoice.salesOrderId),
							columns: { customerType: true },
						})
					)?.customerType ?? null)
				: null;

			const cpDb = getControlPanelDb(context);
			const [identity, branch, contact, orgRow] = await Promise.all([
				resolveDocumentIdentity(context),
				resolveBranchDisplay(context.tenantDb, receipt.branchId),
				resolveCustomerContact(context, receipt.customerId, customerType),
				context.organizationId
					? cpDb
							.select({ name: organizations.name })
							.from(organizations)
							.where(eq(organizations.id, context.organizationId))
							.limit(1)
					: Promise.resolve([]),
			]);

			return {
				receipt,
				invoiceStatus: invoice.status,
				identity: {
					...identity,
					orgName: orgRow[0]?.name ?? null,
				},
				branch,
				customer: {
					name: receipt.customerName,
					phone: contact.phone,
					email: contact.email,
				},
			};
		}),
};
