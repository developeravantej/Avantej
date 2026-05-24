import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import {
	getMemberProfile,
	upsertMemberProfile,
} from "@avantej-core/services/member-profile.service";
import { requirePermission } from "@avantej-core/services";

const get = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			memberId: z.string().uuid(),
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

		await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "read");

		return getMemberProfile(context.tenantDb, input.memberId);
	});

const upsert = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			memberId: z.string().uuid(),
			displayName: z.string().optional(),
			bio: z.string().optional(),
			specialization: z.string().optional(),
			imageUrl: z.string().optional(),
			phoneNumber: z.string().optional(),
			certifications: z.array(z.string()).optional(),
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

		await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "update");

		return upsertMemberProfile(context.tenantDb, input.memberId, {
			displayName: input.displayName,
			bio: input.bio,
			specialization: input.specialization,
			imageUrl: input.imageUrl,
			phoneNumber: input.phoneNumber,
			certifications: input.certifications,
		});
	});

export const memberProfilesRouter = { get, upsert };
