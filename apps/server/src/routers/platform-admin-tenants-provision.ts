/**
 * Platform Admin — Tenant Provisioning router (Plan E Phase E.7).
 *
 * Exposes one proc: `provisionTenant`. Super-admin only. Wraps
 * `services/tenant-provisioning.service.ts` which spins up the Neon project,
 * runs migrations, seeds RBAC, creates the root hierarchy node, creates an
 * admin invitation in the tenant DB, emails the owner, and writes an audit
 * row.
 *
 * Lives in a separate file (not platform-admin-tenants.ts) so E.7 stays
 * isolated for review and the original router can keep its single
 * responsibility (read + lifecycle).
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { protectedProcedure } from "@avantej-core/api";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { provisionTenant } from "@/services/tenant-provisioning.service";

function requirePlatformAdmin(
	allowRoles?: ReadonlyArray<"super_admin" | "support" | "billing">,
) {
	return (protectedProcedure as any).middleware(
		async ({ context, next }: { context: any; next: any }) => {
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
				throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
			}
			if (
				allowRoles &&
				!allowRoles.includes(
					adminRecord.role as "super_admin" | "support" | "billing",
				)
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "Your platform admin role does not permit this action",
				});
			}
			return next({
				context: { ...context, adminRecord, adminRole: adminRecord.role },
			});
		},
	);
}

const superAdminProcedure = protectedProcedure.use(
	requirePlatformAdmin(["super_admin"]),
);

function cpDbFromContext(
	context: unknown,
): NeonDatabase<typeof controlPanelSchema> {
	const db = (context as { honoContext?: { get: (k: string) => unknown } })
		.honoContext?.get("controlPanelDb") as
		| NeonDatabase<typeof controlPanelSchema>
		| undefined;
	if (!db) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel DB unavailable",
		});
	}
	return db;
}

function adminUserIdFrom(context: unknown): string {
	const session = (context as { session?: { user?: { id?: string } } })
		.session;
	const id = session?.user?.id;
	if (!id) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "No admin user in session",
		});
	}
	return id;
}

function getEnvVar(key: string): string | undefined {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const cloudflare = require("cloudflare:workers");
		return cloudflare.env?.[key];
	} catch {
		return process.env[key];
	}
}

export const platformAdminTenantsProvisionRouter = {
	provisionTenant: superAdminProcedure
		.input(
			z.object({
				name: z.string().trim().min(2).max(120),
				slug: z
					.string()
					.trim()
					.min(3)
					.max(64)
					.regex(/^[a-z0-9-]+$/, "lowercase letters, digits, hyphens only"),
				country: z.enum(["MY", "SG", "TH"]),
				ownerEmail: z.string().email().max(254),
				ownerName: z.string().trim().max(120).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFromContext(context);
			const adminUserId = adminUserIdFrom(context);
			const session = (
				context as { session?: { user?: { name?: string | null } } }
			).session;
			const inviterName = session?.user?.name ?? undefined;

			const frontendURL =
				getEnvVar("CORS_ORIGIN") ||
				getEnvVar("FRONTEND_URL") ||
				"http://localhost:3001";

			if (!getEnvVar("NEON_API_KEY")) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"NEON_API_KEY is not configured — tenant provisioning is unavailable",
				});
			}

			try {
				const result = await provisionTenant(input, {
					controlPanelDb: cpDb,
					adminUserId,
					inviterName,
					frontendURL,
				});
				return { ok: true as const, ...result };
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to provision tenant";
				// Slug-collision → 409, everything else → 500.
				if (message.startsWith("Slug already taken")) {
					throw new ORPCError("CONFLICT", { message });
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", { message });
			}
		}),
};
