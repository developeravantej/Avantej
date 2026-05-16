/**
 * Plan E E.8 — Tenant Deletion Service (GDPR).
 *
 * Three operations:
 *   - requestTenantDeletion: soft-delete. Inserts a tenant_deletions row,
 *     flips organizations.paymentStatus -> 'cancelled', writes an audit row.
 *     Refuses if an open deletion (not restored, not hard-deleted) already
 *     exists for the org.
 *   - restoreTenantDeletion: stamps restored_at on the open row, resets
 *     paymentStatus -> 'active'. No-op if no open row exists.
 *   - hardDeleteOverdueTenants: cron-friendly sweeper. Selects every row
 *     where hard_delete_after <= now AND restored_at IS NULL AND
 *     hard_deleted_at IS NULL, drops the Neon project, deletes the
 *     organization (cascade clears dependents), stamps hard_deleted_at.
 *     Fails soft per-org so one bad org doesn't block the rest.
 *
 * The Neon API key is passed in as a dep so this stays testable — we never
 * reach for `cloudflare:workers` env from inside the service.
 *
 * See ADR-0026.
 */

import { and, eq, isNull, lte } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { tenantDeletions } from "@avantej-core/db/schema/control-panel/tenant-deletions";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";

export const SOFT_DELETE_GRACE_DAYS = 30;

export interface RequestDeletionInput {
	organizationId: string;
	requestedByUserId: string;
	exportUrl?: string | null;
	now?: Date;
}

export interface RestoreDeletionInput {
	organizationId: string;
	requestedByUserId: string;
	now?: Date;
}

export interface SweepResult {
	scanned: number;
	deleted: number;
	errors: Array<{ organizationId: string; error: string }>;
}

interface BaseDeps {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
}

interface SweepDeps extends BaseDeps {
	/** Bearer token for the Neon API. If absent, Neon project drops are skipped (logged + counted as errors). */
	neonApiKey?: string;
	/** Optional injectable for tests. */
	deleteNeonProject?: (projectId: string) => Promise<void>;
	now?: Date;
}

/** Predicate for "open" deletion row — matches the partial index. */
function openDeletionWhere(orgId: string) {
	return and(
		eq(tenantDeletions.organizationId, orgId),
		isNull(tenantDeletions.restoredAt),
		isNull(tenantDeletions.hardDeletedAt),
	);
}

export async function requestTenantDeletion(
	deps: BaseDeps & RequestDeletionInput,
): Promise<{ id: string; hardDeleteAfter: Date }> {
	const now = deps.now ?? new Date();
	const hardDeleteAfter = new Date(
		now.getTime() + SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000,
	);

	// Refuse if an open deletion row already exists.
	const [existing] = await deps.controlPanelDb
		.select({ id: tenantDeletions.id })
		.from(tenantDeletions)
		.where(openDeletionWhere(deps.organizationId))
		.limit(1);
	if (existing) {
		throw new ORPCError("CONFLICT", {
			message: "Tenant already has an open deletion request",
		});
	}

	const [org] = await deps.controlPanelDb
		.select({ id: organizations.id })
		.from(organizations)
		.where(eq(organizations.id, deps.organizationId));
	if (!org) {
		throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
	}

	const [row] = await deps.controlPanelDb
		.insert(tenantDeletions)
		.values({
			organizationId: deps.organizationId,
			requestedBy: deps.requestedByUserId,
			hardDeleteAfter,
			exportUrl: deps.exportUrl ?? null,
		})
		.returning({
			id: tenantDeletions.id,
			hardDeleteAfter: tenantDeletions.hardDeleteAfter,
		});

	await deps.controlPanelDb
		.update(organizations)
		.set({ paymentStatus: "cancelled", updatedAt: now })
		.where(eq(organizations.id, deps.organizationId));

	await deps.controlPanelDb.insert(adminSessionActions).values({
		adminUserId: deps.requestedByUserId,
		actionType: "tenant_soft_delete",
		targetOrganizationId: deps.organizationId,
		metadata: {
			tenantDeletionId: row!.id,
			hardDeleteAfter: hardDeleteAfter.toISOString(),
			exportUrlPresent: Boolean(deps.exportUrl),
		},
	});

	return { id: row!.id, hardDeleteAfter: row!.hardDeleteAfter };
}

export async function restoreTenantDeletion(
	deps: BaseDeps & RestoreDeletionInput,
): Promise<{ id: string }> {
	const now = deps.now ?? new Date();

	const [open] = await deps.controlPanelDb
		.select({ id: tenantDeletions.id })
		.from(tenantDeletions)
		.where(openDeletionWhere(deps.organizationId))
		.limit(1);

	if (!open) {
		throw new ORPCError("NOT_FOUND", {
			message: "No open deletion request to restore",
		});
	}

	await deps.controlPanelDb
		.update(tenantDeletions)
		.set({ restoredAt: now })
		.where(eq(tenantDeletions.id, open.id));

	await deps.controlPanelDb
		.update(organizations)
		.set({ paymentStatus: "active", updatedAt: now })
		.where(eq(organizations.id, deps.organizationId));

	await deps.controlPanelDb.insert(adminSessionActions).values({
		adminUserId: deps.requestedByUserId,
		actionType: "tenant_restore",
		targetOrganizationId: deps.organizationId,
		metadata: { tenantDeletionId: open.id },
	});

	return { id: open.id };
}

/**
 * Drop the Neon project for a tenant via the Neon REST API. Fails soft;
 * the caller logs and continues. Mirrored from neon.service.ts to avoid
 * pulling in its env-resolution layer (which assumes a Workers runtime).
 */
async function defaultDeleteNeonProject(
	projectId: string,
	apiKey: string,
): Promise<void> {
	const response = await fetch(
		`https://console.neon.tech/api/v2/projects/${projectId}`,
		{
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
		},
	);
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`Neon project drop failed: ${response.status} ${response.statusText} — ${body}`,
		);
	}
}

export async function hardDeleteOverdueTenants(
	deps: SweepDeps,
): Promise<SweepResult> {
	const now = deps.now ?? new Date();
	const errors: SweepResult["errors"] = [];
	let deleted = 0;

	const overdue = await deps.controlPanelDb
		.select({
			id: tenantDeletions.id,
			organizationId: tenantDeletions.organizationId,
		})
		.from(tenantDeletions)
		.where(
			and(
				lte(tenantDeletions.hardDeleteAfter, now),
				isNull(tenantDeletions.hardDeletedAt),
				isNull(tenantDeletions.restoredAt),
			),
		);

	for (const row of overdue) {
		try {
			const [org] = await deps.controlPanelDb
				.select({
					id: organizations.id,
					neonProjectId: organizations.neonProjectId,
				})
				.from(organizations)
				.where(eq(organizations.id, row.organizationId));

			if (org?.neonProjectId) {
				if (deps.deleteNeonProject) {
					await deps.deleteNeonProject(org.neonProjectId);
				} else if (deps.neonApiKey) {
					await defaultDeleteNeonProject(org.neonProjectId, deps.neonApiKey);
				} else {
					throw new Error(
						"NEON_API_KEY not configured — cannot drop tenant Neon project",
					);
				}
			}

			// Cascade clears dependents (subscriptions FK, members, etc.). The
			// tenant_deletions row stays (FK is cascade) — so we stamp the
			// hard_deleted_at FIRST on a copy that survives, by deleting the org
			// AFTER stamping. Order: stamp -> delete org. Since tenant_deletions
			// cascades on org delete, we'd lose the stamp; we therefore stamp it,
			// detach the FK target, and don't delete the org — but the spec says
			// "delete the organizations row (cascade will delete dependents)".
			//
			// Resolution: stamp hard_deleted_at first, then delete the org. The
			// cascade WILL drop the tenant_deletions row — we accept that the
			// audit lives in admin_session_actions (which uses ON DELETE SET NULL
			// for target_organization_id, preserving history).
			await deps.controlPanelDb
				.update(tenantDeletions)
				.set({ hardDeletedAt: now })
				.where(eq(tenantDeletions.id, row.id));

			if (org) {
				await deps.controlPanelDb
					.delete(organizations)
					.where(eq(organizations.id, org.id));
			}

			deleted += 1;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(
				`[tenant-deletion-sweeper] org=${row.organizationId} failed:`,
				msg,
			);
			errors.push({ organizationId: row.organizationId, error: msg });
		}
	}

	return { scanned: overdue.length, deleted, errors };
}
