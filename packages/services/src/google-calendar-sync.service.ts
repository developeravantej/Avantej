// packages/services/src/google-calendar-sync.service.ts

import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { googleCalendarConnections } from "@avantej-core/db/schema/tenant/google-calendar-connections";
import { googleCalendarEventMappings } from "@avantej-core/db/schema/tenant/google-calendar-event-mappings";
import { externalBusyBlocks } from "@avantej-core/db/schema/tenant/external-busy-blocks";
import {
	decryptToken,
	encryptToken,
} from "@avantej-core/db/lib/oauth-security";
import { eq, and, gte, lt, notInArray } from "drizzle-orm";
import {
	refreshAccessToken,
	createCalendarEvent,
	updateCalendarEvent,
	deleteCalendarEvent,
	listCalendarEvents,
	type CalendarEvent,
	type GoogleCalendarEvent,
} from "./google-calendar.service";

type TenantDb = NeonDatabase<typeof tenantSchema>;

type AppointmentRow = {
	id: string;
	startTime: Date;
	endTime: Date;
	trainerId: string | null;
	branchId: string;
	notes: string | null;
	bookingNumber: string | null;
	location: string | null;
};

type GCalConfig = {
	clientId: string;
	clientSecret: string;
};

async function ensureValidToken(
	tenantDb: TenantDb,
	connection: typeof googleCalendarConnections.$inferSelect,
	config: GCalConfig,
): Promise<string> {
	// If token expires within 5 minutes, refresh proactively
	if (connection.tokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
		try {
			const refreshed = await refreshAccessToken({
				refreshToken: decryptToken(connection.refreshToken),
				clientId: config.clientId,
				clientSecret: config.clientSecret,
			});

			await tenantDb
				.update(googleCalendarConnections)
				.set({
					accessToken: encryptToken(refreshed.access_token),
					tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
					encryptionKeyId: "v1",
					tokenRotatedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(googleCalendarConnections.id, connection.id));

			return refreshed.access_token;
		} catch (err) {
			// If refresh fails, mark connection as inactive
			await tenantDb
				.update(googleCalendarConnections)
				.set({
					isActive: false,
					lastSyncError: "Access revoked. Please reconnect.",
					updatedAt: new Date(),
				})
				.where(eq(googleCalendarConnections.id, connection.id));
			throw new Error(
				`Token refresh failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
	return decryptToken(connection.accessToken);
}

function buildCalendarEvent(appointment: AppointmentRow): CalendarEvent {
	return {
		summary: `Appointment${appointment.bookingNumber ? ` #${appointment.bookingNumber}` : ""}`,
		description: appointment.notes ?? undefined,
		location: appointment.location ?? undefined,
		start: {
			dateTime: appointment.startTime.toISOString(),
			timeZone: "Asia/Kuala_Lumpur",
		},
		end: {
			dateTime: appointment.endTime.toISOString(),
			timeZone: "Asia/Kuala_Lumpur",
		},
	};
}

async function updateSyncStatus(
	tenantDb: TenantDb,
	connectionId: string,
	update: { lastSyncAt?: Date; lastSyncError?: string | null },
): Promise<void> {
	await tenantDb
		.update(googleCalendarConnections)
		.set({
			lastSyncAt: update.lastSyncAt,
			lastSyncError: update.lastSyncError ?? null,
			updatedAt: new Date(),
		})
		.where(eq(googleCalendarConnections.id, connectionId));
}

/**
 * Sync an appointment event to all relevant Google Calendars.
 * Fire-and-forget safe — all errors are caught and logged to lastSyncError.
 * Does NOT throw.
 */
export async function syncAppointmentToGoogleCalendar(
	tenantDb: TenantDb,
	appointment: AppointmentRow,
	action: "create" | "update" | "delete",
	config: GCalConfig,
): Promise<void> {
	// Find all active connections that should receive this event:
	// - syncScope="own" connections where memberId matches the trainer's member record
	// - syncScope="all" active connections
	let connections: Array<typeof googleCalendarConnections.$inferSelect>;

	try {
		const allActive = await tenantDb.query.googleCalendarConnections.findMany({
			where: eq(googleCalendarConnections.isActive, true),
		});

		if (appointment.trainerId) {
			// Find the trainer's connection (their member.id = trainerId)
			connections = allActive.filter(
				(conn) =>
					conn.syncScope === "all" ||
					(conn.syncScope === "own" && conn.memberId === appointment.trainerId),
			);
		} else {
			// No trainer — only "all" scope connections
			connections = allActive.filter((conn) => conn.syncScope === "all");
		}
	} catch (err) {
		console.error("GCal: failed to fetch connections", err);
		return;
	}

	for (const conn of connections) {
		try {
			const accessToken = await ensureValidToken(tenantDb, conn, config);

			if (action === "create") {
				const eventId = await createCalendarEvent(
					accessToken,
					conn.calendarId,
					buildCalendarEvent(appointment),
				);

				// Store the mapping
				await tenantDb
					.insert(googleCalendarEventMappings)
					.values({
						appointmentId: appointment.id,
						connectionId: conn.id,
						googleEventId: eventId,
					})
					.onConflictDoUpdate({
						target: [
							googleCalendarEventMappings.appointmentId,
							googleCalendarEventMappings.connectionId,
						],
						set: { googleEventId: eventId },
					});

				await updateSyncStatus(tenantDb, conn.id, { lastSyncAt: new Date() });
			} else if (action === "update") {
				// Find existing mapping
				const mapping =
					await tenantDb.query.googleCalendarEventMappings.findFirst({
						where: and(
							eq(googleCalendarEventMappings.appointmentId, appointment.id),
							eq(googleCalendarEventMappings.connectionId, conn.id),
						),
					});

				if (mapping) {
					await updateCalendarEvent(
						accessToken,
						conn.calendarId,
						mapping.googleEventId,
						buildCalendarEvent(appointment),
					);
					await updateSyncStatus(tenantDb, conn.id, { lastSyncAt: new Date() });
				} else {
					// No existing mapping — create it
					const eventId = await createCalendarEvent(
						accessToken,
						conn.calendarId,
						buildCalendarEvent(appointment),
					);
					await tenantDb.insert(googleCalendarEventMappings).values({
						appointmentId: appointment.id,
						connectionId: conn.id,
						googleEventId: eventId,
					});
					await updateSyncStatus(tenantDb, conn.id, { lastSyncAt: new Date() });
				}
			} else if (action === "delete") {
				const mapping =
					await tenantDb.query.googleCalendarEventMappings.findFirst({
						where: and(
							eq(googleCalendarEventMappings.appointmentId, appointment.id),
							eq(googleCalendarEventMappings.connectionId, conn.id),
						),
					});

				if (mapping) {
					await deleteCalendarEvent(
						accessToken,
						conn.calendarId,
						mapping.googleEventId,
					);
					await tenantDb
						.delete(googleCalendarEventMappings)
						.where(eq(googleCalendarEventMappings.id, mapping.id));
					await updateSyncStatus(tenantDb, conn.id, { lastSyncAt: new Date() });
				}
			}
		} catch (err) {
			// Don't throw — sync failure must not block the appointment operation
			console.error(`GCal: sync failed for connection ${conn.id}:`, err);
			try {
				await updateSyncStatus(tenantDb, conn.id, {
					lastSyncError: err instanceof Error ? err.message : String(err),
				});
			} catch {
				// ignore update failure
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Pull-sync: Google -> Avantej (UAT §6 "Read availability")
// ---------------------------------------------------------------------------

export type PullBusyBlocksResult = {
	synced: number;
	pruned: number;
};

/** Injectable for unit tests so the Google round-trip can be mocked. */
export type PullBusyBlocksDeps = {
	listCalendarEvents: typeof listCalendarEvents;
};

const DEFAULT_PULL_DEPS: PullBusyBlocksDeps = { listCalendarEvents };

/**
 * Mirror busy times FROM a connected Google Calendar INTO `external_busy_blocks`
 * for the window [windowStart, windowEnd), so `computeAvailableSlots` removes the
 * overlapping slots from the booking flow.
 *
 * Idempotent: timed, non-cancelled, opaque (busy) events are upserted by
 * (connectionId, googleEventId); rows in the window whose event no longer appears
 * (deleted/cancelled/freed in Google) are pruned. Re-running is safe.
 *
 * Returns counts. Throws only on token/transport failure (the caller decides
 * whether to surface it); the connection's lastSyncError is recorded either way.
 */
export async function pullExternalBusyBlocks(
	tenantDb: TenantDb,
	connection: typeof googleCalendarConnections.$inferSelect,
	window: { windowStart: Date; windowEnd: Date },
	config: GCalConfig,
	deps: PullBusyBlocksDeps = DEFAULT_PULL_DEPS,
): Promise<PullBusyBlocksResult> {
	try {
		const accessToken = await ensureValidToken(tenantDb, connection, config);
		const events = await deps.listCalendarEvents(
			accessToken,
			connection.calendarId,
			window.windowStart,
			window.windowEnd,
		);

		// Keep only concrete, timed, busy intervals. All-day (date-only) and
		// "transparent"/cancelled events do not block bookable slots.
		const busy = events.filter(
			(e: GoogleCalendarEvent) =>
				e.status !== "cancelled" &&
				e.transparency !== "transparent" &&
				!!e.start?.dateTime &&
				!!e.end?.dateTime,
		);

		let synced = 0;
		for (const e of busy) {
			const start = new Date(e.start.dateTime as string);
			const end = new Date(e.end.dateTime as string);
			if (!(end > start)) continue; // skip zero/negative-length events
			synced++;
			await tenantDb
				.insert(externalBusyBlocks)
				.values({
					connectionId: connection.id,
					trainerId: connection.memberId,
					googleEventId: e.id,
					startTime: start,
					endTime: end,
					summary: e.summary ?? null,
					source: "google",
					syncedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: [
						externalBusyBlocks.connectionId,
						externalBusyBlocks.googleEventId,
					],
					set: {
						startTime: start,
						endTime: end,
						summary: e.summary ?? null,
						syncedAt: new Date(),
					},
				});
		}

		// Prune stale rows: anything in this window for this connection whose event
		// id is no longer among the live busy set (deleted/cancelled/freed in Google).
		const liveIds = busy.map((e) => e.id);
		const pruneWhere = and(
			eq(externalBusyBlocks.connectionId, connection.id),
			gte(externalBusyBlocks.startTime, window.windowStart),
			lt(externalBusyBlocks.startTime, window.windowEnd),
			liveIds.length > 0
				? notInArray(externalBusyBlocks.googleEventId, liveIds)
				: undefined,
		);
		const pruned = await tenantDb
			.delete(externalBusyBlocks)
			.where(pruneWhere)
			.returning({ id: externalBusyBlocks.id });

		await updateSyncStatus(tenantDb, connection.id, {
			lastSyncAt: new Date(),
			lastSyncError: null,
		});

		return { synced, pruned: pruned.length };
	} catch (err) {
		try {
			await updateSyncStatus(tenantDb, connection.id, {
				lastSyncError: err instanceof Error ? err.message : String(err),
			});
		} catch {
			// ignore status-update failure
		}
		throw err;
	}
}
