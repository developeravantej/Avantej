import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../../guards";
import {
	listClassSlots,
	getClassSlotById,
	getBookingCounts,
	listClassSlotSignups,
} from "@avantej-core/services/class-slots.service";
import { user } from "@avantej-core/db/schema/auth";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";

const list = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			serviceId: z.string().uuid().optional(),
			branchId: z.string().uuid().optional(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
			isAvailable: z.boolean().optional(),
			limit: z.number().int().optional(),
			offset: z.number().int().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		if (input.branchId) {
			guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
		}
		// Clients can browse class slots in their tenant without the staff
		// permission. Staff still need class_slot_management:read.
		if (context.member.role !== "client") {
			await requirePermissionOrpc(context.tenantDb, context.member, "class_slot_management", "read")
		}

		return listClassSlots(context.tenantDb, {
			serviceId: input.serviceId,
			branchId: input.branchId,
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
			isAvailable: input.isAvailable,
			accessibleNodeIds: context.accessibleNodeIds,
			limit: input.limit,
			offset: input.offset,
		});
	});

const getById = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		// Clients can read class slots; staff need class_slot_management:read.
		if (context.member.role !== "client") {
			await requirePermissionOrpc(context.tenantDb, context.member, "class_slot_management", "read")
		}

		const slot = await getClassSlotById(context.tenantDb, input.id);
		if (!slot) {
			throw new ORPCError("NOT_FOUND", {
				message: `Class slot not found: ${input.id}`,
			});
		}
		return slot;
	});

const bookingCounts = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			branchId: z.string().uuid().optional(),
			from: z.string().datetime(),
			to: z.string().datetime(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		if (input.branchId) {
			guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
		}
		await requirePermissionOrpc(context.tenantDb, context.member, "class_slot_management", "read")

		return getBookingCounts(context.tenantDb, {
			branchId: input.branchId,
			from: new Date(input.from),
			to: new Date(input.to),
			accessibleNodeIds: context.accessibleNodeIds,
		});
	});

const getSignups = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "class_slot_management", "read")

		const slot = await getClassSlotById(context.tenantDb, input.id);
		if (!slot) {
			throw new ORPCError("NOT_FOUND", {
				message: `Class slot not found: ${input.id}`,
			});
		}

		if (context.accessibleNodeIds && !context.accessibleNodeIds.includes(slot.branchId)) {
			throw new ORPCError("FORBIDDEN", {
				message: "You do not have access to this class slot",
			});
		}

		const rawSignups = await listClassSlotSignups(context.tenantDb, input.id);

		const memberClientIds = rawSignups
			.filter((s) => s.clientType !== "walk_in" && s.clientId != null)
			.map((s) => s.clientId as string);

		const userMap = new Map<string, { name: string; email: string }>();

		if (memberClientIds.length > 0) {
			const controlPanelDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;
			if (controlPanelDb) {
				const userRows = await controlPanelDb
					.select({ id: user.id, name: user.name, email: user.email })
					.from(user)
					.where(inArray(user.id, memberClientIds));
				for (const u of userRows) {
					userMap.set(u.id, { name: u.name, email: u.email });
				}
			}
		}

		return rawSignups.map((s) => {
			if (s.clientType === "walk_in" || s.clientId == null) {
				return {
					appointmentId: s.appointmentId,
					clientType: s.clientType as string,
					name: s.walkInName ?? "Walk-in Customer",
					email: s.walkInEmail ?? null,
					phone: s.walkInPhone ?? null,
					attended: s.attended,
					pricePaid: s.pricePaid,
					appointmentStatus: s.appointmentStatus,
				};
			}
			const details = userMap.get(s.clientId);
			return {
				appointmentId: s.appointmentId,
				clientType: s.clientType as string,
				name: details?.name ?? s.clientId,
				email: details?.email ?? null,
				phone: null as string | null,
				attended: s.attended,
				pricePaid: s.pricePaid,
				appointmentStatus: s.appointmentStatus,
			};
		});
	});

export const classSlotsReadProcedures = {
	list,
	getById,
	bookingCounts,
	getSignups,
};
