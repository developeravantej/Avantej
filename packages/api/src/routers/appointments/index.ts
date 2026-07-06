/** appointments router — split by domain (Plan D-S7). */
import { appointmentsListProcedures } from "./list.procedures";
import { appointmentsDetailProcedures } from "./list-detail.procedures";
import { appointmentsCrudProcedures } from "./crud.procedures";
import { appointmentsCreditsProcedures } from "./crud-credits.procedures";
import { appointmentsRecurrenceProcedures } from "./recurrence.procedures";
import { appointmentsSeriesCancelProcedures } from "./series-cancel.procedures";
import { appointmentsScheduleProcedures } from "./schedule.procedures";
import { appointmentsBulkProcedures } from "./bulk.procedures";

export const appointmentsRouter = {
	...appointmentsListProcedures,
	...appointmentsDetailProcedures,
	...appointmentsCrudProcedures,
	...appointmentsCreditsProcedures,
	...appointmentsRecurrenceProcedures,
	...appointmentsSeriesCancelProcedures,
	...appointmentsScheduleProcedures,
	...appointmentsBulkProcedures,
};
