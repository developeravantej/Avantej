import { protectedProcedure } from "../index";
import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { googleCalendarConnections } from "@avantej-core/db/schema/tenant/google-calendar-connections";
import { eq } from "drizzle-orm";
import { revokeGoogleToken } from "@avantej-core/services";

export const googleCalendarRouter = {
	status: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available.",
				});
			}
			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "Not a member of this organization",
				});
			}

			const connection = await context.tenantDb.query.googleCalendarConnections.findFirst({
				where: eq(googleCalendarConnections.memberId, context.member.id),
			});

			if (!connection) {
				return {
					connected: false,
					googleEmail: null,
					syncScope: null as "all" | "own" | null,
					lastSyncAt: null,
					lastSyncError: null,
				};
			}

			return {
				connected: connection.isActive,
				googleEmail: connection.googleEmail,
				syncScope: connection.syncScope as "all" | "own",
				lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
				lastSyncError: connection.lastSyncError,
			};
		}),

	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available.",
				});
			}
			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "Not a member of this organization",
				});
			}

			const connection = await context.tenantDb.query.googleCalendarConnections.findFirst({
				where: eq(googleCalendarConnections.memberId, context.member.id),
			});

			if (!connection) {
				throw new ORPCError("NOT_FOUND", {
					message: "No Google Calendar connection found",
				});
			}

			// Revoke Google token (best-effort — don't fail if revocation fails)
			await revokeGoogleToken(connection.accessToken).catch(() => {});

			// Delete the connection row
			await context.tenantDb
				.delete(googleCalendarConnections)
				.where(eq(googleCalendarConnections.id, connection.id));

			return { success: true };
		}),
};
