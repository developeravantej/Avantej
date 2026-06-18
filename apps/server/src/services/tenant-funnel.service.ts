/**
 * Plan E E.4 — Tenant Activation Funnel.
 *
 * Computes the 7-step activation funnel for a single tenant by querying
 * the tenant DB + control-panel. On-demand (no precomputation), so the
 * drill-in Funnel tab always shows fresh state.
 *
 * Milestones (ADR-0025):
 *   1. email_verified        — owner user.email_verified = true
 *   2. hierarchy_seeded      — at least one hierarchy_nodes row
 *   3. first_member          — at least one members row
 *   4. first_customer        — at least one customer_profiles row
 *   5. ghl_connected         — organizations.ghl_provisioned_at non-null
 *   6. first_appointment     — at least one appointments row
 *   7. first_payment         — at least one payments status=succeeded
 *
 * "reachedAt" = MIN(created_at) of the qualifying row, so the funnel
 * also tells us *when* a milestone was hit.
 */

import { eq, sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { users } from "@avantej-core/db/schema/control-panel/users";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { payments } from "@avantej-core/db/schema/tenant/payments";

export type MilestoneId =
	| "email_verified"
	| "hierarchy_seeded"
	| "first_member"
	| "first_customer"
	| "ghl_connected"
	| "first_appointment"
	| "first_payment";

export interface Milestone {
	id: MilestoneId;
	label: string;
	reached: boolean;
	reachedAt: Date | null;
}

export const MILESTONE_ORDER: ReadonlyArray<{
	id: MilestoneId;
	label: string;
}> = [
	{ id: "email_verified", label: "Owner email verified" },
	{ id: "hierarchy_seeded", label: "Hierarchy seeded" },
	{ id: "first_member", label: "First member" },
	{ id: "first_customer", label: "First customer" },
	{ id: "ghl_connected", label: "GHL connected" },
	{ id: "first_appointment", label: "First appointment" },
	{ id: "first_payment", label: "First payment" },
];

export interface FunnelReport {
	organizationId: string;
	milestones: Milestone[];
	stuckAt: MilestoneId | null; // first unreached milestone in order
	completed: number;
	total: number;
}

interface FunnelDeps {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	tenantDb: NeonDatabase<typeof tenantSchema>;
}

async function minTimestamp(
	db: NeonDatabase<typeof tenantSchema>,
	table: any,
	col: any,
): Promise<Date | null> {
	const [row] = (await db
		.select({ min: sql<Date | null>`MIN(${col})` })
		.from(table)) as [{ min: Date | null }];
	return row?.min ?? null;
}

export async function computeTenantFunnel(
	organizationId: string,
	deps: FunnelDeps,
): Promise<FunnelReport> {
	const [org] = await deps.controlPanelDb
		.select({
			id: organizations.id,
			ownerUserId: organizations.ownerUserId,
			ghlProvisionedAt: organizations.ghlProvisionedAt,
		})
		.from(organizations)
		.where(eq(organizations.id, organizationId));

	if (!org) {
		throw new Error(`Organization not found: ${organizationId}`);
	}

	// 1. Email verified — owner user only.
	let emailVerifiedAt: Date | null = null;
	let emailVerified = false;
	if (org.ownerUserId) {
		const [owner] = await deps.controlPanelDb
			.select({
				emailVerified: users.emailVerified,
				createdAt: users.createdAt,
			})
			.from(users)
			.where(eq(users.id, org.ownerUserId));
		emailVerified = owner?.emailVerified ?? false;
		// Better-Auth doesn't track verification timestamp; fall back to
		// user.createdAt as a rough lower bound when verified.
		emailVerifiedAt = emailVerified ? (owner?.createdAt ?? null) : null;
	}

	// 2-7. Tenant DB lookups in parallel.
	const [hierarchyAt, memberAt, customerAt, apptAt, paymentAt] =
		await Promise.all([
			minTimestamp(deps.tenantDb, hierarchyNodes, hierarchyNodes.createdAt),
			minTimestamp(deps.tenantDb, members, members.joinedAt),
			minTimestamp(deps.tenantDb, customerProfiles, customerProfiles.createdAt),
			minTimestamp(deps.tenantDb, appointments, appointments.createdAt),
			(async () => {
				const [row] = (await deps.tenantDb
					.select({ min: sql<Date | null>`MIN(${payments.createdAt})` })
					.from(payments)
					.where(eq(payments.status, "succeeded"))) as [{ min: Date | null }];
				return row?.min ?? null;
			})(),
		]);

	const milestonesMap: Record<MilestoneId, Date | null | boolean> = {
		email_verified: emailVerifiedAt ?? emailVerified,
		hierarchy_seeded: hierarchyAt,
		first_member: memberAt,
		first_customer: customerAt,
		ghl_connected: org.ghlProvisionedAt,
		first_appointment: apptAt,
		first_payment: paymentAt,
	};

	const milestones: Milestone[] = MILESTONE_ORDER.map(({ id, label }) => {
		const v = milestonesMap[id];
		const reachedAt = v instanceof Date ? v : null;
		const reached = v instanceof Date ? true : !!v;
		return { id, label, reached, reachedAt };
	});

	const stuckAt = milestones.find((m) => !m.reached)?.id ?? null;
	const completed = milestones.filter((m) => m.reached).length;

	return {
		organizationId,
		milestones,
		stuckAt,
		completed,
		total: milestones.length,
	};
}
