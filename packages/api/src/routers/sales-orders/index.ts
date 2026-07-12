/**
 * Sales Orders Router
 *
 * Split folder module (router-file LOC budget):
 *   - query.procedures.ts  — list, getById, statusHistory, KPI summary, largest-today, latest
 *   - mutate.procedures.ts — create, update, cancel
 *   - export.procedures.ts — exportCsv (filtered CSV download)
 */

import { salesOrderQueryProcedures } from "./query.procedures";
import { salesOrderMutateProcedures } from "./mutate.procedures";
import { salesOrderExportProcedures } from "./export.procedures";

export const salesOrdersRouter = {
	list: salesOrderQueryProcedures.list,
	getById: salesOrderQueryProcedures.getById,
	create: salesOrderMutateProcedures.create,
	update: salesOrderMutateProcedures.update,
	cancel: salesOrderMutateProcedures.cancel,
	statusHistory: salesOrderQueryProcedures.statusHistory,
	kpiSummary: salesOrderQueryProcedures.kpiSummary,
	largestToday: salesOrderQueryProcedures.largestToday,
	getLatest: salesOrderQueryProcedures.getLatest,
	exportCsv: salesOrderExportProcedures.exportCsv,
};
