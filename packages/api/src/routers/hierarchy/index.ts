/** hierarchy router — split by domain (Plan D-S7). */
import { hierarchyReadProcedures } from "./read.procedures";
import { hierarchyCreateProcedures } from "./create.procedures";
import { hierarchyUpdateProcedures } from "./update.procedures";
import { hierarchyDeleteProcedures } from "./delete.procedures";
import { hierarchyMoveProcedures } from "./move.procedures";
import { hierarchyMembersProcedures } from "./members.procedures";

export const hierarchyRouter = {
	...hierarchyReadProcedures,
	...hierarchyCreateProcedures,
	...hierarchyUpdateProcedures,
	...hierarchyDeleteProcedures,
	...hierarchyMoveProcedures,
	...hierarchyMembersProcedures,
};
