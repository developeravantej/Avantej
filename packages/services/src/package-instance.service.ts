/**
 * Package Instance Service
 *
 * Handles package instance CRUD for tenant organizations.
 * Instances represent client assignments or purchases of packages.
 *
 * Usage:
 * ```typescript
 * import { listPackageInstancesForClient, createPackageInstance } from "@avantej-core/services";
 * const instances = await listPackageInstancesForClient(tenantDb, { clientId, status: "active" });
 * ```
 */

import { eq, and, asc, inArray, sql, or, lt, desc } from "drizzle-orm";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { packageInstanceStatusHistory } from "@avantej-core/db/schema/tenant/package-instance-status-history";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { user } from "@avantej-core/db/schema/auth";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { appendPackageInstanceStatusHistory } from "./status-history.helper";

type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;
type TenantDb = NeonDatabase<typeof tenantSchema>;

export type ListPackageInstancesForClientParams = {
  clientId: string;
  status?: string;
  source?: "assigned" | "purchased";
  limit?: number;
};

type ClientOwner =
	| { clientId: string; walkInCustomerId?: never }
	| { clientId?: never; walkInCustomerId: string };

export type CreatePackageInstanceParams = ClientOwner & {
  serviceId: string;
  source: "assigned" | "purchased";
  assignedBy?: string | null;
  purchaseNumber?: string | null;
  paymentId?: string | null;
  totalPrice?: number | null;
  taxAmount?: number;
  paymentStatus?: string;
  paymentMethod?: string | null;
  eSignature?: string | null;
  termsAgreedAt?: Date | null;
  creditsTotal: number;
  creditsUsed?: number;
  startsAt: Date;
  expiresAt: Date;
  status?: string;
  remark?: string | null;
  paymentPlanType?: string | null;
  installmentsTotal?: number;
  installmentsPaid?: number;
  creditsUnlocked?: number | null;
  preferredTrainerId?: string | null;
};

export type UpdatePackageInstanceParams = {
  paymentStatus?: string;
  paymentMethod?: string | null;
  creditsUsed?: number;
  creditsUnlocked?: number | null;
  installmentsPaid?: number;
  nextDueDate?: Date | null;
  gracePeriodEndsAt?: Date | null;
  isLocked?: boolean;
  lockedAt?: Date | null;
  lockedReason?: string | null;
  status?: string;
};

/**
 * List package instances for a client (user_id from Control Panel).
 */
export async function listPackageInstancesForClient(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: ListPackageInstancesForClientParams
): Promise<(typeof packageInstances.$inferSelect)[]> {
  const { clientId, status, source, limit = 50 } = params;

  const conditions = [eq(packageInstances.clientId, clientId)];
  if (status) {
    conditions.push(eq(packageInstances.status, status));
  }
  if (source) {
    conditions.push(eq(packageInstances.source, source));
  }

  return tenantDb.query.packageInstances.findMany({
    where: and(...conditions),
    orderBy: [asc(packageInstances.createdAt)],
    limit: Math.min(limit, 200),
  });
}

/**
 * Get a package instance by ID.
 */
export async function getPackageInstanceById(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  id: string
): Promise<(typeof packageInstances.$inferSelect) | null> {
  const row = await tenantDb.query.packageInstances.findFirst({
    where: eq(packageInstances.id, id),
  });
  return row ?? null;
}

/**
 * Create a package instance.
 */
export async function createPackageInstance(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: CreatePackageInstanceParams
): Promise<typeof packageInstances.$inferSelect> {
  const [row] = await tenantDb
    .insert(packageInstances)
    .values({
      serviceId: params.serviceId,
      clientId: params.clientId ?? null,
      walkInCustomerId: params.walkInCustomerId ?? null,
      source: params.source,
      assignedBy: params.assignedBy ?? null,
      purchaseNumber: params.purchaseNumber ?? null,
      paymentId: params.paymentId ?? null,
      totalPrice: params.totalPrice ?? null,
      taxAmount: params.taxAmount ?? 0,
      paymentStatus: params.paymentStatus ?? "pending",
      paymentMethod: params.paymentMethod ?? null,
      eSignature: params.eSignature ?? null,
      termsAgreedAt: params.termsAgreedAt ?? null,
      creditsTotal: params.creditsTotal,
      creditsUsed: params.creditsUsed ?? 0,
      startsAt: params.startsAt,
      expiresAt: params.expiresAt,
      status: params.status ?? "active",
      remark: params.remark ?? null,
      paymentPlanType: params.paymentPlanType ?? null,
      installmentsTotal: params.installmentsTotal ?? 1,
      installmentsPaid: params.installmentsPaid ?? 0,
      creditsUnlocked: params.creditsUnlocked ?? null,
      preferredTrainerId: params.preferredTrainerId ?? null,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create package instance");
  }
  return row;
}

// ----------------------------------------------------------------
// listMemberships — retention operator view
// ----------------------------------------------------------------

export type MembershipFilter =
	| "active"
	| "expiring_7d"
	| "expiring_30d"
	| "expired"
	| "frozen"
	| "all";

export interface MembershipRow {
	packageInstanceId: string;
	memberId: string; // members.id (for drawer drill-in)
	clientId: string; // members.userId
	clientName: string; // resolved cross-DB
	serviceId: string;
	serviceName: string;
	startsAt: Date;
	expiresAt: Date;
	status: string; // package_instances.status
	isLocked: boolean;
	lockedReason: string | null;
	creditsTotal: number;
	creditsRemaining: number; // generated col on table
	daysUntilExpiry: number | null; // null if expiresAt is null
	outstandingBalanceCents: number;
}

/**
 * List package instances for the retention / membership view.
 *
 * RBAC: scoped via `members.hierarchyScopeId` filtered through `accessibleNodeIds`.
 * Cross-DB enrichment: clientName batch-fetched from the control panel `user` table.
 *
 * Filter semantics:
 *   active       — status='active' AND expiresAt > NOW()
 *   expiring_7d  — status='active' AND expiresAt BETWEEN NOW() AND NOW() + 7 days
 *   expiring_30d — status='active' AND expiresAt BETWEEN NOW() AND NOW() + 30 days
 *   expired      — status='expired' OR expiresAt < NOW()
 *   frozen       — isLocked = TRUE (may overlap with active)
 *   all          — no additional predicate
 */
export async function listMemberships(
	controlPanelDb: ControlPanelDb,
	tenantDb: TenantDb,
	params: {
		filter: MembershipFilter;
		branchId?: string;
		serviceCategoryId?: string;
		accessibleNodeIds: string[];
		limit?: number;
		offset?: number;
	},
): Promise<{ rows: MembershipRow[]; total: number }> {
	const {
		filter,
		branchId,
		serviceCategoryId,
		accessibleNodeIds,
		limit = 100,
		offset = 0,
	} = params;

	if (accessibleNodeIds.length === 0) {
		return { rows: [], total: 0 };
	}

	// Build the accessible-node array literal (same pattern as customer-directory.service.ts:106)
	const nodeArrayLiteral = sql.raw(
		`ARRAY[${accessibleNodeIds.map((id) => `'${id}'`).join(",")}]::uuid[]`,
	);

	// Build per-filter predicate
	const filterPredicate = (() => {
		switch (filter) {
			case "active":
				return sql`pi.status = 'active' AND pi.expires_at > NOW()`;
			case "expiring_7d":
				return sql`pi.status = 'active' AND pi.expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'`;
			case "expiring_30d":
				return sql`pi.status = 'active' AND pi.expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days'`;
			case "expired":
				return sql`(pi.status = 'expired' OR pi.expires_at < NOW())`;
			case "frozen":
				return sql`pi.is_locked = TRUE`;
			case "all":
			default:
				return sql`TRUE`;
		}
	})();

	// Optional branch filter
	const branchPredicate = branchId
		? sql`AND m.hierarchy_scope_id = ${branchId}::uuid`
		: sql``;

	// Optional service category filter
	const categoryPredicate = serviceCategoryId
		? sql`AND s.category_id = ${serviceCategoryId}::uuid`
		: sql``;

	// ----------------------------------------------------------------
	// Step 1: fetch aggregated rows from tenant DB
	// ----------------------------------------------------------------
	const aggregationQuery = sql`
		SELECT
			pi.id                                                            AS package_instance_id,
			m.id                                                             AS member_id,
			pi.client_id                                                     AS client_id,
			pi.service_id                                                    AS service_id,
			pi.starts_at                                                     AS starts_at,
			pi.expires_at                                                    AS expires_at,
			pi.status                                                        AS status,
			pi.is_locked                                                     AS is_locked,
			pi.locked_reason                                                 AS locked_reason,
			pi.credits_total                                                 AS credits_total,
			pi.credits_remaining                                             AS credits_remaining,
			CASE
				WHEN pi.expires_at IS NULL THEN NULL
				ELSE EXTRACT(DAY FROM (pi.expires_at - NOW()))::int
			END                                                              AS days_until_expiry,
			s.name                                                           AS service_name,
			COALESCE(
				SUM(i.amount + COALESCE(i.tax_amount, 0))
				FILTER (WHERE i.status IN ('pending', 'overdue')), 0
			)::INTEGER                                                       AS outstanding_balance_cents,
			m.hierarchy_scope_id                                             AS hierarchy_scope_id
		FROM package_instances pi
		JOIN services s ON s.id = pi.service_id
		JOIN members m ON m.user_id = pi.client_id AND m.role = 'client'
		LEFT JOIN installments i ON i.package_instance_id = pi.id
		WHERE m.hierarchy_scope_id = ANY(${nodeArrayLiteral})
			${branchPredicate}
			${categoryPredicate}
			AND (${filterPredicate})
		GROUP BY pi.id, m.id, s.name, s.category_id, m.hierarchy_scope_id
		ORDER BY pi.expires_at ASC NULLS LAST
		LIMIT ${limit} OFFSET ${offset}
	`;

	const countQuery = sql`
		SELECT CAST(COUNT(*) AS INTEGER) AS total
		FROM package_instances pi
		JOIN services s ON s.id = pi.service_id
		JOIN members m ON m.user_id = pi.client_id AND m.role = 'client'
		WHERE m.hierarchy_scope_id = ANY(${nodeArrayLiteral})
			${branchPredicate}
			${categoryPredicate}
			AND (${filterPredicate})
	`;

	const [aggregationResult, countResult] = await Promise.all([
		tenantDb.execute(aggregationQuery),
		tenantDb.execute(countQuery),
	]);

	type TenantRow = {
		package_instance_id: string;
		member_id: string;
		client_id: string;
		service_id: string;
		starts_at: Date;
		expires_at: Date;
		status: string;
		is_locked: boolean;
		locked_reason: string | null;
		credits_total: number;
		credits_remaining: number;
		days_until_expiry: number | null;
		service_name: string;
		outstanding_balance_cents: number;
		hierarchy_scope_id: string;
	};

	const tenantRows = aggregationResult.rows as TenantRow[];
	const total = (countResult.rows[0] as { total: number })?.total ?? 0;

	if (tenantRows.length === 0) {
		return { rows: [], total };
	}

	// ----------------------------------------------------------------
	// Step 2: cross-DB batch lookup for clientName
	// ----------------------------------------------------------------
	const clientIds = [...new Set(tenantRows.map((r) => r.client_id))];
	const userRows = await controlPanelDb
		.select({ id: user.id, name: user.name })
		.from(user)
		.where(inArray(user.id, clientIds));

	const userMap = new Map(userRows.map((u) => [u.id, u.name]));

	// ----------------------------------------------------------------
	// Step 3: merge
	// ----------------------------------------------------------------
	const rows: MembershipRow[] = tenantRows.map((r) => ({
		packageInstanceId: r.package_instance_id,
		memberId: r.member_id,
		clientId: r.client_id,
		clientName: userMap.get(r.client_id) ?? "Unknown",
		serviceId: r.service_id,
		serviceName: r.service_name,
		startsAt: r.starts_at,
		expiresAt: r.expires_at,
		status: r.status,
		isLocked: r.is_locked,
		lockedReason: r.locked_reason,
		creditsTotal: r.credits_total,
		creditsRemaining: r.credits_remaining,
		daysUntilExpiry: r.days_until_expiry,
		outstandingBalanceCents: r.outstanding_balance_cents,
	}));

	return { rows, total };
}

/**
 * Update a package instance by ID. Only provided fields are updated.
 */
export async function updatePackageInstance(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  id: string,
  params: UpdatePackageInstanceParams,
  actor?: { userId: string; reason?: string; notes?: string },
): Promise<typeof packageInstances.$inferSelect> {
  // Capture prior status for history if status is changing.
  let previousStatus: string | null = null;
  if (params.status !== undefined) {
    const [existing] = await tenantDb
      .select({ status: packageInstances.status })
      .from(packageInstances)
      .where(eq(packageInstances.id, id));
    previousStatus = existing?.status ?? null;
  }

  const [row] = await tenantDb
    .update(packageInstances)
    .set({
      ...(params.paymentStatus !== undefined && { paymentStatus: params.paymentStatus }),
      ...(params.paymentMethod !== undefined && { paymentMethod: params.paymentMethod }),
      ...(params.creditsUsed !== undefined && { creditsUsed: params.creditsUsed }),
      ...(params.creditsUnlocked !== undefined && { creditsUnlocked: params.creditsUnlocked }),
      ...(params.installmentsPaid !== undefined && { installmentsPaid: params.installmentsPaid }),
      ...(params.nextDueDate !== undefined && { nextDueDate: params.nextDueDate }),
      ...(params.gracePeriodEndsAt !== undefined && { gracePeriodEndsAt: params.gracePeriodEndsAt }),
      ...(params.isLocked !== undefined && { isLocked: params.isLocked }),
      ...(params.lockedAt !== undefined && { lockedAt: params.lockedAt }),
      ...(params.lockedReason !== undefined && { lockedReason: params.lockedReason }),
      ...(params.status !== undefined && { status: params.status }),
      updatedAt: new Date(),
    })
    .where(eq(packageInstances.id, id))
    .returning();

  if (!row) {
    throw new Error("Package instance not found");
  }

  // Append status history if status actually changed.
  if (params.status !== undefined && params.status !== previousStatus) {
    await appendPackageInstanceStatusHistory(tenantDb, id, {
      fromStatus: previousStatus,
      toStatus: params.status,
      changedBy: actor?.userId ?? "system",
      reason: actor?.reason,
      notes: actor?.notes,
    });
  }
  return row;
}

export type PackageInstanceHistoryQueryOpts = {
	parsedCursor: { changedAt: Date; id: string } | null;
	limit: number;
};

export async function getPackageInstanceStatusHistory(
	tenantDb: TenantDb,
	packageInstanceId: string,
	{ parsedCursor, limit }: PackageInstanceHistoryQueryOpts,
) {
	return tenantDb
		.select()
		.from(packageInstanceStatusHistory)
		.where(
			and(
				eq(packageInstanceStatusHistory.packageInstanceId, packageInstanceId),
				parsedCursor
					? or(
							lt(packageInstanceStatusHistory.changedAt, parsedCursor.changedAt),
							and(
								eq(packageInstanceStatusHistory.changedAt, parsedCursor.changedAt),
								lt(packageInstanceStatusHistory.id, parsedCursor.id),
							),
						)
					: undefined,
			),
		)
		.orderBy(
			desc(packageInstanceStatusHistory.changedAt),
			desc(packageInstanceStatusHistory.id),
		)
		.limit(limit + 1);
}
