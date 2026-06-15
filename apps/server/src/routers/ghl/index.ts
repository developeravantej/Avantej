import { branchProcedures } from "./branch.procedures";
import { orgSharedProcedures } from "./org-shared.procedures";

export const ghlRouter = {
	...branchProcedures,
	...orgSharedProcedures,
};
