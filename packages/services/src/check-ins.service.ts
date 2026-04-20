/**
 * Check-Ins Service
 *
 * Records, lists, and deletes attendance events (check-ins) for appointments
 * or drop-in visits. Supports both registered members and walk-in customers.
 *
 * Key invariants:
 * - Anti-duplicate window of 30 minutes applies to drop-ins only (no appointmentClientId).
 * - Booking-linked check-ins are always allowed (each appointmentClient is unique).
 * - creditsConsumed is opt-in (default 0). Credits consumed at booking are NOT modified here
 *   unless explicitly passed in via input.
 * - All DB writes occur inside a single transaction so audit rollback stays atomic.
 * - Every audit row includes branchId so RBAC in listAudit scopes it correctly.
 */

import { user } from "@avantej-core/db/schema/auth";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { appointmentClients } from "@avantej-core/db/schema/tenant/appointment-clients";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { checkIns } from "@avantej-core/db/schema/tenant/check-ins";
import { members } from "@avantej-core/db/schema/tenant/members";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { walkInCustomers } from "@avantej-core/db/schema/tenant/walk-in-customers";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import {
	and,
	count,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lte,
	sql,
} from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { writeAudit } from "./audit-log.service";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

// -------------------------------------------------------------------------
// Public types
// -------------------------------------------------------------------------

export interface CheckInInput {
	clientType: "member" | "walk_in";
	clientId: string;
	branchId: string;
	appointmentClientId?: string; // set when source='booking'
	source: "booking" | "drop_in";
	outcome?: "attended" | "no_show" | "late_cancel"; // defaults to 'attended'
	packageInstanceId?: string; // set when consuming a credit
	creditsConsumed?: number; // default 0
	notes?: string;
	actor: { userId: string; memberId: string; role: string };
}

export type CheckIn = typeof checkIns.$inferSelect;

export interface TodaysBookingRow {
	appointmentClientId: string;
	appointmentId: string;
	startTime: Date;
	endTime: Date;
	serviceName: string;
	classSlotId: string | null;
	// §7.8: walk-in appointment linkage not yet supported; always 'member' here
	clientType: "member" | "walk_in";
	clientId: string;
	clientName: string; // resolved — never raw UUID
	attendanceStatus: "pending" | "checked_in" | "no_show";
	checkInId: string | null;
}

export interface CheckInRowEnriched extends CheckIn {
	clientName: string; // resolved — never raw UUID
}

export interface ListCheckInsParams {
	branchId?: string;
	from?: Date;
	to?: Date;
	clientId?: string;
	clientType?: "member" | "walk_in";
	outcome?: "attended" | "no_show" | "late_cancel";
	accessibleNodeIds: string[];
	limit?: number;
	offset?: number;
}

// -------------------------------------------------------------------------
// Helper: resolve display name (single record — used by deleteCheckIn revert)
// -------------------------------------------------------------------------

/**
 * Resolve a human-readable display name for a single (clientType, clientId) pair.
 *
 * Resolution chain:
 *  1. member → control-panel users.name
 *  2. member (no name) → control-panel users.email
 *  3. walk_in → walk_in_customers.name
 *  4. final fallback → "Unknown client"
 *
 * Never returns a raw UUID.
 */
export async function resolveClientDisplayName(
	controlPanelDb: ControlPanelDb,
	tenantDb: TenantDb,
	clientType: string,
	clientId: string,
): Promise<string> {
	if (clientType === "member") {
		try {
			const userRow = await controlPanelDb.query.user.findFirst({
				where: eq(user.id, clientId),
				columns: { name: true, email: true },
			});
			if (userRow?.name) return userRow.name;
			if (userRow?.email) return userRow.email;
		} catch {
			// best-effort
		}
	} else if (clientType === "walk_in") {
		try {
			const walkInRow = await tenantDb.query.walkInCustomers.findFirst({
				where: eq(walkInCustomers.id, clientId),
				columns: { name: true },
			});
			if (walkInRow?.name) return walkInRow.name;
		} catch {
			// best-effort
		}
	}
	return "Unknown client";
}

/**
 * Batch-resolve display names for a set of (clientType, clientId) pairs.
 *
 * Performs exactly one control-panel query (for members) and one tenant query
 * (for walk-ins). Returns a Map keyed by `${clientType}:${clientId}`.
 */
async function batchResolveDisplayNames(
	controlPanelDb: ControlPanelDb,
	tenantDb: TenantDb,
	pairs: Array<{ clientType: string; clientId: string }>,
): Promise<Map<string, string>> {
	const nameMap = new Map<string, string>();

	const memberIds = [
		...new Set(
			pairs.filter((p) => p.clientType === "member").map((p) => p.clientId),
		),
	];

	const walkInIds = [
		...new Set(
			pairs.filter((p) => p.clientType === "walk_in").map((p) => p.clientId),
		),
	];

	// Batch member lookup (control panel)
	if (memberIds.length > 0) {
		try {
			const userRows = await controlPanelDb
				.select({ id: user.id, name: user.name, email: user.email })
				.from(user)
				.where(inArray(user.id, memberIds));

			for (const u of userRows) {
				const display = u.name || u.email || "Unknown client";
				nameMap.set(`member:${u.id}`, display);
			}
		} catch {
			// best-effort — remaining member keys will fall through to "Unknown client"
		}
	}

	// Batch walk-in lookup (tenant)
	if (walkInIds.length > 0) {
		try {
			const walkInRows = await tenantDb
				.select({ id: walkInCustomers.id, name: walkInCustomers.name })
				.from(walkInCustomers)
				.where(inArray(walkInCustomers.id, walkInIds));

			for (const w of walkInRows) {
				nameMap.set(`walk_in:${w.id}`, w.name);
			}
		} catch {
			// best-effort
		}
	}

	return nameMap;
}

// -------------------------------------------------------------------------
// recordCheckIn
// -------------------------------------------------------------------------

/**
 * Record a check-in for a member or walk-in customer.
 *
 * Steps:
 *  1. Validate clientId exists for the given clientType.
 *  2. Anti-duplicate check (drop-ins only, 30-min window, outcome='attended').
 *  3. Transaction:
 *     a. Insert check_ins row.
 *     b. Flip appointment_clients.attended if appointmentClientId is set.
 *     c. Increment package_instances.creditsUsed if creditsConsumed > 0.
 *     d. Write audit row (inside tx).
 */
export async function recordCheckIn(
	tenantDb: TenantDb,
	input: CheckInInput,
): Promise<CheckIn> {
	const outcome = input.outcome ?? "attended";

	// Step 1: validate clientId exists
	if (input.clientType === "member") {
		const memberRow = await tenantDb.query.members.findFirst({
			where: eq(members.userId, input.clientId),
			columns: { id: true },
		});
		if (!memberRow) {
			throw new Error(`Member with userId ${input.clientId} not found`);
		}
	} else {
		const walkInRow = await tenantDb.query.walkInCustomers.findFirst({
			where: eq(walkInCustomers.id, input.clientId),
			columns: { id: true },
		});
		if (!walkInRow) {
			throw new Error(`Walk-in customer with id ${input.clientId} not found`);
		}
	}

	// Step 2: anti-duplicate — only for drop-ins, only when outcome='attended'
	// §7.12: booking check-ins always allowed; duplicate check only when appointmentClientId IS NULL
	if (!input.appointmentClientId && outcome === "attended") {
		const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

		const existing = await tenantDb.query.checkIns.findFirst({
			where: and(
				eq(checkIns.clientType, input.clientType),
				eq(checkIns.clientId, input.clientId),
				eq(checkIns.branchId, input.branchId),
				gte(checkIns.checkedInAt, thirtyMinutesAgo),
				eq(checkIns.outcome, "attended"),
				isNull(checkIns.appointmentClientId),
			),
			columns: { id: true, checkedInAt: true },
		});

		if (existing) {
			const minutesAgo = Math.floor(
				(Date.now() - existing.checkedInAt.getTime()) / 60000,
			);
			throw Object.assign(
				new Error(
					`Already checked in ${minutesAgo} minute${minutesAgo === 1 ? "" : "s"} ago`,
				),
				{
					code: "ALREADY_CHECKED_IN",
					existingCheckInId: existing.id,
					minutesAgo,
				},
			);
		}
	}

	// Step 3: transactional write
	const inserted = await tenantDb.transaction(async (tx: TenantTx) => {
		// 3a. Insert check_in row
		let rows: (typeof checkIns.$inferSelect)[];
		try {
			rows = await tx
				.insert(checkIns)
				.values({
					clientType: input.clientType,
					clientId: input.clientId,
					branchId: input.branchId,
					appointmentClientId: input.appointmentClientId ?? null,
					source: input.source,
					outcome,
					packageInstanceId: input.packageInstanceId ?? null,
					creditsConsumed: input.creditsConsumed ?? 0,
					notes: input.notes ?? null,
					checkedInBy: input.actor.userId,
				})
				.returning();
		} catch (err: unknown) {
			if (
				err &&
				typeof err === "object" &&
				"code" in err &&
				(err as { code: string }).code === "23505"
			) {
				throw Object.assign(new Error("Already checked in today"), {
					code: "ALREADY_CHECKED_IN",
				});
			}
			throw err;
		}

		const row = rows[0];
		if (!row) throw new Error("Insert did not return a row");

		// 3b. Flip appointment_clients.attended
		if (input.appointmentClientId) {
			await tx
				.update(appointmentClients)
				.set({ attended: outcome === "attended" })
				.where(eq(appointmentClients.id, input.appointmentClientId));
		}

		// 3c. Increment creditsUsed (only if explicitly consuming credits)
		if (
			input.packageInstanceId &&
			input.creditsConsumed &&
			input.creditsConsumed > 0
		) {
			await tx
				.update(packageInstances)
				.set({
					creditsUsed: sql`${packageInstances.creditsUsed} + ${input.creditsConsumed}`,
				})
				.where(eq(packageInstances.id, input.packageInstanceId));
		}

		// 3d. Audit (inside tx for atomicity — §4.8)
		await writeAudit(tx, {
			actorUserId: input.actor.userId,
			actorMemberId: input.actor.memberId,
			actorRole: input.actor.role,
			action: "checkin.create",
			entityType: "check_in",
			entityId: row.id,
			branchId: input.branchId,
			summary: `Check-in recorded: ${input.clientType} ${input.source} — ${outcome}`,
			changes: {
				clientType: input.clientType,
				clientId: input.clientId,
				source: input.source,
				outcome,
				creditsConsumed: input.creditsConsumed ?? 0,
				appointmentClientId: input.appointmentClientId ?? null,
			},
		});

		return row;
	});

	return inserted;
}

// -------------------------------------------------------------------------
// listTodaysBookings
// -------------------------------------------------------------------------

/**
 * List today's bookings for a branch, annotated with check-in status.
 *
 * Returns appointment_clients joined with appointments and services for the
 * given branch + calendar day. Each row is annotated with `checkInId` if a
 * check_ins row already exists for that appointmentClientId.
 *
 * §7.8 limitation: appointment_clients.clientId always references members.userId;
 * walk-in booking linkage is deferred (requires appointment_clients.clientType).
 * clientType is therefore hardcoded to "member" here.
 */
export async function listTodaysBookings(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
	params: {
		branchId: string;
		date: Date;
		accessibleNodeIds: string[];
	},
): Promise<TodaysBookingRow[]> {
	const { branchId, date } = params;

	// Build day boundaries in UTC
	const dayStart = new Date(date);
	dayStart.setUTCHours(0, 0, 0, 0);
	const dayEnd = new Date(date);
	dayEnd.setUTCHours(23, 59, 59, 999);

	// Fetch appointment_clients for the branch on the given day
	const rows = await tenantDb
		.select({
			appointmentClientId: appointmentClients.id,
			appointmentId: appointmentClients.appointmentId,
			clientId: appointmentClients.clientId,
			attended: appointmentClients.attended,
			startTime: appointments.startTime,
			endTime: appointments.endTime,
			classSlotId: appointments.classSlotId,
			serviceName: services.name,
		})
		.from(appointmentClients)
		.innerJoin(
			appointments,
			eq(appointmentClients.appointmentId, appointments.id),
		)
		.leftJoin(services, eq(appointments.serviceId, services.id))
		.where(
			and(
				eq(appointments.branchId, branchId),
				gte(appointments.startTime, dayStart),
				lte(appointments.startTime, dayEnd),
			),
		);

	if (rows.length === 0) return [];

	// Fetch existing check-ins for these appointmentClientIds (already-checked-in annotation)
	const apptClientIds = rows.map((r) => r.appointmentClientId);
	const existingCheckIns = await tenantDb
		.select({
			id: checkIns.id,
			appointmentClientId: checkIns.appointmentClientId,
			outcome: checkIns.outcome,
		})
		.from(checkIns)
		.where(inArray(checkIns.appointmentClientId, apptClientIds));

	const checkInByApptClientId = new Map(
		existingCheckIns
			.filter(
				(c): c is typeof c & { appointmentClientId: string } =>
					c.appointmentClientId !== null,
			)
			.map((c) => [c.appointmentClientId, c]),
	);

	// Batch-resolve client display names (all are members here — §7.8)
	const pairs = rows.map((r) => ({
		clientType: "member" as const,
		clientId: r.clientId,
	}));
	const nameMap = await batchResolveDisplayNames(
		controlPanelDb,
		tenantDb,
		pairs,
	);

	return rows.map((r) => {
		const existingCheckIn = checkInByApptClientId.get(r.appointmentClientId);
		let attendanceStatus: "pending" | "checked_in" | "no_show" = "pending";
		if (existingCheckIn) {
			attendanceStatus =
				existingCheckIn.outcome === "no_show" ? "no_show" : "checked_in";
		}

		return {
			appointmentClientId: r.appointmentClientId,
			appointmentId: r.appointmentId,
			startTime: r.startTime,
			endTime: r.endTime,
			serviceName: r.serviceName ?? "Unknown service",
			classSlotId: r.classSlotId ?? null,
			// §7.8: always 'member' for now — walk-in booking linkage deferred
			clientType: "member" as const,
			clientId: r.clientId,
			clientName: nameMap.get(`member:${r.clientId}`) ?? "Unknown client",
			attendanceStatus,
			checkInId: existingCheckIn?.id ?? null,
		};
	});
}

// -------------------------------------------------------------------------
// listCheckIns
// -------------------------------------------------------------------------

/**
 * List check-ins with optional filters and RBAC scoping.
 *
 * RBAC: branchId must be in accessibleNodeIds.
 * Client names are batch-resolved (one control-panel query + one tenant query).
 */
export async function listCheckIns(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
	params: ListCheckInsParams,
): Promise<{ rows: CheckInRowEnriched[]; total: number }> {
	const {
		branchId,
		from,
		to,
		clientId,
		clientType,
		outcome,
		accessibleNodeIds,
		limit = 100,
		offset = 0,
	} = params;

	// Build filters
	const conditions = [];

	// RBAC: restrict to accessible nodes
	if (accessibleNodeIds.length > 0) {
		conditions.push(inArray(checkIns.branchId, accessibleNodeIds));
	} else {
		// No accessible nodes — return empty
		return { rows: [], total: 0 };
	}

	if (branchId) conditions.push(eq(checkIns.branchId, branchId));
	if (clientId) conditions.push(eq(checkIns.clientId, clientId));
	if (clientType) conditions.push(eq(checkIns.clientType, clientType));
	if (outcome) conditions.push(eq(checkIns.outcome, outcome));
	if (from) conditions.push(gte(checkIns.checkedInAt, from));
	if (to) conditions.push(lte(checkIns.checkedInAt, to));

	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const [rawRows, totalResult] = await Promise.all([
		tenantDb
			.select()
			.from(checkIns)
			.where(where)
			.orderBy(desc(checkIns.checkedInAt))
			.limit(Math.min(limit, 200))
			.offset(offset),

		tenantDb.select({ count: count() }).from(checkIns).where(where),
	]);

	const total = totalResult[0]?.count ?? 0;

	if (rawRows.length === 0) return { rows: [], total };

	// Batch-resolve display names (avoid N+1)
	const pairs = rawRows.map((r) => ({
		clientType: r.clientType,
		clientId: r.clientId,
	}));
	const nameMap = await batchResolveDisplayNames(
		controlPanelDb,
		tenantDb,
		pairs,
	);

	const enriched: CheckInRowEnriched[] = rawRows.map((row) => ({
		...row,
		clientName:
			nameMap.get(`${row.clientType}:${row.clientId}`) ?? "Unknown client",
	}));

	return { rows: enriched, total };
}

// -------------------------------------------------------------------------
// deleteCheckIn
// -------------------------------------------------------------------------

/**
 * Hard-delete a check-in record (mistake correction).
 *
 * Revert logic inside the same transaction:
 *  1. Read the existing row.
 *  2. If appointmentClientId is set, revert appointment_clients.attended to NULL.
 *  3. If creditsConsumed > 0, decrement package_instances.creditsUsed.
 *  4. Delete the check_in row.
 *  5. Write audit row.
 */
export async function deleteCheckIn(
	tenantDb: TenantDb,
	id: string,
	actor: { userId: string; memberId: string; role: string },
): Promise<void> {
	await tenantDb.transaction(async (tx: TenantTx) => {
		// Lock the row first to prevent concurrent deletes from both passing the
		// existence check and double-decrementing credits (Gap #18)
		const [existing] = await tx
			.select()
			.from(checkIns)
			.where(eq(checkIns.id, id))
			.for("update");

		if (!existing) {
			throw Object.assign(new Error(`Check-in ${id} not found`), {
				code: "NOT_FOUND",
			});
		}

		// 1. Revert appointment_clients.attended → NULL
		if (existing.appointmentClientId) {
			await tx
				.update(appointmentClients)
				.set({ attended: null })
				.where(eq(appointmentClients.id, existing.appointmentClientId));
		}

		// 2. Decrement creditsUsed (never go below 0)
		if (existing.packageInstanceId && existing.creditsConsumed > 0) {
			await tx
				.update(packageInstances)
				.set({
					creditsUsed: sql`GREATEST(0, ${packageInstances.creditsUsed} - ${existing.creditsConsumed})`,
				})
				.where(eq(packageInstances.id, existing.packageInstanceId));
		}

		// 3. Delete the row
		await tx.delete(checkIns).where(eq(checkIns.id, id));

		// 4. Audit (inside tx — §4.8)
		await writeAudit(tx, {
			actorUserId: actor.userId,
			actorMemberId: actor.memberId,
			actorRole: actor.role,
			action: "checkin.delete",
			entityType: "check_in",
			entityId: id,
			branchId: existing.branchId,
			summary: `Check-in deleted: ${existing.clientType} ${existing.source} — ${existing.outcome}`,
			changes: {
				deletedRow: {
					id: existing.id,
					clientType: existing.clientType,
					clientId: existing.clientId,
					source: existing.source,
					outcome: existing.outcome,
					creditsConsumed: existing.creditsConsumed,
					appointmentClientId: existing.appointmentClientId,
					checkedInAt: existing.checkedInAt,
				},
			},
		});
	});
}
