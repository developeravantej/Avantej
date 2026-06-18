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

import { posSaleProcedures } from "./sale.procedures";
import { posQueryProcedures } from "./query.procedures";

export const posRouter = {
	recordSale: posSaleProcedures.recordSale,
	searchCustomers: posQueryProcedures.searchCustomers,
	getReceiptData: posQueryProcedures.getReceiptData,
};
