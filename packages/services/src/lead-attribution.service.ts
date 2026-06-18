/**
 * Lead Attribution Service
 *
 * Resolves GHL-captured lead ownership (customer_profiles.primary_staff_member_id)
 * into commission-ready staff assignments (members.userId + slotIndex).
 *
 * Convention: slot 0 = Sales / Lead coach, slot 1+ = delivery coaches.
 */

import { eq } from "drizzle-orm";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { packageInstanceStaff } from "@avantej-core/db/schema/tenant/package-instance-staff";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type StaffAssignment = { staffId: string; slotIndex: number };

export type LeadAttribution = {
	primaryStaffMemberId: string | null;
	primaryStaffUserId: string | null;
};

/** Look up lead owner for a registered customer (control-panel user id). */
export async function getLeadAttributionForCustomer(
	tenantDb: TenantDb,
	customerUserId: string | null | undefined,
): Promise<LeadAttribution> {
	const empty: LeadAttribution = {
		primaryStaffMemberId: null,
		primaryStaffUserId: null,
	};
	if (!customerUserId) return empty;

	const [profile] = await tenantDb
		.select({ primaryStaffMemberId: customerProfiles.primaryStaffMemberId })
		.from(customerProfiles)
		.where(eq(customerProfiles.userId, customerUserId))
		.limit(1);

	if (!profile?.primaryStaffMemberId) return empty;

	const [member] = await tenantDb
		.select({ userId: members.userId })
		.from(members)
		.where(eq(members.id, profile.primaryStaffMemberId))
		.limit(1);

	return {
		primaryStaffMemberId: profile.primaryStaffMemberId,
		primaryStaffUserId: member?.userId ?? null,
	};
}

/** Resolve tenant member PK → control-panel user id (commission staffId convention). */
export async function resolveMemberUserId(
	tenantDb: TenantDb,
	memberId: string | null | undefined,
): Promise<string | null> {
	if (!memberId) return null;
	const [row] = await tenantDb
		.select({ userId: members.userId })
		.from(members)
		.where(eq(members.id, memberId))
		.limit(1);
	return row?.userId ?? null;
}

/**
 * Merge lead owner into staff assignments without overriding explicit slot 0
 * when it already matches the lead coach. When slot 0 is occupied by a
 * different coach (typically delivery), lead takes slot 0 and prior slot 0
 * moves to slot 1.
 */
export function mergeLeadAttributionIntoStaffAssignments(
	assignments: StaffAssignment[],
	primaryStaffUserId: string | null,
): StaffAssignment[] {
	if (!primaryStaffUserId) return assignments;

	if (assignments.some((a) => a.staffId === primaryStaffUserId)) {
		return assignments;
	}

	if (assignments.length === 0) {
		return [{ staffId: primaryStaffUserId, slotIndex: 0 }];
	}

	const slot0 = assignments.find((a) => a.slotIndex === 0);
	if (!slot0) {
		const bumped = assignments.map((a) => ({
			staffId: a.staffId,
			slotIndex: a.slotIndex + 1,
		}));
		return [{ staffId: primaryStaffUserId, slotIndex: 0 }, ...bumped];
	}

	const rest = assignments
		.filter((a) => a.slotIndex !== 0)
		.sort((a, b) => a.slotIndex - b.slotIndex);

	const deliverySlot = rest.some((a) => a.slotIndex === 1)
		? Math.max(...rest.map((a) => a.slotIndex)) + 1
		: 1;

	return [
		{ staffId: primaryStaffUserId, slotIndex: 0 },
		{ staffId: slot0.staffId, slotIndex: deliverySlot },
		...rest.filter((a) => a.slotIndex !== deliverySlot),
	];
}

/** Per POS line item: merge attribution when no explicit staff was chosen. */
export function enrichPosItemTrainerAssignments(
	items: { type: string }[],
	input: Record<number, StaffAssignment[]> | undefined,
	primaryStaffUserId: string | null,
): Record<number, StaffAssignment[]> | undefined {
	if (!primaryStaffUserId) return input;

	const result: Record<number, StaffAssignment[]> = { ...input };

	for (let index = 0; index < items.length; index++) {
		const existing = result[index] ?? [];
		const hasExplicitStaff = existing.some((a) => a.staffId);
		if (hasExplicitStaff) {
			result[index] = mergeLeadAttributionIntoStaffAssignments(
				existing,
				primaryStaffUserId,
			);
		} else {
			result[index] = [{ staffId: primaryStaffUserId, slotIndex: 0 }];
		}
	}

	return Object.keys(result).length > 0 ? result : undefined;
}

/** Persist lead + delivery coaches on a package for deferred session commission. */
export async function writePackageInstanceLeadStaff(
	tenantDb: TenantDb,
	params: {
		packageInstanceId: string;
		customerUserId: string | null;
		preferredTrainerMemberId?: string | null;
		assignedBy: string;
	},
): Promise<void> {
	const attribution = await getLeadAttributionForCustomer(
		tenantDb,
		params.customerUserId,
	);
	const preferredUserId = await resolveMemberUserId(
		tenantDb,
		params.preferredTrainerMemberId,
	);

	const rows: { staffId: string; slotIndex: number; role: string }[] = [];
	if (attribution.primaryStaffUserId) {
		rows.push({
			staffId: attribution.primaryStaffUserId,
			slotIndex: 0,
			role: "lead",
		});
	}
	if (preferredUserId && preferredUserId !== attribution.primaryStaffUserId) {
		rows.push({
			staffId: preferredUserId,
			slotIndex: rows.length > 0 ? 1 : 0,
			role: "trainer",
		});
	}

	if (rows.length === 0) return;

	await tenantDb.insert(packageInstanceStaff).values(
		rows.map((row) => ({
			packageInstanceId: params.packageInstanceId,
			staffId: row.staffId,
			slotIndex: row.slotIndex,
			role: row.role,
			assignedBy: params.assignedBy,
		})),
	);
}
