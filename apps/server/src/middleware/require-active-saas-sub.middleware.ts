/**
 * oRPC middleware enforcing the SaaS subscription state machine.
 *
 * Per ADR-0003 (trial-first activation) and ADR-0009 (past-due 7-day grace).
 *
 * Decisions:
 *   allow      — full access. May carry a UI banner: 'trialing' | 'past_due_in_grace'.
 *   read_only  — block write procedures (mutations), allow gets.
 *   block      — block all (e.g. trial expired with no sub, or incomplete first payment).
 *
 * The pure helper `evaluateAccess` makes the decision; the middleware wires it to
 * oRPC context, distinguishes write procedures by name prefix, and throws ORPCError
 * with SAAS_BLOCKED / SAAS_PAST_DUE_READONLY error codes on rejection.
 */

import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { o } from "@avantej-core/api";
import { controlPanelDb } from "@/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";

export type SubStateInput = {
	status: string;
	pastDueAt: Date | null;
	gracePeriodEndsAt: Date | null;
	trialEndsAt: Date | null;
} | null;

export type AccessDecision =
	| { decision: "allow"; banner?: "trialing" | "past_due_in_grace" }
	| { decision: "read_only"; reason: string }
	| { decision: "block"; reason: string };

/**
 * Pure access evaluator. No side effects. Testable in isolation.
 *
 * @param sub                 Subscription state row, or null if the org has no sub yet.
 * @param now                 Reference time (inject for testability).
 * @param orgTrialEndsAt      Org-level trial-end fallback when sub is null.
 */
export function evaluateAccess(
	sub: SubStateInput,
	now: Date,
	orgTrialEndsAt?: Date | null,
): AccessDecision {
	if (sub) {
		switch (sub.status) {
			case "active":
				return { decision: "allow" };
			case "trialing":
				if (!sub.trialEndsAt || sub.trialEndsAt.getTime() > now.getTime()) {
					return { decision: "allow", banner: "trialing" };
				}
				return { decision: "block", reason: "trial_expired_no_sub" };
			case "past_due":
				if (
					sub.gracePeriodEndsAt &&
					sub.gracePeriodEndsAt.getTime() > now.getTime()
				) {
					return { decision: "allow", banner: "past_due_in_grace" };
				}
				return { decision: "read_only", reason: "past_due_past_grace" };
			case "canceled":
				return { decision: "read_only", reason: "canceled" };
			case "unpaid":
				return { decision: "read_only", reason: "unpaid" };
			case "incomplete_expired":
				return { decision: "read_only", reason: "incomplete_expired" };
			case "incomplete":
				return { decision: "block", reason: "incomplete" };
			default:
				return { decision: "read_only", reason: sub.status };
		}
	}

	// No subscription — derive from org-level trial state.
	if (orgTrialEndsAt && orgTrialEndsAt.getTime() > now.getTime()) {
		return { decision: "allow", banner: "trialing" };
	}
	return { decision: "block", reason: "trial_expired_no_sub" };
}

/**
 * Heuristic: an oRPC procedure name is a "write" if its last path segment starts with
 * one of these verbs. Used in read-only mode to allow GET-shaped procs through and
 * reject mutations. A tag/metadata system would be cleaner; defer to Plan D.
 */
const WRITE_VERB_PREFIXES = [
	"create",
	"update",
	"delete",
	"upsert",
	"set",
	"add",
	"remove",
	"sync",
] as const;

function isWriteProcedure(procedurePath: string | undefined): boolean {
	if (!procedurePath) return false;
	const last = procedurePath.split(".").pop()?.toLowerCase() ?? "";
	return WRITE_VERB_PREFIXES.some((prefix) => last.startsWith(prefix));
}

/**
 * oRPC middleware. Compose onto procedures that require active sub access.
 *
 *   const someProcedure = protectedProcedure.use(requireActiveSaaSSub).query(...)
 */
export const requireActiveSaaSSub = o.middleware(async ({ context, next, path }) => {
	const orgId = (context as { organizationId?: string }).organizationId;
	if (!orgId) {
		throw new ORPCError("BAD_REQUEST", { message: "No organization context" });
	}

	const [org] = await controlPanelDb
		.select()
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);
	if (!org) {
		throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
	}

	let sub: SubStateInput = null;
	if (org.subscriptionId) {
		const [row] = await controlPanelDb
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.id, org.subscriptionId))
			.limit(1);
		if (row) {
			sub = {
				status: row.status,
				pastDueAt: row.pastDueAt,
				gracePeriodEndsAt: row.gracePeriodEndsAt,
				trialEndsAt: row.trialEndsAt,
			};
		}
	}

	const decision = evaluateAccess(sub, new Date(), org.trialEndsAt);

	if (decision.decision === "block") {
		throw new ORPCError("SAAS_BLOCKED" as never, {
			message: `Access blocked: ${decision.reason}`,
		});
	}

	if (decision.decision === "read_only") {
		// Prefix-based write detection. Plan D will replace with a tag system.
		const procPath: string | undefined = Array.isArray(path)
			? path.join(".")
			: (path as unknown as string | undefined);
		if (isWriteProcedure(procPath)) {
			throw new ORPCError("SAAS_PAST_DUE_READONLY" as never, {
				message: `Read-only mode: ${decision.reason}`,
			});
		}
	}

	return next({
		context: {
			...context,
			saasBanner:
				decision.decision === "allow" ? decision.banner : undefined,
		},
	});
});
