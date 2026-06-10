import { availabilityProcedures } from "./availability.procedures";
import { exceptionsProcedures } from "./exceptions.procedures";
import { queryProcedures } from "./query.procedures";

export const trainerAvailabilityRouter = {
	...queryProcedures,
	...availabilityProcedures,
	...exceptionsProcedures,
};
