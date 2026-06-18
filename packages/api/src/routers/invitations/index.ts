/** invitations router — split by domain (Plan D-S7). */
import { invitationsCreateProcedures } from "./create.procedures";
import { invitationsPublicProcedures } from "./public.procedures";
import { invitationsManageProcedures } from "./manage.procedures";

export const invitationRouter = {
	...invitationsCreateProcedures,
	...invitationsPublicProcedures,
	...invitationsManageProcedures,
};
