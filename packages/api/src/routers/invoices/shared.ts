import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import {
	guardStoredBranchForContext,
	resolveAccessibleNodeIds,
} from "../../guards";

export const invoiceStatusEnum = z.enum([
	"draft",
	"sent",
	"paid",
	"partially_paid",
	"overdue",
	"cancelled",
]);

/**
 * Enforce salesOrder branch scope for a by-id invoice read, mirroring how
 * `listInvoices` scopes its result set (`invoice.service.ts`):
 *
 * - listInvoices innerJoins salesOrders and filters
 *   `inArray(salesOrders.branchId, accessibleNodeIds)` ONLY when the caller has a
 *   non-empty scope. That JOIN hides from scoped staff both (a) invoices with no
 *   sales order and (b) invoices whose sales order's branch is outside scope.
 * - Admins / unscoped callers (empty accessibleNodeIds) bypass the JOIN entirely
 *   and see every invoice, orphans included.
 *
 * This helper reproduces that exactly: a scoped caller (non-empty scope) gets
 * NOT_FOUND for the orphan/null-branch class (no sales order, missing sales
 * order, or null branchId) so the row is hidden with no enumeration; a branch
 * that exists but is out of scope is rejected by `guardStoredBranchForContext`
 * (FORBIDDEN). Unscoped callers fall through and are allowed.
 */
export async function guardInvoiceSalesOrderBranch(
	context: Parameters<typeof guardStoredBranchForContext>[0],
	salesOrderId: string | null | undefined,
	notFoundId: string,
): Promise<void> {
	const order = salesOrderId
		? await context.tenantDb.query.salesOrders.findFirst({
				where: eq(salesOrders.id, salesOrderId),
				columns: { branchId: true },
			})
		: undefined;
	const branchId = order?.branchId ?? null;

	if (!branchId) {
		// Orphan / null-branch: hidden from scoped staff, allowed for unscoped admins.
		const accessibleNodeIds = await resolveAccessibleNodeIds(context);
		if (accessibleNodeIds.length > 0) {
			throw new ORPCError("NOT_FOUND", {
				message: `Not found: ${notFoundId}`,
			});
		}
		return;
	}
	await guardStoredBranchForContext(context, branchId);
}
