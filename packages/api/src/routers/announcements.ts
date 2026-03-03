import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import {
	listAnnouncements,
	listActiveAnnouncements,
	createAnnouncement,
	updateAnnouncement,
	deleteAnnouncement,
} from "@avantej-core/services/announcements.service";
import { requirePermission } from "@avantej-core/services";

const list = protectedProcedure
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
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available. Ensure organization context is set.",
			});
		}

		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}

		try {
			await requirePermission(context.tenantDb, context.member, "announcement_management", "read");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return listAnnouncements(context.tenantDb, {
			branchId: input.branchId,
			isActive: input.isActive,
			accessibleNodeIds: context.accessibleNodeIds,
			limit: input.limit,
			offset: input.offset,
		});
	});

const listActive = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
		}),
	)
	.handler(async ({ context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available. Ensure organization context is set.",
			});
		}

		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}

		try {
			await requirePermission(context.tenantDb, context.member, "announcement_management", "read");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return listActiveAnnouncements(context.tenantDb, {
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

const create = protectedProcedure
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
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available. Ensure organization context is set.",
			});
		}

		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}

		try {
			await requirePermission(context.tenantDb, context.member, "announcement_management", "create");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return createAnnouncement(context.tenantDb, {
			branchId: input.branchId,
			title: input.title,
			message: input.message,
			priority: input.priority,
			targetAudience: input.targetAudience,
			startDate: input.startDate ? new Date(input.startDate) : undefined,
			endDate: input.endDate ? new Date(input.endDate) : undefined,
			isPinned: input.isPinned,
			createdBy: context.member.userId,
		});
	});

const update = protectedProcedure
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
			startDate: z.string().datetime().optional(),
			endDate: z.string().datetime().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available. Ensure organization context is set.",
			});
		}

		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}

		try {
			await requirePermission(context.tenantDb, context.member, "announcement_management", "update");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		try {
			return await updateAnnouncement(context.tenantDb, input.id, {
				title: input.title,
				message: input.message,
				priority: input.priority,
				targetAudience: input.targetAudience,
				isActive: input.isActive,
				isPinned: input.isPinned,
				startDate: input.startDate ? new Date(input.startDate) : undefined,
				endDate: input.endDate ? new Date(input.endDate) : undefined,
			});
		} catch {
			throw new ORPCError("NOT_FOUND", {
				message: `Announcement not found: ${input.id}`,
			});
		}
	});

const deleteHandler = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available. Ensure organization context is set.",
			});
		}

		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}

		try {
			await requirePermission(context.tenantDb, context.member, "announcement_management", "delete");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return deleteAnnouncement(context.tenantDb, input.id);
	});

export const announcementsRouter = {
	list,
	listActive,
	create,
	update,
	delete: deleteHandler,
};
