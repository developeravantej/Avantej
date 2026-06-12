import { availabilityProcedures } from "./availability.procedures";
import { exceptionsProcedures } from "./exceptions.procedures";
import { queryProcedures } from "./query.procedures";

// Explicit key composition (not object spread): the spread form caused
// rolldown-plugin-dts to collapse every procedure's type to `any` in the
// emitted .d.ts, which broke type inference for web consumers
// (orpc.trainerAvailability.*). Naming each procedure keeps the types intact.
export const trainerAvailabilityRouter = {
	coverageForPreferredTimes: queryProcedures.coverageForPreferredTimes,
	list: queryProcedures.list,
	listByBranch: queryProcedures.listByBranch,
	getComputedSlots: queryProcedures.getComputedSlots,
	getUtilisation: queryProcedures.getUtilisation,
	upsert: availabilityProcedures.upsert,
	delete: availabilityProcedures.delete,
	create: availabilityProcedures.create,
	update: availabilityProcedures.update,
	getConflicts: exceptionsProcedures.getConflicts,
	addException: exceptionsProcedures.addException,
	listExceptions: exceptionsProcedures.listExceptions,
	deleteException: exceptionsProcedures.deleteException,
};
