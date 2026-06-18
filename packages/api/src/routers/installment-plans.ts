import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import {
	listInstallmentPlans,
	getInstallmentPlanById,
	getInstallmentPlanByCode,
	createInstallmentPlan,
	updateInstallmentPlan,
	setDefaultInstallmentPlan,
	deactivateInstallmentPlan,
	reactivateInstallmentPlan,
} from "@avantej-core/services/installment-plan.service";
export const installmentPlansRouter = {
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				activeOnly: z.boolean().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			// Clients can read installment plans (needed during purchase); staff need service_management:read.
			if (context.member.role !== "client") {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"service_management",
					"read",
				);
			}

			return listInstallmentPlans(context.tenantDb, {
				activeOnly: input.activeOnly,
			});
		}),

	getById: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			// Clients can read installment plans (needed during purchase); staff need service_management:read.
			if (context.member.role !== "client") {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"service_management",
					"read",
				);
			}

			const plan = await getInstallmentPlanById(context.tenantDb, input.id);
			if (!plan) {
				throw new ORPCError("NOT_FOUND", {
					message: `Installment plan not found: ${input.id}`,
				});
			}
			return plan;
		}),

	getByCode: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				code: z.string().min(1),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			// Clients can read installment plans (needed during purchase); staff need service_management:read.
			if (context.member.role !== "client") {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"service_management",
					"read",
				);
			}

			return getInstallmentPlanByCode(context.tenantDb, input.code);
		}),

	create: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				code: z.string().min(1),
				name: z.string().min(1),
				numInstallments: z.number().int().min(1),
				defaultIntervalDays: z.number().int().min(1).optional(),
				description: z.string().optional(),
				isDefault: z.boolean().optional(),
				sortOrder: z.number().int().optional(),
				pricePremiumBps: z.number().int().min(0).max(10000).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"update",
			);

			try {
				return await createInstallmentPlan(context.tenantDb, {
					code: input.code,
					name: input.name,
					numInstallments: input.numInstallments,
					defaultIntervalDays: input.defaultIntervalDays,
					description: input.description,
					isDefault: input.isDefault,
					sortOrder: input.sortOrder,
					pricePremiumBps: input.pricePremiumBps,
				});
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes("pricePremiumBps must be between")
				) {
					throw new ORPCError("BAD_REQUEST", { message: error.message });
				}
				if (
					error instanceof Error &&
					error.message.includes("numInstallments must be >= 1")
				) {
					throw new ORPCError("BAD_REQUEST", { message: error.message });
				}
				if (
					error instanceof Error &&
					(error.message.includes("unique") ||
						error.message.includes("duplicate") ||
						error.message.includes("already exists"))
				) {
					throw new ORPCError("CONFLICT", {
						message: "A plan with this code already exists.",
					});
				}
				throw error;
			}
		}),

	update: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				numInstallments: z.number().int().min(1).optional(),
				defaultIntervalDays: z.number().int().min(1).optional(),
				description: z.string().optional(),
				sortOrder: z.number().int().optional(),
				pricePremiumBps: z.number().int().min(0).max(10000).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"update",
			);

			try {
				const result = await updateInstallmentPlan(context.tenantDb, input.id, {
					name: input.name,
					numInstallments: input.numInstallments,
					defaultIntervalDays: input.defaultIntervalDays,
					description: input.description,
					sortOrder: input.sortOrder,
					pricePremiumBps: input.pricePremiumBps,
				});

				if (!result) {
					throw new ORPCError("NOT_FOUND", {
						message: `Installment plan not found: ${input.id}`,
					});
				}
				return result;
			} catch (error) {
				if (error instanceof ORPCError) throw error;
				if (
					error instanceof Error &&
					error.message.includes("pricePremiumBps must be between")
				) {
					throw new ORPCError("BAD_REQUEST", { message: error.message });
				}
				if (
					error instanceof Error &&
					error.message.includes("numInstallments must be >= 1")
				) {
					throw new ORPCError("BAD_REQUEST", { message: error.message });
				}
				if (
					error instanceof Error &&
					error.message === "Installment plan not found"
				) {
					throw new ORPCError("NOT_FOUND", { message: error.message });
				}
				throw error;
			}
		}),

	setDefault: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"update",
			);

			return setDefaultInstallmentPlan(context.tenantDb, input.id);
		}),

	deactivate: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"delete",
			);

			return deactivateInstallmentPlan(context.tenantDb, input.id);
		}),

	reactivate: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"update",
			);

			return reactivateInstallmentPlan(context.tenantDb, input.id);
		}),
};
