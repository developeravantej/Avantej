import { branchProcedures } from "./branch.procedures";
import { onboardingHandoffProcedures } from "./onboarding-handoff.procedures";
import { orgSharedProcedures } from "./org-shared.procedures";
import { pendingProcedures } from "./pending.procedures";

export const ghlRouter = {
	...branchProcedures,
	...orgSharedProcedures,
	...pendingProcedures,
	...onboardingHandoffProcedures,
};
