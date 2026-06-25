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

import {
	eq,
	and,
	asc,
	inArray,
	sql,
	or,
	lt,
	lte,
	desc,
	isNotNull,
} from "drizzle-orm";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertUuids(ids: string[], label: string): void {
	for (const id of ids) {
		if (!UUID_RE.test(id)) throw new Error(`Invalid UUID in ${label}: ${id}`);
	}
}
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { packageInstanceStatusHistory } from "@avantej-core/db/schema/tenant/package-instance-status-history";
import { services } from "@avantej-core/db/schema/tenant/services";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { user } from "@avantej-core/db/schema/auth";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { appendPackageInstanceStatusHistory } from "./status-history.helper";
import { writeAudit } from "./audit-log.service";

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
	/** Denormalized customer name snapshot, resolved cross-DB by the caller at create time. */
	customerName?: string | null;
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
	/** Reconciliation FK added by migration 0051 — populate when originating from a sales order. */
	salesOrderId?: string | null;
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
	params: ListPackageInstancesForClientParams,
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
		// Pinned packages first, then oldest-first as legacy tiebreaker. Postgres
		// defaults DESC to NULLS FIRST, which would float unpinned rows to the top
		// — force NULLS LAST so the single pinned row leads.
		orderBy: [
			sql`${packageInstances.pinnedAt} desc nulls last`,
			asc(packageInstances.createdAt),
		],
		limit: Math.min(limit, 200),
	});
}

/**
 * Toggle the customer pin on a package instance.
 *
 * Invariant: at most one pinned package per client at any time. Enforced by
 * a partial unique index on (client_id) WHERE pinned_at IS NOT NULL, with
 * this transaction as the primary guard.
 *
 * Behavior:
 *   - If the target row is already pinned → unpin it (set pinned_at = NULL).
 *   - Else → clear any other pinned rows for this client, then pin the target.
 *
 * Throws:
 *   - "Package not found" — id does not exist.
 *   - "Forbidden — not your package" — caller is not the owner.
 *   - "Only active packages can be pinned" — status !== "active".
 */
export async function togglePackagePin(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: { packageInstanceId: string; clientId: string },
): Promise<{ id: string; pinnedAt: Date | null }> {
	return tenantDb.transaction(async (tx) => {
		const [pkg] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, params.packageInstanceId))
			.for("update");

		if (!pkg) throw new Error("Package not found");
		if (pkg.clientId !== params.clientId)
			throw new Error("Forbidden — not your package");
		if (pkg.status !== "active")
			throw new Error("Only active packages can be pinned");

		if (pkg.pinnedAt) {
			const [row] = await tx
				.update(packageInstances)
				.set({ pinnedAt: null, updatedAt: new Date() })
				.where(eq(packageInstances.id, pkg.id))
				.returning({
					id: packageInstances.id,
					pinnedAt: packageInstances.pinnedAt,
				});
			if (!row) throw new Error("Failed to unpin package");
			return row;
		}

		// Clear any existing pin on other packages for this client first,
		// then pin the target. Both inside the same tx → atomic.
		await tx
			.update(packageInstances)
			.set({ pinnedAt: null, updatedAt: new Date() })
			.where(
				and(
					eq(packageInstances.clientId, params.clientId),
					isNotNull(packageInstances.pinnedAt),
				),
			);

		const now = new Date();
		const [row] = await tx
			.update(packageInstances)
			.set({ pinnedAt: now, updatedAt: now })
			.where(eq(packageInstances.id, pkg.id))
			.returning({
				id: packageInstances.id,
				pinnedAt: packageInstances.pinnedAt,
			});

		if (!row) throw new Error("Failed to pin package");
		return row;
	});
}

/**
 * Get a package instance by ID.
 */
export async function getPackageInstanceById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<typeof packageInstances.$inferSelect | null> {
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
	params: CreatePackageInstanceParams,
): Promise<typeof packageInstances.$inferSelect> {
	const [row] = await tenantDb
		.insert(packageInstances)
		.values({
			serviceId: params.serviceId,
			clientId: params.clientId ?? null,
			walkInCustomerId: params.walkInCustomerId ?? null,
			customerName: params.customerName ?? null,
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
			salesOrderId: params.salesOrderId ?? null,
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

	assertUuids(accessibleNodeIds, "listMemberships");

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
			pi.customer_name                                                 AS customer_name,
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
		customer_name: string | null;
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
	// Step 2: cross-DB batch lookup for clientName.
	// Read-scaling: only look up LEGACY rows missing the denormalized snapshot.
	// ----------------------------------------------------------------
	const clientIds = [
		...new Set(
			tenantRows.filter((r) => !r.customer_name).map((r) => r.client_id),
		),
	];
	const userRows =
		clientIds.length > 0
			? await controlPanelDb
					.select({ id: user.id, name: user.name })
					.from(user)
					.where(inArray(user.id, clientIds))
			: [];

	const userMap = new Map(userRows.map((u) => [u.id, u.name]));

	// ----------------------------------------------------------------
	// Step 3: merge
	// ----------------------------------------------------------------
	const rows: MembershipRow[] = tenantRows.map((r) => ({
		packageInstanceId: r.package_instance_id,
		memberId: r.member_id,
		clientId: r.client_id,
		clientName: r.customer_name || userMap.get(r.client_id) || "Unknown",
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
 * List all package instances for the org, scoped to the owning member's
 * hierarchy_scope_id ∈ accessibleNodeIds. package_instances has no branchId;
 * scope is the owning client member (mirrors listMemberships).
 */
export async function listAllPackageInstances(
	controlPanelDb: ControlPanelDb,
	tenantDb: TenantDb,
	params: {
		accessibleNodeIds: string[];
		clientId?: string;
		status?: string;
		source?: string;
		limit?: number;
	},
): Promise<Array<Record<string, unknown> & { clientName: string | null }>> {
	const { accessibleNodeIds, clientId, status, source, limit = 100 } = params;

	if (accessibleNodeIds.length === 0) return [];
	assertUuids(accessibleNodeIds, "listAllPackageInstances");

	const nodeArrayLiteral = sql.raw(
		`ARRAY[${accessibleNodeIds.map((id) => `'${id}'`).join(",")}]::uuid[]`,
	);
	const clientPredicate = clientId
		? sql`AND pi.client_id = ${clientId}`
		: sql``;
	const statusPredicate = status ? sql`AND pi.status = ${status}` : sql``;
	const sourcePredicate = source ? sql`AND pi.source = ${source}` : sql``;

	const result = await tenantDb.execute(sql`
		SELECT pi.*, m.hierarchy_scope_id AS hierarchy_scope_id
		FROM package_instances pi
		JOIN members m ON m.user_id = pi.client_id AND m.role = 'client'
		WHERE m.hierarchy_scope_id = ANY(${nodeArrayLiteral})
			${clientPredicate}
			${statusPredicate}
			${sourcePredicate}
		ORDER BY pi.created_at DESC
		LIMIT ${limit}
	`);
	const rows = result.rows as Array<Record<string, unknown>>;

	const clientIds = [
		...new Set(
			rows
				.map((r) => r.client_id as string | null)
				.filter((id): id is string => id != null),
		),
	];
	const userRows =
		clientIds.length > 0
			? await controlPanelDb
					.select({ id: user.id, name: user.name })
					.from(user)
					.where(inArray(user.id, clientIds))
			: [];
	const userMap = new Map(userRows.map((u) => [u.id, u.name]));

	return rows.map((r) => ({
		...r,
		clientName: r.client_id
			? (userMap.get(r.client_id as string) ?? null)
			: null,
	}));
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
			...(params.paymentStatus !== undefined && {
				paymentStatus: params.paymentStatus,
			}),
			...(params.paymentMethod !== undefined && {
				paymentMethod: params.paymentMethod,
			}),
			...(params.creditsUsed !== undefined && {
				creditsUsed: params.creditsUsed,
			}),
			...(params.creditsUnlocked !== undefined && {
				creditsUnlocked: params.creditsUnlocked,
			}),
			...(params.installmentsPaid !== undefined && {
				installmentsPaid: params.installmentsPaid,
			}),
			...(params.nextDueDate !== undefined && {
				nextDueDate: params.nextDueDate,
			}),
			...(params.gracePeriodEndsAt !== undefined && {
				gracePeriodEndsAt: params.gracePeriodEndsAt,
			}),
			...(params.isLocked !== undefined && { isLocked: params.isLocked }),
			...(params.lockedAt !== undefined && { lockedAt: params.lockedAt }),
			...(params.lockedReason !== undefined && {
				lockedReason: params.lockedReason,
			}),
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
							lt(
								packageInstanceStatusHistory.changedAt,
								parsedCursor.changedAt,
							),
							and(
								eq(
									packageInstanceStatusHistory.changedAt,
									parsedCursor.changedAt,
								),
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

// ----------------------------------------------------------------
// listAssignedToMember — trainer's own assigned packages view
// ----------------------------------------------------------------

export interface AssignedPackageRow {
	id: string;
	clientId: string | null;
	serviceId: string;
	serviceName: string | null;
	clientDisplayName: string | null;
	clientEmail: string | null;
	status: string;
	creditsRemaining: number;
	creditsTotal: number;
	nextDueDate: Date | null;
	startsAt: Date;
	expiresAt: Date;
	createdAt: Date;
}

export type ListAssignedToMemberParams = {
	memberId: string;
	/** "active" | "frozen" → filter by that status; "all" → no status filter */
	status?: "active" | "frozen" | "all";
	cursor?: { createdAt: Date; id: string } | null;
	limit?: number;
};

/**
 * List package instances assigned to a specific trainer member.
 *
 * Scoped to assignedTrainerId = memberId. Names are batch-hydrated from
 * the control-panel user table to avoid N+1 queries.
 *
 * Index: package_instances_assigned_trainer_status_idx (assigned_trainer_id, status)
 * — added in migration 0051_sales_pipeline_fixes.
 */
export async function listAssignedToMember(
	controlPanelDb: ControlPanelDb,
	tenantDb: TenantDb,
	params: ListAssignedToMemberParams,
): Promise<AssignedPackageRow[]> {
	const { memberId, status = "active", cursor = null, limit = 50 } = params;

	// Status predicate: default shows active+frozen; "all" shows everything.
	const statusCondition = (() => {
		if (status === "active") return eq(packageInstances.status, "active");
		if (status === "frozen") return eq(packageInstances.status, "frozen");
		return undefined; // "all" — no filter
	})();

	// Cursor: (createdAt DESC, id DESC) — same shape as status-history.
	const cursorCondition = cursor
		? or(
				lt(packageInstances.createdAt, cursor.createdAt),
				and(
					eq(packageInstances.createdAt, cursor.createdAt),
					lt(packageInstances.id, cursor.id),
				),
			)
		: undefined;

	const rows = await tenantDb
		.select({
			id: packageInstances.id,
			clientId: packageInstances.clientId,
			customerName: packageInstances.customerName,
			serviceId: packageInstances.serviceId,
			status: packageInstances.status,
			creditsRemaining: packageInstances.creditsRemaining,
			creditsTotal: packageInstances.creditsTotal,
			nextDueDate: packageInstances.nextDueDate,
			startsAt: packageInstances.startsAt,
			expiresAt: packageInstances.expiresAt,
			createdAt: packageInstances.createdAt,
			serviceName: services.name,
		})
		.from(packageInstances)
		.leftJoin(services, eq(packageInstances.serviceId, services.id))
		.where(
			and(
				eq(packageInstances.assignedTrainerId, memberId),
				statusCondition,
				cursorCondition,
			),
		)
		.orderBy(desc(packageInstances.createdAt), desc(packageInstances.id))
		.limit(limit);

	if (rows.length === 0) return [];

	// Batch-hydrate client display names from control-panel user table.
	const clientIds = [
		...new Set(rows.map((r) => r.clientId).filter((id): id is string => !!id)),
	];

	let clientMap = new Map<string, { name: string; email: string }>();
	if (clientIds.length > 0) {
		const userRows = await controlPanelDb
			.select({ id: user.id, name: user.name, email: user.email })
			.from(user)
			.where(inArray(user.id, clientIds));
		clientMap = new Map(
			userRows.map((u) => [u.id, { name: u.name, email: u.email }]),
		);
	}

	return rows.map((r) => ({
		...r,
		// Prefer the denormalized snapshot; fall back to the live lookup for legacy
		// rows (|| so an empty snapshot also falls back, not blank).
		clientDisplayName:
			r.customerName ||
			(r.clientId ? (clientMap.get(r.clientId)?.name ?? null) : null),
		clientEmail: r.clientId ? (clientMap.get(r.clientId)?.email ?? null) : null,
	}));
}

// ---------------------------------------------------------------------------
// Phase 5 — package lifecycle mutations (cancel / freeze / unfreeze / extend)
// ---------------------------------------------------------------------------

// Drizzle transaction type (structural compatibility, no circular import)
// biome-ignore lint/suspicious/noExplicitAny: tx type is internal to Drizzle
type TenantTx = any;

export type CancelPackageInstanceParams = {
	id: string;
	actorUserId: string;
	actorMemberId?: string;
	actorRole?: string;
	reason: string;
};

/**
 * Cancel a package instance.
 *
 * Idempotency: if already `cancelled`, throws CONFLICT so the caller can
 * detect and surface a friendly "already cancelled" message rather than
 * silently no-op'ing (which would hide double-submission bugs).
 *
 * Branch-scope check is the caller's (router's) responsibility.
 */
export async function cancelPackageInstance(
	tenantDb: TenantDb,
	params: CancelPackageInstanceParams,
): Promise<{ id: string; status: "cancelled" }> {
	return tenantDb.transaction(async (tx: TenantTx) => {
		const [pkg] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, params.id))
			.for("update");

		if (!pkg) {
			throw Object.assign(new Error("Package instance not found"), {
				code: "NOT_FOUND",
			});
		}
		if (pkg.status === "cancelled") {
			throw Object.assign(new Error("Package is already cancelled"), {
				code: "CONFLICT",
			});
		}

		const now = new Date();
		const previousStatus = pkg.status;

		// LC-C1: cancel outstanding instalment rows before marking package cancelled
		await tx
			.update(installments)
			.set({ status: "cancelled", updatedAt: now })
			.where(
				and(
					eq(installments.packageInstanceId, params.id),
					inArray(installments.status, ["pending", "overdue"]),
				),
			);

		await tx
			.update(packageInstances)
			.set({
				status: "cancelled",
				cancellationReason: params.reason,
				cancelledBy: params.actorUserId,
				nextDueDate: null,
				gracePeriodEndsAt: null,
				isLocked: false,
				updatedAt: now,
			})
			.where(eq(packageInstances.id, params.id));

		await appendPackageInstanceStatusHistory(tx, params.id, {
			fromStatus: previousStatus,
			toStatus: "cancelled",
			changedBy: params.actorUserId,
			reason: params.reason,
		});

		await writeAudit(tx, {
			actorUserId: params.actorUserId,
			actorMemberId: params.actorMemberId,
			actorRole: params.actorRole,
			action: "package.cancelled",
			entityType: "package_instance",
			entityId: params.id,
			summary: `Package instance ${params.id} cancelled: ${params.reason}`,
			changes: { previousStatus, reason: params.reason },
		});

		return { id: params.id, status: "cancelled" as const };
	});
}

export type FreezePackageInstanceParams = {
	id: string;
	actorUserId: string;
	actorMemberId?: string;
	actorRole?: string;
	until?: Date;
	reason: string;
};

/**
 * Freeze an active package instance.
 *
 * Only `active` packages may be frozen. Idempotent guard: already-frozen
 * throws BAD_REQUEST (not CONFLICT) — it is a caller logic error, not a
 * race condition.
 */
export async function freezePackageInstance(
	tenantDb: TenantDb,
	params: FreezePackageInstanceParams,
): Promise<{ id: string; status: "frozen"; frozenUntil: Date | null }> {
	return tenantDb.transaction(async (tx: TenantTx) => {
		const [pkg] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, params.id))
			.for("update");

		if (!pkg) {
			throw Object.assign(new Error("Package instance not found"), {
				code: "NOT_FOUND",
			});
		}
		if (pkg.status !== "active") {
			throw Object.assign(
				new Error(
					`Only active packages can be frozen (current status: ${pkg.status})`,
				),
				{ code: "BAD_REQUEST" },
			);
		}

		const now = new Date();
		const frozenUntil = params.until ?? null;

		await tx
			.update(packageInstances)
			.set({
				status: "frozen",
				frozenUntil,
				updatedAt: now,
			})
			.where(eq(packageInstances.id, params.id));

		await appendPackageInstanceStatusHistory(tx, params.id, {
			fromStatus: "active",
			toStatus: "frozen",
			changedBy: params.actorUserId,
			reason: params.reason,
			notes: frozenUntil
				? `Frozen until ${frozenUntil.toISOString()}`
				: undefined,
		});

		await writeAudit(tx, {
			actorUserId: params.actorUserId,
			actorMemberId: params.actorMemberId,
			actorRole: params.actorRole,
			action: "package.frozen",
			entityType: "package_instance",
			entityId: params.id,
			summary: `Package instance ${params.id} frozen${frozenUntil ? ` until ${frozenUntil.toISOString()}` : ""}`,
			changes: {
				frozenUntil: frozenUntil?.toISOString() ?? null,
				reason: params.reason,
			},
		});

		return { id: params.id, status: "frozen" as const, frozenUntil };
	});
}

export type UnfreezePackageInstanceParams = {
	id: string;
	actorUserId: string;
	actorMemberId?: string;
	actorRole?: string;
};

/**
 * Unfreeze a frozen package instance, returning it to `active`.
 */
export async function unfreezePackageInstance(
	tenantDb: TenantDb,
	params: UnfreezePackageInstanceParams,
): Promise<{ id: string; status: "active" }> {
	return tenantDb.transaction(async (tx: TenantTx) => {
		const [pkg] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, params.id))
			.for("update");

		if (!pkg) {
			throw Object.assign(new Error("Package instance not found"), {
				code: "NOT_FOUND",
			});
		}
		if (pkg.status !== "frozen") {
			throw Object.assign(
				new Error(`Package is not frozen (current status: ${pkg.status})`),
				{ code: "BAD_REQUEST" },
			);
		}

		const now = new Date();

		await tx
			.update(packageInstances)
			.set({
				status: "active",
				frozenUntil: null,
				updatedAt: now,
			})
			.where(eq(packageInstances.id, params.id));

		await appendPackageInstanceStatusHistory(tx, params.id, {
			fromStatus: "frozen",
			toStatus: "active",
			changedBy: params.actorUserId,
		});

		await writeAudit(tx, {
			actorUserId: params.actorUserId,
			actorMemberId: params.actorMemberId,
			actorRole: params.actorRole,
			action: "package.unfrozen",
			entityType: "package_instance",
			entityId: params.id,
			summary: `Package instance ${params.id} unfrozen`,
			changes: {},
		});

		return { id: params.id, status: "active" as const };
	});
}

export type ExtendPackageInstanceParams = {
	id: string;
	actorUserId: string;
	actorMemberId?: string;
	actorRole?: string;
	/** Number of calendar days to add. Must be 1–365. */
	addDays: number;
	reason: string;
};

/**
 * Extend a package instance's `expiresAt` by the given number of days.
 *
 * Terminal statuses (cancelled / expired / completed) are rejected.
 * Packages with a null `expiresAt` (non-expirable) are also rejected —
 * they have no expiry to extend.
 */
export async function extendPackageInstance(
	tenantDb: TenantDb,
	params: ExtendPackageInstanceParams,
): Promise<{ id: string; expiresAt: Date }> {
	return tenantDb.transaction(async (tx: TenantTx) => {
		const [pkg] = await tx
			.select()
			.from(packageInstances)
			.where(eq(packageInstances.id, params.id))
			.for("update");

		if (!pkg) {
			throw Object.assign(new Error("Package instance not found"), {
				code: "NOT_FOUND",
			});
		}

		const terminalStatuses = ["cancelled", "expired", "completed"];
		if (terminalStatuses.includes(pkg.status)) {
			throw Object.assign(new Error(`Cannot extend a ${pkg.status} package`), {
				code: "BAD_REQUEST",
			});
		}

		if (!pkg.expiresAt) {
			throw Object.assign(
				new Error("Cannot extend a non-expirable package (expiresAt is null)"),
				{ code: "BAD_REQUEST" },
			);
		}

		const newExpiresAt = new Date(
			pkg.expiresAt.getTime() + params.addDays * 24 * 60 * 60 * 1000,
		);
		const now = new Date();

		await tx
			.update(packageInstances)
			.set({
				expiresAt: newExpiresAt,
				updatedAt: now,
			})
			.where(eq(packageInstances.id, params.id));

		await appendPackageInstanceStatusHistory(tx, params.id, {
			fromStatus: pkg.status,
			toStatus: pkg.status, // status unchanged — history row records the extension event
			changedBy: params.actorUserId,
			reason: params.reason,
			notes: `Extended by ${params.addDays} day(s); new expiresAt: ${newExpiresAt.toISOString()}`,
		});

		await writeAudit(tx, {
			actorUserId: params.actorUserId,
			actorMemberId: params.actorMemberId,
			actorRole: params.actorRole,
			action: "package.extended",
			entityType: "package_instance",
			entityId: params.id,
			summary: `Package instance ${params.id} extended by ${params.addDays} day(s)`,
			changes: {
				previousExpiresAt: pkg.expiresAt.toISOString(),
				newExpiresAt: newExpiresAt.toISOString(),
				addDays: params.addDays,
				reason: params.reason,
			},
		});

		return { id: params.id, expiresAt: newExpiresAt };
	});
}

/**
 * Mark a package instance as `completed` if all delivery conditions are met.
 *
 * Completion conditions (both must hold):
 *   1. installmentsPaid >= installmentsTotal
 *   2. creditsRemaining <= 0  (generated column: creditsUnlocked ?? creditsTotal - creditsUsed)
 *
 * Only transitions `active` or `frozen` packages — all other statuses are left alone.
 * Safe to call repeatedly (idempotent by design).
 *
 * Call sites:
 *   - installment.service.ts → confirmInstallmentPayment (after credit-unlock)
 *   - check-ins.service.ts   → after creditsUsed increment
 */
export async function markCompleteIfFinal(
	tenantDb: TenantDb,
	instanceId: string,
): Promise<void> {
	// Read outside tx first — if conditions clearly not met we skip the tx overhead.
	const [pkg] = await tenantDb
		.select({
			id: packageInstances.id,
			status: packageInstances.status,
			installmentsPaid: packageInstances.installmentsPaid,
			installmentsTotal: packageInstances.installmentsTotal,
			creditsRemaining: packageInstances.creditsRemaining,
		})
		.from(packageInstances)
		.where(eq(packageInstances.id, instanceId));

	if (!pkg) return; // Deleted concurrently — safe to ignore
	if (pkg.status !== "active" && pkg.status !== "frozen") return;
	if (pkg.installmentsPaid < pkg.installmentsTotal) return;
	if (pkg.creditsRemaining > 0) return;

	// Conditions met — acquire row lock and re-check inside tx to prevent races.
	await tenantDb.transaction(async (tx: TenantTx) => {
		const [locked] = await tx
			.select({
				id: packageInstances.id,
				status: packageInstances.status,
				installmentsPaid: packageInstances.installmentsPaid,
				installmentsTotal: packageInstances.installmentsTotal,
				creditsRemaining: packageInstances.creditsRemaining,
			})
			.from(packageInstances)
			.where(eq(packageInstances.id, instanceId))
			.for("update");

		if (!locked) return;
		if (locked.status !== "active" && locked.status !== "frozen") return;
		if (locked.installmentsPaid < locked.installmentsTotal) return;
		if (locked.creditsRemaining > 0) return;

		const now = new Date();
		await tx
			.update(packageInstances)
			.set({ status: "completed", updatedAt: now })
			.where(eq(packageInstances.id, instanceId));

		await appendPackageInstanceStatusHistory(tx, instanceId, {
			fromStatus: locked.status,
			toStatus: "completed",
			changedBy: "system",
			reason: "All installments paid and credits exhausted",
		});

		await writeAudit(tx, {
			actorUserId: "system",
			action: "package.completed",
			entityType: "package_instance",
			entityId: instanceId,
			summary: `Package instance ${instanceId} automatically completed`,
			changes: {
				installmentsPaid: locked.installmentsPaid,
				installmentsTotal: locked.installmentsTotal,
			},
		});
	});
}

/**
 * Transition overdue active package instances to 'expired'.
 *
 * Idempotent: a single conditional UPDATE flips rows where the package is
 * still `active` and its `expiresAt` is on-or-before `now`. Frozen and any
 * already-terminal statuses (expired/cancelled/completed) are untouched
 * because the WHERE clause only matches `status = 'active'`. Re-running is
 * safe — already-expired rows no longer match.
 *
 * @returns the number of rows transitioned to 'expired'.
 */
export async function expireOverduePackageInstances(
	tenantDb: TenantDb,
	now: Date = new Date(),
): Promise<number> {
	const updated = await tenantDb
		.update(packageInstances)
		.set({ status: "expired", updatedAt: now })
		.where(
			and(
				eq(packageInstances.status, "active"),
				lte(packageInstances.expiresAt, now),
			),
		)
		.returning({ id: packageInstances.id });

	return updated.length;
}
