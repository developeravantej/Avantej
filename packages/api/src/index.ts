import { ORPCError, os } from "@orpc/server";
import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
	if (!context.session || !context.session.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({
		context: {
			session: context.session,
		},
	});
});

const requireTenant = o.middleware(async ({ context, next }) => {
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
	return next({});
});

export const protectedProcedure = publicProcedure.use(requireAuth);

/** Session + tenantDb + member required (Plan C C.4). */
export const tenantProcedure = protectedProcedure.use(requireTenant);
