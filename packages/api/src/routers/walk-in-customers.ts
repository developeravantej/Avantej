import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import {
	listWalkInCustomers,
	getWalkInCustomerById,
	createWalkInCustomer,
	updateWalkInCustomer,
	deactivateWalkInCustomer,
} from "@avantej-core/services/walk-in-customers.service";
import { requirePermission } from "@avantej-core/services";

const list = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			branchId: z.string().uuid().optional(),
			search: z.string().optional(),
			isActive: z.boolean().optional(),
			limit: z.number().int().min(1).max(100).optional(),
			offset: z.number().int().min(0).optional(),
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
				"walk_in_customer_management",
				"read",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return listWalkInCustomers(context.tenantDb, {
			branchId: input.branchId,
			search: input.search,
			isActive: input.isActive,
			accessibleNodeIds: context.accessibleNodeIds,
			limit: input.limit,
			offset: input.offset,
		});
	});

const getById = protectedProcedure
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
				"walk_in_customer_management",
				"read",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		const customer = await getWalkInCustomerById(context.tenantDb, input.id);
		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: `Walk-in customer not found: ${input.id}`,
			});
		}
		return customer;
	});

const create = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			name: z.string().min(1),
			email: z.string().email().optional(),
			phone: z.string().optional(),
			branchId: z.string().uuid().optional(),
			dateOfBirth: z.string().datetime().optional(),
			gender: z
				.enum(["male", "female", "other", "prefer_not_to_say"])
				.optional(),
			address: z.string().optional(),
			emergencyContactName: z.string().optional(),
			emergencyContactPhone: z.string().optional(),
			medicalNotes: z.string().optional(),
			notes: z.string().optional(),
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
				"walk_in_customer_management",
				"create",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return createWalkInCustomer(context.tenantDb, {
			name: input.name,
			email: input.email,
			phone: input.phone,
			branchId: input.branchId,
			dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
			gender: input.gender,
			address: input.address,
			emergencyContactName: input.emergencyContactName,
			emergencyContactPhone: input.emergencyContactPhone,
			medicalNotes: input.medicalNotes,
			notes: input.notes,
			createdBy: context.member.userId,
		});
	});

const update = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
			name: z.string().optional(),
			email: z.string().optional(),
			phone: z.string().optional(),
			branchId: z.string().uuid().optional(),
			dateOfBirth: z.string().optional(),
			gender: z.string().optional(),
			address: z.string().optional(),
			emergencyContactName: z.string().optional(),
			emergencyContactPhone: z.string().optional(),
			medicalNotes: z.string().optional(),
			notes: z.string().optional(),
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
				"walk_in_customer_management",
				"update",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		const customer = await updateWalkInCustomer(context.tenantDb, input.id, {
			name: input.name,
			email: input.email,
			phone: input.phone,
			branchId: input.branchId,
			dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
			gender: input.gender,
			address: input.address,
			emergencyContactName: input.emergencyContactName,
			emergencyContactPhone: input.emergencyContactPhone,
			medicalNotes: input.medicalNotes,
			notes: input.notes,
		});

		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: `Walk-in customer not found: ${input.id}`,
			});
		}
		return customer;
	});

const deactivate = protectedProcedure
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
				"walk_in_customer_management",
				"delete",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return deactivateWalkInCustomer(context.tenantDb, input.id);
	});

export const walkInCustomersRouter = {
	list,
	getById,
	create,
	update,
	deactivate,
};
