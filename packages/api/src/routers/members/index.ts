/** members router — split by domain (Plan D-S7). */
import { membersListProcedures } from "./list.procedures";
import { membersReadProcedures } from "./read.procedures";
import { membersCreateProcedures } from "./create.procedures";
import { membersRoleProcedures } from "./role.procedures";
import { membersScopeProcedures } from "./scope.procedures";
import { membersStatusProcedures } from "./status.procedures";
import { membersArchiveProcedures } from "./archive.procedures";
import { membersRemovalProcedures } from "./removal.procedures";
import { membersSyncProcedures } from "./sync.procedures";

export const memberRouter = {
	...membersListProcedures,
	...membersReadProcedures,
	...membersCreateProcedures,
	...membersRoleProcedures,
	...membersScopeProcedures,
	...membersStatusProcedures,
	...membersArchiveProcedures,
	...membersRemovalProcedures,
	...membersSyncProcedures,
};
