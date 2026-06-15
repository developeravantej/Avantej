/**
 * Installments Router
 *
 * API endpoints for the installment-based credit unlocking system.
 * Split folder module (router-file LOC budget):
 *   - query.procedures.ts  — schedule reads, admin overview, events, refund suggestion
 *   - mutate.procedures.ts — payment confirmation, unlock, refunds, credit adjustments
 */

import { installmentQueryProcedures } from "./query.procedures";
import { installmentMutateProcedures } from "./mutate.procedures";

export const installmentsRouter = {
	adjustCredits: installmentMutateProcedures.adjustCredits,
	confirmPayment: installmentMutateProcedures.confirmPayment,
	listByPackageInstance: installmentQueryProcedures.listByPackageInstance,
	manualUnlock: installmentMutateProcedures.manualUnlock,
	processRefund: installmentMutateProcedures.processRefund,
	reschedule: installmentMutateProcedures.reschedule,
	waive: installmentMutateProcedures.waive,
	resetOverride: installmentMutateProcedures.resetOverride,
	adminOverview: installmentQueryProcedures.adminOverview,
	listUpcoming: installmentQueryProcedures.listUpcoming,
	getEvents: installmentQueryProcedures.getEvents,
	suggestRefund: installmentQueryProcedures.suggestRefund,
	setOverdraft: installmentMutateProcedures.setOverdraft,
};
