import {
	createService,
	duplicateService,
	getServiceById,
	listServices,
	updateService,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	guardInputBranchForContext,
	requirePermissionOrpc,
	resolveAccessibleNodeIds,
} from "../../guards";
import { validateInstallmentPlanCodes } from "./installment-plan-validation";
import {
	durationUnitSchema,
	priceUnitSchema,
	serviceTypeSchema,
	timePresetConfigSchema,
} from "./schemas";

export const serviceCrudProcedures = {
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				categoryId: z.string().uuid().nullable().optional(),
				branchId: z.string().uuid().nullable().optional(),
				isActive: z.boolean().optional(),
				type: serviceTypeSchema.optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (context.member.role !== "client") {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"service_management",
					"read",
				);
			}

			const accessibleNodeIds = await resolveAccessibleNodeIds(context);

			return listServices(context.tenantDb, {
				categoryId: input.categoryId ?? undefined,
				branchId: input.branchId ?? undefined,
				isActive: input.isActive,
				type: input.type,
				accessibleNodeIds,
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
			if (context.member.role !== "client") {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"service_management",
					"read",
				);
			}

			const service = await getServiceById(context.tenantDb, input.id);
			if (!service) {
				throw new ORPCError("NOT_FOUND", {
					message: "Service not found",
				});
			}

			// guardInputBranchForContext forbids a null branchId because, on a
			// write, null is an attempt to bypass branch scoping. Here branchId is
			// the stored value of an existing record — null simply means an
			// org-wide service, which is viewable by any member holding
			// service_management:read (already enforced above). Only enforce branch
			// accessibility when the service is pinned to a specific branch.
			if (service.branchId) {
				await guardInputBranchForContext(context, service.branchId);
			}

			return service;
		}),

	create: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1),
				categoryId: z.string().uuid().nullable().optional(),
				duration: z.number().int().min(1),
				durationUnitType: durationUnitSchema.optional(),
				maxAttendees: z.number().int().min(0),
				attendanceThreshold: z.number().int().min(0).nullable().optional(),
				branchId: z.string().uuid().nullable().optional(),
				isActive: z.boolean().optional(),
				title: z.string().nullable().optional(),
				description: z.string().nullable().optional(),
				imageUrl: z.string().nullable().optional(),
				type: serviceTypeSchema.optional(),
				price: z.number().int().min(0).nullable().optional(),
				priceUnit: priceUnitSchema.optional(),
				taxable: z.boolean().optional(),
				taxPercentage: z.number().int().min(0).max(100).optional(),
				isRecommended: z.boolean().optional(),
				location: z.string().nullable().optional(),
				features: z.array(z.string()).nullable().optional(),
				sessionCount: z.number().int().min(1).nullable().optional(),
				expirable: z.boolean().optional(),
				expiryDays: z.number().int().min(1).nullable().optional(),
				expiryDate: z.string().datetime().nullable().optional(),
				availablePaymentPlans: z.array(z.string()).optional(),
				installmentIntervalDays: z.number().int().min(1).optional(),
				gracePeriodDays: z.number().int().min(0).max(90).nullish(),
				defaultCommissionBps: z.number().int().min(0).max(100_000).optional(),
				timePresetConfig: timePresetConfigSchema.optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"create",
			);

			await guardInputBranchForContext(context, input.branchId);

			if (input.availablePaymentPlans?.length) {
				await validateInstallmentPlanCodes(
					context,
					input.availablePaymentPlans,
				);
			}

			try {
				return await createService(context.tenantDb, {
					name: input.name,
					categoryId: input.categoryId ?? null,
					duration: input.duration,
					durationUnitType: input.durationUnitType,
					maxAttendees: input.maxAttendees,
					attendanceThreshold: input.attendanceThreshold ?? null,
					branchId: input.branchId ?? null,
					isActive: input.isActive,
					title: input.title ?? null,
					description: input.description ?? null,
					imageUrl: input.imageUrl ?? null,
					type: input.type,
					price: input.price ?? null,
					priceUnit: input.priceUnit,
					taxable: input.taxable,
					taxPercentage: input.taxPercentage,
					isRecommended: input.isRecommended,
					location: input.location ?? null,
					features: input.features ?? null,
					sessionCount: input.sessionCount ?? null,
					expirable: input.expirable,
					expiryDays: input.expiryDays ?? null,
					expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
					...(input.availablePaymentPlans !== undefined
						? { availablePaymentPlans: input.availablePaymentPlans }
						: {}),
					...(input.installmentIntervalDays !== undefined
						? { installmentIntervalDays: input.installmentIntervalDays }
						: {}),
					...(input.gracePeriodDays !== undefined
						? { gracePeriodDays: input.gracePeriodDays ?? null }
						: {}),
					...(input.defaultCommissionBps !== undefined
						? { defaultCommissionBps: input.defaultCommissionBps }
						: {}),
					...(input.timePresetConfig !== undefined
						? { timePresetConfig: input.timePresetConfig }
						: {}),
					createdBy: context.session?.user?.id ?? null,
				} as Parameters<typeof createService>[1]);
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error ? error.message : "Failed to create service",
				});
			}
		}),

	update: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				categoryId: z.string().uuid().nullable().optional(),
				duration: z.number().int().min(1).optional(),
				durationUnitType: durationUnitSchema.optional(),
				maxAttendees: z.number().int().min(0).optional(),
				attendanceThreshold: z.number().int().min(0).nullable().optional(),
				branchId: z.string().uuid().nullable().optional(),
				isActive: z.boolean().optional(),
				title: z.string().nullable().optional(),
				description: z.string().nullable().optional(),
				imageUrl: z.string().nullable().optional(),
				type: serviceTypeSchema.optional(),
				price: z.number().int().min(0).nullable().optional(),
				priceUnit: priceUnitSchema.optional(),
				taxable: z.boolean().optional(),
				taxPercentage: z.number().int().min(0).max(100).optional(),
				isRecommended: z.boolean().optional(),
				location: z.string().nullable().optional(),
				features: z.array(z.string()).nullable().optional(),
				sessionCount: z.number().int().min(1).nullable().optional(),
				expirable: z.boolean().optional(),
				expiryDays: z.number().int().min(1).nullable().optional(),
				expiryDate: z.string().datetime().nullable().optional(),
				availablePaymentPlans: z.array(z.string()).optional(),
				installmentIntervalDays: z.number().int().min(1).optional(),
				gracePeriodDays: z.number().int().min(0).max(90).nullish(),
				defaultCommissionBps: z.number().int().min(0).max(100_000).optional(),
				timePresetConfig: timePresetConfigSchema.optional(),
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

			const existing = await getServiceById(context.tenantDb, input.id);
			if (!existing) {
				throw new ORPCError("NOT_FOUND", {
					message: "Service not found",
				});
			}

			await guardInputBranchForContext(context, existing.branchId);
			await guardInputBranchForContext(context, input.branchId);

			if (input.availablePaymentPlans?.length) {
				await validateInstallmentPlanCodes(
					context,
					input.availablePaymentPlans,
				);
			}

			try {
				return await updateService(context.tenantDb, input.id, {
					name: input.name,
					categoryId: input.categoryId,
					duration: input.duration,
					durationUnitType: input.durationUnitType,
					maxAttendees: input.maxAttendees,
					attendanceThreshold: input.attendanceThreshold,
					branchId: input.branchId,
					isActive: input.isActive,
					title: input.title,
					description: input.description,
					imageUrl: input.imageUrl,
					type: input.type,
					price: input.price,
					priceUnit: input.priceUnit,
					taxable: input.taxable,
					taxPercentage: input.taxPercentage,
					isRecommended: input.isRecommended,
					location: input.location,
					features: input.features,
					sessionCount: input.sessionCount,
					expirable: input.expirable,
					expiryDays: input.expiryDays,
					expiryDate:
						input.expiryDate !== undefined
							? input.expiryDate === null
								? null
								: new Date(input.expiryDate)
							: undefined,
					...(input.availablePaymentPlans !== undefined
						? { availablePaymentPlans: input.availablePaymentPlans }
						: {}),
					...(input.installmentIntervalDays !== undefined
						? { installmentIntervalDays: input.installmentIntervalDays }
						: {}),
					...(input.gracePeriodDays !== undefined
						? { gracePeriodDays: input.gracePeriodDays ?? null }
						: {}),
					...(input.defaultCommissionBps !== undefined
						? { defaultCommissionBps: input.defaultCommissionBps }
						: {}),
					...(input.timePresetConfig !== undefined
						? { timePresetConfig: input.timePresetConfig }
						: {}),
					updatedBy: context.session?.user?.id ?? null,
				} as Parameters<typeof updateService>[2]);
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error ? error.message : "Failed to update service",
				});
			}
		}),

	duplicate: tenantProcedure
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
				"create",
			);

			try {
				return await duplicateService(context.tenantDb, input.id, {
					createdBy: context.session?.user?.id ?? null,
				});
			} catch (error) {
				if (error instanceof Error && error.message === "Service not found") {
					throw new ORPCError("NOT_FOUND", { message: "Service not found" });
				}
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to duplicate service",
				});
			}
		}),
};
