import {
	computeAvailableSlots,
	coverageForPreferredTimes,
	getTrainerUtilisation,
	listTrainerAvailability,
	listTrainerAvailabilityByBranch,
} from "@avantej-core/services";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { assertOrgContextMatch, guardBranchAccessible } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";

export const queryProcedures = {
	/**
	 * How many of a package instance's preferred times the given trainer can cover
	 * (weekly-template match against the trainer's recurring `available` windows).
	 * Read-only; tiny result (≤ 4 preferred times). Used by the approvals assign
	 * popover to show a coverage chip per trainer.
	 */
	coverageForPreferredTimes: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			return coverageForPreferredTimes(
				context.tenantDb,
				input.trainerId,
				input.packageInstanceId,
			);
		}),

	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			return listTrainerAvailability(context.tenantDb, input.trainerId);
		}),

	listByBranch: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (input.branchId) {
				guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			}
			const controlPanelDb = getControlPanelDb(context);
			return listTrainerAvailabilityByBranch(controlPanelDb, context.tenantDb, {
				branchId: input.branchId,
			});
		}),

	getComputedSlots: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				trainerId: z.string().uuid(),
				startDate: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
				endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			const startDate = new Date(`${input.startDate}T00:00:00`);
			const endDate = new Date(`${input.endDate}T23:59:59`);
			return computeAvailableSlots(
				context.tenantDb,
				input.trainerId,
				startDate,
				endDate,
			);
		}),

	getUtilisation: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
				weekStart: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (input.branchId) {
				guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			}
			return getTrainerUtilisation(context.tenantDb, {
				branchId: input.branchId,
				weekStart: input.weekStart,
			});
		}),
};
