import { tenantProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { googleCalendarConnections } from "@avantej-core/db/schema/tenant/google-calendar-connections";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq, and, count, max } from "drizzle-orm";
import {
	revokeGoogleToken,

	listGoogleCalendars,
	checkSyncNowRateLimit,
} from "@avantej-core/services";

// ---------------------------------------------------------------------------
// Shared guards
// ---------------------------------------------------------------------------

function assertTenantAndMember(context: {
	tenantDb?: unknown;
	member?: unknown;
}): asserts context is { tenantDb: NonNullable<typeof context.tenantDb>; member: NonNullable<typeof context.member> } {
	
	
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const googleCalendarRouter = {
	// ------------------------------------------------------------------
	// status — caller's own connection status
	// ------------------------------------------------------------------
	status: tenantProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context }) => {
			assertTenantAndMember(context);

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

	// ------------------------------------------------------------------
	// disconnect — revoke + delete caller's own connection
	// ------------------------------------------------------------------
	disconnect: tenantProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context }) => {
			assertTenantAndMember(context);

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

	// ------------------------------------------------------------------
	// orgStatus — org-wide aggregate (Task 1.16)
	// RBAC: appointment_management:read
	// ------------------------------------------------------------------
	orgStatus: tenantProcedure
		.input(z.object({}))
		.handler(async ({ context }) => {
			assertTenantAndMember(context);
			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "read");

			// 3 parallel aggregates
			const [connectedCountRow, trainerCountRow, lastSyncRow] = await Promise.all([
				// count active Google Calendar connections
				context.tenantDb
					.select({ value: count() })
					.from(googleCalendarConnections)
					.where(eq(googleCalendarConnections.isActive, true))
					.then((rows: any) => rows[0]?.value ?? 0),

				// count trainers (role = "trainer", status = "active")
				context.tenantDb
					.select({ value: count() })
					.from(members)
					.where(and(eq(members.role, "trainer"), eq(members.status, "active")))
					.then((rows: any) => rows[0]?.value ?? 0),

				// latest sync across all connections
				context.tenantDb
					.select({ lastSync: max(googleCalendarConnections.lastSyncAt) })
					.from(googleCalendarConnections)
					.where(eq(googleCalendarConnections.isActive, true))
					.then((rows: any) => rows[0]?.lastSync ?? null),
			]);

			return {
				connectedCount: Number(connectedCountRow),
				totalTrainerCount: Number(trainerCountRow),
				eventsSyncedToday: null,
				conflictsDetected: null,
				lastOrgSyncAt: lastSyncRow ? new Date(lastSyncRow).toISOString() : null,
			};
		}),

	// ------------------------------------------------------------------
	// updateSettings — update caller's own syncDirection + conflictPolicy (Task 1.17)
	// RBAC: appointment_management:update
	// ------------------------------------------------------------------
	updateSettings: tenantProcedure
		.input(
			z.object({
				syncDirection: z
					.enum(["one_way_to_google", "one_way_from_google", "two_way"])
					.optional(),
				conflictPolicy: z
					.enum(["avantej_wins", "google_wins", "keep_both", "manual_review"])
					.optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			assertTenantAndMember(context);
			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update");

			const connection = await context.tenantDb.query.googleCalendarConnections.findFirst({
				where: eq(googleCalendarConnections.memberId, context.member.id),
			});

			if (!connection) {
				throw new ORPCError("NOT_FOUND", {
					message: "No Google Calendar connection found. Connect your calendar first.",
				});
			}

			const updates: Record<string, unknown> = {
				updatedAt: new Date(),
			};
			if (input.syncDirection !== undefined) updates.syncDirection = input.syncDirection;
			if (input.conflictPolicy !== undefined) updates.conflictPolicy = input.conflictPolicy;

			await context.tenantDb
				.update(googleCalendarConnections)
				.set(updates)
				.where(eq(googleCalendarConnections.id, connection.id));

			return { success: true };
		}),

	// ------------------------------------------------------------------
	// syncNow — in-memory rate-limit 1/min per member (Task 1.18)
	// RBAC: appointment_management:update
	// ------------------------------------------------------------------
	syncNow: tenantProcedure
		.input(z.object({}))
		.handler(async ({ context }) => {
			assertTenantAndMember(context);
			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update");

			const allowed = checkSyncNowRateLimit(context.member.id);
			if (!allowed) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: "Sync already enqueued. Please wait at least 60 seconds between syncs.",
				});
			}

			// Bump updatedAt as the sync signal (no dedicated queue table per D2)
			await context.tenantDb
				.update(googleCalendarConnections)
				.set({ updatedAt: new Date() })
				.where(
					and(
						eq(googleCalendarConnections.memberId, context.member.id),
						eq(googleCalendarConnections.isActive, true),
					),
				);

			return { enqueued: true };
		}),

	// ------------------------------------------------------------------
	// listConnectedCalendars — Google calendarList with 24h JS-side cache (Task 1.30)
	// RBAC: appointment_management:read
	// ------------------------------------------------------------------
	listConnectedCalendars: tenantProcedure
		.input(z.object({}))
		.handler(async ({ context }) => {
			assertTenantAndMember(context);
			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "read");

			const connection = await context.tenantDb.query.googleCalendarConnections.findFirst({
				where: eq(googleCalendarConnections.memberId, context.member.id),
			});

			if (!connection) {
				throw new ORPCError("NOT_FOUND", {
					message: "No Google Calendar connection found. Connect your calendar first.",
				});
			}

			const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
			const cacheValid =
				connection.cachedCalendarListAt !== null &&
				Date.now() - new Date(connection.cachedCalendarListAt).getTime() < CACHE_TTL_MS;

			if (cacheValid && connection.cachedCalendarListJson) {
				try {
					return JSON.parse(connection.cachedCalendarListJson) as {
						calendars: Awaited<ReturnType<typeof listGoogleCalendars>>;
						cachedAt: string;
					};
				} catch {
					// fall through to fresh fetch if JSON is corrupt
				}
			}

			// Fresh fetch from Google
			try {
				const calendars = await listGoogleCalendars(connection.accessToken);
				const cachedAt = new Date().toISOString();
				const jsonPayload = JSON.stringify({ calendars, cachedAt });

				// Write cache (non-blocking write — don't fail the response if update fails)
				await context.tenantDb
					.update(googleCalendarConnections)
					.set({
						cachedCalendarListJson: jsonPayload,
						cachedCalendarListAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(googleCalendarConnections.id, connection.id))
					.catch(() => {});

				return { calendars, cachedAt };
			} catch (err) {
				// Fall back to stale cache on Google API error
				if (connection.cachedCalendarListJson) {
					try {
						return JSON.parse(connection.cachedCalendarListJson) as {
							calendars: Awaited<ReturnType<typeof listGoogleCalendars>>;
							cachedAt: string;
						};
					} catch {
						// cache also corrupt — give up
					}
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: `Failed to fetch Google Calendar list: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		}),
};
