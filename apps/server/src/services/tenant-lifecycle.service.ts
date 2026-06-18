/**
 * Tenant Lifecycle State Machine (candidate C3 — ADR-0024).
 *
 * Single home for tenant lifecycle state, the legal-transition table, and the
 * `paymentStatus` write+audit pipeline. Before this module, lifecycle writes
 * were open-coded as raw `update(organizations).set({ paymentStatus })` at ~6
 * call sites (admin.ts suspend/unsuspend, platform-admin-tenants
 * suspend/resume/forceCancel/reTrial, platform-admin-tenants-tags bulkSuspend,
 * tenant-deletion request/restore), each re-deciding the side-effects and the
 * audit row independently. ADR-0024 fixes the states, the legal transitions,
 * and "suspend = hard 403 cut, cancelled gated identically".
 *
 * What lives here:
 *   - The lifecycle state set + the ADR-0024 legal-transition map (lines 47-58).
 *   - `assertTransition(from, to)` — throws PRECONDITION_FAILED on an illegal
 *     transition.
 *   - `isAppBlocked(paymentStatus)` — the gate predicate shared by the two
 *     tenant middlewares (suspended | cancelled → 403).
 *   - `transitionTenant(...)` — loads the current status, asserts the
 *     transition, writes the new status (+ optional trialEndsAt), runs the
 *     transition's side-effect (forceCancel → stripe cancel), and records the
 *     audit row via recordAdminAction.
 *
 * Audit policy is reused from admin-audit.service.ts (logged-not-fatal).
 *
 * NOTE: `deleted` is a *conceptual* terminal state (cancelled → deleted is the
 * Plan E.8 hard-delete cron, which removes the organizations row entirely). It
 * is never stored as a `paymentStatus` value, so `transitionTenant` never
 * writes it.
 */

import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { getStripeClient } from "@/lib/stripe";
import {
	recordAdminAction,
	type AdminActionType,
} from "@/services/admin-audit.service";

type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

/**
 * The tenant lifecycle states (ADR-0024). These live on
 * `organizations.paymentStatus` (a free-text column). `created` and `deleted`
 * are conceptual endpoints — `created` is transient during provisioning and
 * `deleted` is the post-hard-delete absence of the row — so neither is a value
 * `transitionTenant` writes. The webhook-driven states (`trial`, `past_due`)
 * are written by the webhook handlers (ADR-0006), not by this module, but they
 * appear here as legal *from*-states.
 */
export const TENANT_LIFECYCLE_STATES = [
	"trial",
	"active",
	"past_due",
	"suspended",
	"cancelled",
] as const;

export type TenantLifecycleState = (typeof TENANT_LIFECYCLE_STATES)[number];

/**
 * Legal *from*-states for each admin/ops *to*-state we route through this
 * module. Two of the three targets accept "any non-deleted" — encoded
 * permissively (any stored value), NOT as a closed enum, because
 * `organizations.paymentStatus` is free-text and Stripe-synced: it can hold
 * org-level values ({trial, active, suspended, cancelled}) AND Stripe sub-level
 * values ({trialing, past_due, unpaid, failed, …}). A closed allowlist would
 * wrongly reject a suspend/force-cancel on a `trialing`/`unpaid`/`failed`
 * tenant — the old inline code suspended/cancelled from *any* state.
 *
 * `null` ⇒ "any stored value is a legal source" (suspended, cancelled).
 * An array ⇒ the enumerated legal sources (active = resume/reTrial).
 */
const LEGAL_TO_FROM: Record<string, readonly string[] | null> = {
	// ADR-0024: any non-deleted → suspended (admin suspendTenant / bulkSuspend).
	suspended: null,
	// ADR-0024: any non-deleted → cancelled (forceCancelTenant / soft-delete).
	cancelled: null,
	// ADR-0024: suspended → active (resume); trial|suspended → active (reTrial,
	// table line 57). reTrial ALSO "clears any prior suspension / past_due"
	// (prose line 115) and applies to already-active/paid tenants (prose 118-122).
	// resume and reTrial both target `active` and the (from,to) signature can't
	// separate them, so the union of legal sources is every non-deleted,
	// non-cancelled state. cancelled requires a fresh subscription, not reTrial.
	active: ["trial", "suspended", "active", "past_due"],
};

/**
 * ADR-0024 legal-transition table (lines 47-58), admin/ops + soft-delete edges.
 *
 *   - suspended:  any non-deleted → suspended      (admin suspendTenant / bulkSuspend)
 *   - active:     {trial, suspended, active, past_due} → active (resume + reTrial)
 *   - cancelled:  any non-deleted → cancelled       (admin forceCancelTenant / soft-delete)
 *
 * "any non-deleted" includes the target state itself (self-transitions are
 * legal — e.g. re-suspending an already-suspended tenant in a bulk op, or a
 * soft-delete request on an already-cancelled tenant).
 *
 * Webhook-driven transitions (trial→active, active→past_due, past_due→active,
 * past_due→suspended) are owned by the webhook handlers and are NOT routed
 * through this module, so they are not enumerated here.
 *
 * `cancelled → deleted` (Plan E.8 hard-delete cron) removes the row; it never
 * writes `paymentStatus='deleted'`, so it is not modelled as a write target.
 *
 * reTrial sources: the ADR-0024 table (line 57) enumerates `trial | suspended`,
 * but the prose is broader — L115 "clears any prior suspension / past_due" and
 * L118-122 applies reTrial to already-active/paid tenants. We follow the prose
 * (reTrial is a permissive recovery / sales concession), so the `active` target
 * accepts {trial, suspended, active, past_due} — every non-deleted, non-cancelled
 * source. `cancelled` requires a fresh subscription, not reTrial.
 */

/**
 * Is the tenant blocked from app access? ADR-0024: `suspended` is a hard cut
 * (block login + charges) and `cancelled` is gated identically. Used by
 * `tenant.middleware.ts` and `orpc-tenant.middleware.ts` as the 403 predicate.
 *
 * This is a *gating* predicate — not a health/grading signal. (The health-score
 * formula in `@avantej-core/services` grades suspended and cancelled as
 * distinct factors per ADR-0030 and must NOT collapse them via this boolean.)
 */
export function isAppBlocked(
	paymentStatus: string | null | undefined,
): boolean {
	return paymentStatus === "suspended" || paymentStatus === "cancelled";
}

/**
 * Throw on an illegal lifecycle transition (ADR-0024 table). PRECONDITION_FAILED
 * — the request was well-formed but the tenant is in the wrong state for the op.
 */
export function assertTransition(from: string, to: string): void {
	// `to` must be a target this module governs. `null` ⇒ any non-deleted
	// source is legal (suspended / cancelled). An array ⇒ enumerated sources.
	const legalFrom = LEGAL_TO_FROM[to];
	const isLegal =
		legalFrom === null || (legalFrom !== undefined && legalFrom.includes(from));
	if (!isLegal) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: `Illegal tenant lifecycle transition: ${from} → ${to}`,
		});
	}
}

export interface TransitionTenantInput {
	organizationId: string;
	/** Target lifecycle state to write to `organizations.paymentStatus`. */
	to: TenantLifecycleState;
	adminUserId: string;
	/** Free-text reason (validated ≥3 at the call site); copied into audit metadata. */
	reason: string;
	/** The closed audit action type for this call site (preserved verbatim). */
	actionType: AdminActionType;
	/** Extra audit-only payload merged into the audit row's metadata. */
	metadata?: Record<string, unknown>;
	/** re-trial: set `organizations.trialEndsAt` alongside the status write. */
	trialEndsAt?: Date;
	/**
	 * force-cancel: cancel the linked Stripe subscription before the status
	 * write. Only consulted when `to === "cancelled"`. Fails soft (logged).
	 */
	cancelStripeSubscription?: boolean;
	/** Override "now" for the updatedAt stamp / deterministic tests. */
	now?: Date;
}

export interface TransitionTenantResult {
	paymentStatus: string;
	trialEndsAt?: Date | null;
	stripeSubCanceled: string | null;
}

/**
 * Load the current `paymentStatus`, assert the transition is legal, run the
 * transition's side-effect (force-cancel → Stripe cancel), write the new status
 * (+ optional trialEndsAt), and record the audit row.
 *
 * Throws NOT_FOUND if the org doesn't exist, PRECONDITION_FAILED on an illegal
 * transition. The Stripe cancel is logged-not-fatal (mirrors the prior inline
 * behaviour). The audit insert is logged-not-fatal (recordAdminAction policy).
 */
export async function transitionTenant(
	cpDb: ControlPanelDb,
	input: TransitionTenantInput,
): Promise<TransitionTenantResult> {
	const now = input.now ?? new Date();

	const [org] = await cpDb
		.select({
			id: organizations.id,
			paymentStatus: organizations.paymentStatus,
			subscriptionId: organizations.subscriptionId,
		})
		.from(organizations)
		.where(eq(organizations.id, input.organizationId));

	if (!org) {
		throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
	}

	assertTransition(org.paymentStatus, input.to);

	// ── Side-effect: force-cancel halts Stripe billing immediately. ──────────
	let stripeSubCanceled: string | null = null;
	if (
		input.to === "cancelled" &&
		input.cancelStripeSubscription &&
		org.subscriptionId
	) {
		const [sub] = await cpDb
			.select({ stripeSubscriptionId: subscriptions.stripeSubscriptionId })
			.from(subscriptions)
			.where(eq(subscriptions.id, org.subscriptionId));
		if (sub?.stripeSubscriptionId) {
			try {
				await getStripeClient().subscriptions.cancel(sub.stripeSubscriptionId);
				stripeSubCanceled = sub.stripeSubscriptionId;
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				console.error(`[transitionTenant] stripe cancel failed:`, msg);
			}
		}
	}

	// ── Write the new state (+ optional trialEndsAt for re-trial). ───────────
	const setValues: Partial<typeof organizations.$inferInsert> = {
		paymentStatus: input.to,
		updatedAt: now,
	};
	if (input.trialEndsAt !== undefined) {
		setValues.trialEndsAt = input.trialEndsAt;
	}

	const [updated] = await cpDb
		.update(organizations)
		.set(setValues)
		.where(eq(organizations.id, input.organizationId))
		.returning({
			paymentStatus: organizations.paymentStatus,
			trialEndsAt: organizations.trialEndsAt,
		});

	if (!updated) {
		throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
	}

	// ── Audit (logged-not-fatal). Metadata is audit payload only. ────────────
	await recordAdminAction(cpDb, {
		adminUserId: input.adminUserId,
		actionType: input.actionType,
		targetOrganizationId: input.organizationId,
		metadata: {
			reason: input.reason,
			...input.metadata,
			...(input.to === "cancelled" ? { stripeSubCanceled } : {}),
		},
	});

	return {
		paymentStatus: updated.paymentStatus,
		trialEndsAt: updated.trialEndsAt,
		stripeSubCanceled,
	};
}

/**
 * Write `paymentStatus` + audit for a transition that is NOT in the ADR-0024
 * enumerated table — e.g. GDPR `restoreTenantDeletion` (cancelled → active),
 * which is a Plan E.8 / ADR-0026 recovery edge outside the lifecycle table.
 *
 * Same write + logged-not-fatal audit pipeline as `transitionTenant`, but it
 * does NOT call `assertTransition` (the edge is intentionally not legal under
 * ADR-0024's table) and runs no Stripe side-effect. Use this only for the
 * documented non-table edges.
 */
export async function applyTenantStatus(
	cpDb: ControlPanelDb,
	input: {
		organizationId: string;
		to: TenantLifecycleState;
		adminUserId: string;
		actionType: AdminActionType;
		metadata?: Record<string, unknown>;
		now?: Date;
	},
): Promise<{ paymentStatus: string }> {
	const now = input.now ?? new Date();

	const [updated] = await cpDb
		.update(organizations)
		.set({ paymentStatus: input.to, updatedAt: now })
		.where(eq(organizations.id, input.organizationId))
		.returning({ paymentStatus: organizations.paymentStatus });

	if (!updated) {
		throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
	}

	await recordAdminAction(cpDb, {
		adminUserId: input.adminUserId,
		actionType: input.actionType,
		targetOrganizationId: input.organizationId,
		metadata: input.metadata ?? null,
	});

	return { paymentStatus: updated.paymentStatus };
}

/**
 * Bare status write — no assert, no audit, no side-effect. Returns the updated
 * row id (undefined if the org doesn't exist) so a bulk caller can detect
 * not_found and record its OWN batched audit row.
 *
 * Used by `bulkSuspend`, whose `any non-deleted → suspended` edge is always
 * legal (so the assert would be a no-op) and which owns a single batched audit
 * insert that records one row per target — including failures — a shape the
 * per-call `transitionTenant`/`applyTenantStatus` audit cannot express.
 */
export async function writeTenantPaymentStatus(
	cpDb: ControlPanelDb,
	organizationId: string,
	to: TenantLifecycleState,
	now: Date = new Date(),
): Promise<{ id: string } | undefined> {
	const [updated] = await cpDb
		.update(organizations)
		.set({ paymentStatus: to, updatedAt: now })
		.where(eq(organizations.id, organizationId))
		.returning({ id: organizations.id });
	return updated;
}
