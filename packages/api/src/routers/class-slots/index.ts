/** class-slots router — split by domain (Plan D-S7). */
import { classSlotsReadProcedures } from "./read.procedures";
import { classSlotsCrudProcedures } from "./crud.procedures";
import { classSlotsEnrollmentProcedures } from "./enrollment.procedures";

export const classSlotsRouter = {
	...classSlotsReadProcedures,
	...classSlotsCrudProcedures,
	...classSlotsEnrollmentProcedures,
};
