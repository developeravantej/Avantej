import {
	listAppointmentsWithRecurrence,
	isVirtualId,
} from "@avantej-core/services";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	resolveAccessibleNodeIds,
} from "../../guards";
import { inArray, or } from "drizzle-orm";
import { services } from "@avantej-core/db/schema/tenant/services";
import { memberProfiles } from "@avantej-core/db/schema/tenant/member-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { appointmentStaff } from "@avantej-core/db/schema/tenant/appointment-staff";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "../../lib/context-helpers";
import { statusSchema } from "./schemas";

export const appointmentsListProcedures = {
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
				serviceId: z.string().uuid().nullable().optional(),
				trainerId: z.string().uuid().optional(),
				status: statusSchema.optional(),
				startFrom: z.string().datetime().optional(),
				startTo: z.string().datetime().optional(),
				limit: z.number().int().min(1).max(500).optional(),
				/**
				 * scope='assignable_to_me' — WHERE trainer_id = caller.member.id OR trainer_id IS NULL.
				 * scope='all' — no additional trainer filter (default).
				 */
				scope: z.enum(["assignable_to_me", "all"]).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"appointment_management",
				"read",
			);

			const accessibleNodeIds = await resolveAccessibleNodeIds(context);

			// Use recurrence-aware list which returns virtual occurrences for recurring series.
			// Note: status filter is not passed to listAppointmentsWithRecurrence — virtual
			// occurrences inherit the parent's status so we filter post-expansion below.
			const startFrom = input.startFrom
				? new Date(input.startFrom)
				: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
			const startTo = input.startTo
				? new Date(input.startTo)
				: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

			let items = await listAppointmentsWithRecurrence(context.tenantDb, {
				organizationId: input.organizationId,
				trainerId: input.trainerId,
				startFrom,
				startTo,
				accessibleNodeIds,
			});

			// Apply post-expansion filters that couldn't be pushed into the DB query
			if (input.status) {
				items = items.filter((r) => r.status === input.status);
			}
			if (input.serviceId !== undefined && input.serviceId !== null) {
				items = items.filter((r) => r.serviceId === input.serviceId);
			}
			if (input.branchId) {
				items = items.filter((r) => r.branchId === input.branchId);
			}
			// scope='assignable_to_me': keep rows where trainerId equals caller's memberId OR trainerId is null
			if (input.scope === "assignable_to_me") {
				const callerMemberId = context.member.id;
				items = items.filter(
					(r) =>
						r.trainerId === null ||
						r.trainerId === undefined ||
						r.trainerId === callerMemberId,
				);
			}
			if (input.limit) {
				items = items.slice(0, input.limit);
			}

			if (items.length === 0)
				return items.map((r) => ({
					...r,
					isVirtual: r.isVirtual,
					parentId: r.parentId,
					serviceName: null,
					trainerName: null,
					clientName: null,
				}));

			// Batch-resolve names in parallel.
			// For virtual occurrences: id is synthetic ("virtual__...") but parentId + trainerId/serviceId/userId
			// are all inherited from the parent row, so service/user lookups work transparently.
			// For appointmentStaff: virtual rows don't have their own staff rows — we must look up by parentId.
			const serviceIds = [
				...new Set(items.map((r) => r.serviceId).filter(Boolean) as string[]),
			];
			const directTrainerIds = [
				...new Set(items.map((r) => r.trainerId).filter(Boolean) as string[]),
			];
			// Read-scaling: only resolve names cross-DB for LEGACY rows that have no
			// denormalized customer_name snapshot. New rows carry the name inline.
			const userIds = [
				...new Set(
					items
						.filter((r) => !r.customerName)
						.map((r) => r.userId)
						.filter(Boolean) as string[],
				),
			];

			// For appointmentStaff lookup: use real appt ids (non-virtual) OR parentId (for virtual rows)
			const realApptIds = items
				.filter((r) => !isVirtualId(r.id))
				.map((r) => r.id);
			const virtualParentIds = [
				...new Set(
					items
						.filter((r) => isVirtualId(r.id))
						.map((r) => r.parentId)
						.filter(Boolean) as string[],
				),
			];
			const staffQueryIds = [...new Set([...realApptIds, ...virtualParentIds])];

			const [serviceRows, staffAssignmentRows, userRows] = await Promise.all([
				serviceIds.length > 0
					? context.tenantDb
							.select({ id: services.id, name: services.name })
							.from(services)
							.where(inArray(services.id, serviceIds))
					: [],
				staffQueryIds.length > 0
					? context.tenantDb
							.select({
								appointmentId: appointmentStaff.appointmentId,
								staffId: appointmentStaff.staffId,
								slotIndex: appointmentStaff.slotIndex,
							})
							.from(appointmentStaff)
							.where(inArray(appointmentStaff.appointmentId, staffQueryIds))
					: [],
				userIds.length > 0
					? (() => {
							try {
								const cpDb = getControlPanelDb(context);
								return cpDb
									.select({ id: cpUsers.id, name: cpUsers.name })
									.from(cpUsers)
									.where(inArray(cpUsers.id, userIds));
							} catch {
								return Promise.resolve([]);
							}
						})()
					: [],
			]);

			// Pick primary staff (lowest slotIndex) per appointment
			const primaryStaffByAppt = new Map<
				string,
				{ staffId: string; slotIndex: number }
			>();
			for (const row of staffAssignmentRows as {
				appointmentId: string;
				staffId: string;
				slotIndex: number;
			}[]) {
				const existing = primaryStaffByAppt.get(row.appointmentId);
				if (!existing || row.slotIndex < existing.slotIndex) {
					primaryStaffByAppt.set(row.appointmentId, {
						staffId: row.staffId,
						slotIndex: row.slotIndex,
					});
				}
			}

			// Resolve fallback trainer names. `appointmentStaff.staffId` is written
			// inconsistently by callers — POS sends member.userId, the appointment form
			// sends member.id. Look up both forms in one query and translate to member.id.
			const fallbackStaffIds = [
				...new Set([...primaryStaffByAppt.values()].map((v) => v.staffId)),
			];
			const memberRows =
				fallbackStaffIds.length > 0
					? await context.tenantDb
							.select({ id: members.id, userId: members.userId })
							.from(members)
							.where(
								or(
									inArray(members.id, fallbackStaffIds),
									inArray(members.userId, fallbackStaffIds),
								),
							)
					: [];
			const staffIdToMemberId = new Map<string, string>();
			for (const m of memberRows as { id: string; userId: string }[]) {
				staffIdToMemberId.set(m.id, m.id);
				staffIdToMemberId.set(m.userId, m.id);
			}

			const allTrainerMemberIds = [
				...new Set([
					...directTrainerIds,
					...([...primaryStaffByAppt.values()]
						.map((v) => staffIdToMemberId.get(v.staffId))
						.filter(Boolean) as string[]),
				]),
			];
			const profileRows =
				allTrainerMemberIds.length > 0
					? await context.tenantDb
							.select({
								memberId: memberProfiles.memberId,
								displayName: memberProfiles.displayName,
							})
							.from(memberProfiles)
							.where(inArray(memberProfiles.memberId, allTrainerMemberIds))
					: [];

			const serviceMap = new Map(
				(serviceRows as { id: string; name: string }[]).map((s) => [
					s.id,
					s.name,
				]),
			);
			const profileMap = new Map(
				(profileRows as { memberId: string; displayName: string | null }[]).map(
					(p) => [p.memberId, p.displayName],
				),
			);
			const userMap = new Map(
				(userRows as { id: string; name: string }[]).map((u) => [u.id, u.name]),
			);

			return items.map((r) => {
				// For virtual occurrences, staff is stored on the parent; look up by parentId
				const staffLookupId = isVirtualId(r.id) ? (r.parentId ?? r.id) : r.id;
				const fallback = primaryStaffByAppt.get(staffLookupId);
				const fallbackMemberId = fallback
					? staffIdToMemberId.get(fallback.staffId)
					: undefined;
				const trainerMemberId = r.trainerId ?? fallbackMemberId ?? null;
				return {
					...r,
					isVirtual: r.isVirtual,
					parentId: r.parentId,
					serviceName: r.serviceId
						? (serviceMap.get(r.serviceId) ?? null)
						: null,
					trainerName: trainerMemberId
						? (profileMap.get(trainerMemberId) ?? null)
						: null,
					// Prefer the denormalized snapshot; fall back to the live lookup for
					// legacy rows (|| so an empty snapshot also falls back, not blank).
					clientName:
						r.customerName ||
						(r.userId ? (userMap.get(r.userId) ?? null) : null),
				};
			});
		}),
};
