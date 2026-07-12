/**
 * Invoices router — folder module (400-LOC CI gate).
 *
 * Split from the former single-file routers/invoices.ts when getPrintView
 * pushed it past the cap. Procedure names and shapes are IDENTICAL to the
 * pre-split router; sub-files import builders from "../../index" (never
 * "../index" — the emitted d.ts collapses to `any` otherwise).
 */

import { invoicesDetailProcedures } from "./detail.procedures";
import { invoicesListProcedures } from "./list.procedures";
import { invoicesWriteProcedures } from "./write.procedures";

export const invoicesRouter = {
	...invoicesListProcedures,
	...invoicesDetailProcedures,
	...invoicesWriteProcedures,
};
