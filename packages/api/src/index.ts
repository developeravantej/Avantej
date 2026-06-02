import { ORPCError, os } from "@orpc/server";
import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({
		context: {
			session: context.session,
		},
	});
});

export const protectedProcedure = publicProcedure.use(requireAuth);

// ─── Platform-admin gate ──────────────────────────────────────────────────────
//
// The single home for the platform-admin authorization gate. Previously this
// middleware was hand-copied verbatim into 23 router files (each behind a
// `(protectedProcedure as any).middleware` cast), which let the copies drift —
// see ADR-0022 ("single auth model — every Plan E route uses the same gate") and
// ADR-0027 ("gate on platform_admins membership via existing middleware").
//
// Gating on `platform_admins` membership; optional `allowRoles` restricts to a
// subset of roles (e.g. super_admin / support for impersonation). On success the
// resolved control-panel DB + admin identity are injected onto the context, so
// downstream handlers read a typed `context.controlPanelDb` / `context.adminUserId`
// instead of re-reading the untyped Hono context.

export type PlatformAdminRole = "super_admin" | "support" | "billing";
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

async function resolvePlatformAdmin(
	context: Context,
	allowRoles?: ReadonlyArray<PlatformAdminRole>,
) {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "Authentication required",
		});
	}
	const controlPanelDb = context.honoContext?.get("controlPanelDb") as
		| ControlPanelDb
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
		throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
	}
	if (
		allowRoles &&
		!allowRoles.includes(adminRecord.role as PlatformAdminRole)
	) {
		throw new ORPCError("FORBIDDEN", {
			message: "Your platform admin role does not permit this action",
		});
	}
	return { controlPanelDb, adminRecord };
}

function platformAdminGate(allowRoles?: ReadonlyArray<PlatformAdminRole>) {
	return o.middleware(async ({ context, next }) => {
		const { controlPanelDb, adminRecord } = await resolvePlatformAdmin(
			context,
			allowRoles,
		);
		return next({
			context: {
				controlPanelDb,
				adminUserId: adminRecord.userId,
				adminRecord,
				adminRole: adminRecord.role,
			},
		});
	});
}

/** Any platform-admin role (super_admin / support / billing). */
export const platformAdminProcedure = protectedProcedure.use(
	platformAdminGate(),
);

/** super_admin only — for destructive / privileged platform operations. */
export const superAdminProcedure = protectedProcedure.use(
	platformAdminGate(["super_admin"]),
);

/** Restrict to a specific set of platform-admin roles (e.g. impersonation). */
export function platformAdminProcedureWithRoles(
	allowRoles: ReadonlyArray<PlatformAdminRole>,
) {
	return protectedProcedure.use(platformAdminGate(allowRoles));
}
