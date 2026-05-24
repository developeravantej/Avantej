/** appointments router — split by domain (Plan D-S7). */
import { appointmentsListProcedures } from "./list.procedures";
import { appointmentsCrudProcedures } from "./crud.procedures";
import { appointmentsRecurrenceProcedures } from "./recurrence.procedures";
import { appointmentsSeriesCancelProcedures } from "./series-cancel.procedures";

export const appointmentsRouter = {
	...appointmentsListProcedures,
	...appointmentsCrudProcedures,
	...appointmentsRecurrenceProcedures,
	...appointmentsSeriesCancelProcedures,
};
