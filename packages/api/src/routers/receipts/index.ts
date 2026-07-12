/**
 * Receipts router — folder module from the start (400-LOC CI gate).
 * One receipt per invoice with a stable RCP-YYYYMMDD-NNNNNN number;
 * see packages/services/src/receipt.service.ts for the issue/refresh rules.
 */

import { receiptsPrintProcedures } from "./print.procedures";

export const receiptsRouter = {
	...receiptsPrintProcedures,
};
