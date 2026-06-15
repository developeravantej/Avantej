import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { o, protectedProcedure } from "@avantej-core/api";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";

export type PlatformAdminRole = "super_admin" | "support" | "billing";

export function requirePlatformAdmin(
	allowRoles?: ReadonlyArray<PlatformAdminRole>,
) {
	return o.middleware(async ({ context, next }) => {
		if (!context.session?.user) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Authentication required",
			});
		}

		const controlPanelDb = context.honoContext?.get("controlPanelDb") as
			| NeonDatabase<typeof controlPanelSchema>
			| undefined;

		if (!controlPanelDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Control panel database not available in context",
			});
		}

		const adminRecord = await controlPanelDb.query.platformAdmins.findFirst({
			where: eq(platformAdmins.userId, context.session.user.id),
		});

		if (!adminRecord) {
			throw new ORPCError("FORBIDDEN", {
				message: "Admin access required",
			});
		}

		if (
			allowRoles &&
			!allowRoles.includes(adminRecord.role as PlatformAdminRole)
		) {
			throw new ORPCError("FORBIDDEN", {
				message: "Your platform admin role does not permit this action",
			});
		}

		return next({
			context: {
				...context,
				// session is non-null: we threw UNAUTHORIZED above if it was absent.
				session: context.session!,
				adminRecord,
				adminRole: adminRecord.role as PlatformAdminRole,
			},
		});
	});
}

export const adminProcedure = protectedProcedure.use(requirePlatformAdmin());
