import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import {
	listInstallmentPlans,
	getInstallmentPlanById,
	getInstallmentPlanByCode,
	createInstallmentPlan,
	updateInstallmentPlan,
	setDefaultInstallmentPlan,
	deactivateInstallmentPlan,
} from "@avantej-core/services/installment-plan.service";
import { requirePermission } from "@avantej-core/services";

export const installmentPlansRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				activeOnly: z.boolean().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			// Clients can read installment plans (needed during purchase); staff need service_management:read.
			if (context.member.role !== "client") {
				try {
					await requirePermission(
						context.tenantDb,
						context.member,
						"service_management",
						"read",
					);
				} catch (error) {
					throw new ORPCError("FORBIDDEN", {
						message:
							error instanceof Error ? error.message : "Permission denied",
					});
				}
			}

			return listInstallmentPlans(context.tenantDb, {
				activeOnly: input.activeOnly,
			});
		}),

	getById: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			// Clients can read installment plans (needed during purchase); staff need service_management:read.
			if (context.member.role !== "client") {
				try {
					await requirePermission(
						context.tenantDb,
						context.member,
						"service_management",
						"read",
					);
				} catch (error) {
					throw new ORPCError("FORBIDDEN", {
						message:
							error instanceof Error ? error.message : "Permission denied",
					});
				}
			}

			const plan = await getInstallmentPlanById(context.tenantDb, input.id);
			if (!plan) {
				throw new ORPCError("NOT_FOUND", {
					message: `Installment plan not found: ${input.id}`,
				});
			}
			return plan;
		}),

	getByCode: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				code: z.string().min(1),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			// Clients can read installment plans (needed during purchase); staff need service_management:read.
			if (context.member.role !== "client") {
				try {
					await requirePermission(
						context.tenantDb,
						context.member,
						"service_management",
						"read",
					);
				} catch (error) {
					throw new ORPCError("FORBIDDEN", {
						message:
							error instanceof Error ? error.message : "Permission denied",
					});
				}
			}

			return getInstallmentPlanByCode(context.tenantDb, input.code);
		}),

	create: protectedProcedure
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
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"service_management",
					"update",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error ? error.message : "Permission denied",
				});
			}

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
				throw error;
			}
		}),

	update: protectedProcedure
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
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"service_management",
					"update",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error ? error.message : "Permission denied",
				});
			}

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

	setDefault: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"service_management",
					"update",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error ? error.message : "Permission denied",
				});
			}

			return setDefaultInstallmentPlan(context.tenantDb, input.id);
		}),

	deactivate: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"service_management",
					"delete",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error ? error.message : "Permission denied",
				});
			}

			return deactivateInstallmentPlan(context.tenantDb, input.id);
		}),
};
