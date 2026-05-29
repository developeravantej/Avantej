/** service-members router — split by domain (Plan D-S7). */
import { serviceMembersBufferProcedures } from "./buffer.procedures";
import { serviceMembersAssignmentProcedures } from "./assignment.procedures";

export const serviceMembersRouter = {
	...serviceMembersBufferProcedures,
	...serviceMembersAssignmentProcedures,
};
