import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { and, eq, inArray, ne } from "drizzle-orm";
import { tenantProcedure } from "../../index";
import {requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../../guards";
import {
	listClassSlots,
	getClassSlotById,
	createClassSlot,
	updateClassSlot,
	cancelClassSlot,
	getBookingCounts,
	listClassSlotSignups,
} from "@avantej-core/services/class-slots.service";
import { requirePermission } from "@avantej-core/services";
import { user } from "@avantej-core/db/schema/auth";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { appointmentClients } from "@avantej-core/db/schema/tenant/appointment-clients";
import { classSlots } from "@avantej-core/db/schema/tenant/class-slots";
import { services } from "@avantej-core/db/schema/tenant/services";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

const create = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			serviceId: z.string().uuid(),
			branchId: z.string().uuid(),
			date: z.string().datetime(),
			startTime: z.string(),
			endTime: z.string(),
			capacity: z.number().int().positive(),
			instructorId: z.string().uuid().optional(),
			location: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
		await requirePermissionOrpc(context.tenantDb, context.member, "class_slot_management", "create")

		return createClassSlot(context.tenantDb, {
			serviceId: input.serviceId,
			branchId: input.branchId,
			date: new Date(input.date),
			startTime: input.startTime,
			endTime: input.endTime,
			capacity: input.capacity,
			instructorId: input.instructorId,
			location: input.location,
		});
	});

const update = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
			date: z.string().datetime().optional(),
			startTime: z.string().optional(),
			endTime: z.string().optional(),
			capacity: z.number().int().positive().optional(),
			instructorId: z.string().uuid().optional(),
			location: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "class_slot_management", "update")

		return updateClassSlot(context.tenantDb, input.id, {
			date: input.date ? new Date(input.date) : undefined,
			startTime: input.startTime,
			endTime: input.endTime,
			capacity: input.capacity,
			instructorId: input.instructorId,
			location: input.location,
		});
	});

const cancel = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
			cancellationReason: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "class_slot_management", "update")

		return cancelClassSlot(context.tenantDb, input.id, input.cancellationReason);
	});

export const classSlotsCrudProcedures = {
	create,
	update,
	cancel,
};
