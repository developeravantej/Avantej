import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import {
	getMemberProfile,
	upsertMemberProfile,
} from "@avantej-core/services/member-profile.service";
import { requirePermission } from "@avantej-core/services";

const get = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			memberId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "read");

		return getMemberProfile(context.tenantDb, input.memberId);
	});

const upsert = tenantProcedure
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
