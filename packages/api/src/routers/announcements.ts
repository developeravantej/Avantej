import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import {
	listAnnouncements,
	listActiveAnnouncements,
	createAnnouncement,
	updateAnnouncement,
	deleteAnnouncement,
} from "@avantej-core/services/announcements.service";

const list = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			branchId: z.string().uuid().optional(),
			isActive: z.boolean().optional(),
			limit: z.number().int().min(1).max(100).optional(),
			offset: z.number().int().min(0).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "announcement_management", "read")

		return listAnnouncements(context.tenantDb, {
			branchId: input.branchId,
			isActive: input.isActive,
			accessibleNodeIds: context.accessibleNodeIds,
			isAdmin: context.member.role === "admin",
			limit: input.limit,
			offset: input.offset,
		});
	});

const listActive = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
		}),
	)
	.handler(async ({ context }) => {
		

		

		await requirePermissionOrpc(context.tenantDb, context.member, "announcement_management", "read")

		return listActiveAnnouncements(context.tenantDb, {
			accessibleNodeIds: context.accessibleNodeIds ?? [],
			isAdmin: context.member.role === "admin",
		});
	});

const create = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			title: z.string().min(1),
			message: z.string().min(1),
			branchId: z.string().uuid().optional(),
			priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
			targetAudience: z.enum(["all", "staff", "clients"]).optional(),
			startDate: z.string().datetime().optional(),
			endDate: z.string().datetime().optional(),
			isPinned: z.boolean().optional(),
			requiresAcknowledgement: z.boolean().optional(),
			scopedBranchIds: z.array(z.string().uuid()).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "announcement_management", "create")

		return createAnnouncement(context.tenantDb, {
			branchId: input.branchId,
			title: input.title,
			message: input.message,
			priority: input.priority,
			targetAudience: input.targetAudience,
			startDate: input.startDate ? new Date(input.startDate) : undefined,
			endDate: input.endDate ? new Date(input.endDate) : undefined,
			isPinned: input.isPinned,
			requiresAcknowledgement: input.requiresAcknowledgement,
			createdBy: context.member.userId,
			scopedBranchIds: input.scopedBranchIds,
		});
	});

const update = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
			title: z.string().optional(),
			message: z.string().optional(),
			priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
			targetAudience: z.enum(["all", "staff", "clients"]).optional(),
			isActive: z.boolean().optional(),
			isPinned: z.boolean().optional(),
			requiresAcknowledgement: z.boolean().optional(),
			startDate: z.string().datetime().optional(),
			endDate: z.string().datetime().optional(),
			scopedBranchIds: z.array(z.string().uuid()).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "announcement_management", "update")

		try {
			return await updateAnnouncement(context.tenantDb, input.id, {
				title: input.title,
				message: input.message,
				priority: input.priority,
				targetAudience: input.targetAudience,
				isActive: input.isActive,
				isPinned: input.isPinned,
				requiresAcknowledgement: input.requiresAcknowledgement,
				startDate: input.startDate ? new Date(input.startDate) : undefined,
				endDate: input.endDate ? new Date(input.endDate) : undefined,
				scopedBranchIds: input.scopedBranchIds,
			});
		} catch {
			throw new ORPCError("NOT_FOUND", {
				message: `Announcement not found: ${input.id}`,
			});
		}
	});

const deleteHandler = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "announcement_management", "delete")

		return deleteAnnouncement(context.tenantDb, input.id);
	});

export const announcementsRouter = {
	list,
	listActive,
	create,
	update,
	delete: deleteHandler,
};
