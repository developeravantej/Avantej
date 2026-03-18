import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import {
	listCommissionSplits,
	getCommissionsByAppointment,
	getMyCommissions,
} from "@avantej-core/services/commission-splits.service";
import { requirePermission } from "@avantej-core/services";

const list = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			memberId: z.string().uuid().optional(),
			appointmentId: z.string().uuid().optional(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
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
				"commission_management",
				"read",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

		return listCommissionSplits(context.tenantDb, {
			memberId: input.memberId,
			appointmentId: input.appointmentId,
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
		});
	});

const getByAppointment = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			appointmentId: z.string().uuid(),
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
				"commission_management",
				"read",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

		return getCommissionsByAppointment(context.tenantDb, input.appointmentId);
	});

const myCommissions = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
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
				"commission_management",
				"read",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

		return getMyCommissions(context.tenantDb, context.member.id, {
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
		});
	});

export const commissionSplitsRouter = {
	list,
	getByAppointment,
	getMyCommissions: myCommissions,
};
