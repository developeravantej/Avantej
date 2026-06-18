import { emailProcedures } from "./email.procedures";
import { acceptanceProcedures } from "./acceptance.procedures";

export const serverInvitationRouter = {
	...emailProcedures,
	...acceptanceProcedures,
};
