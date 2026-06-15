/**
 * Platform-admin audit-write helper (candidate C2).
 *
 * Single home for writing platform-admin action rows to admin_session_actions.
 * Previously the insert was open-coded at ~32 call sites across 10 files, each
 * re-typing the row shape and one of 30 free-text actionType literals, with the
 * failure policy decided three incompatible ways (some swallowed, some threw,
 * bulk loops mutated-then-failed). ADR-0027/0028/0029/0032 decided "one audit
 * row per mutated target, audited on success, single + bulk share the action
 * strings" — this helper enforces that.
 *
 * Failure policy: logged, never fatal. The audited mutation has already
 * committed by the time we record it (none of the call sites wrap the audit
 * insert in the mutation's transaction — verified), so a failed audit insert
 * must NOT surface as a 500 to the caller.
 */

import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";

/** The closed vocabulary of platform-admin audit action types. */
export type AdminActionType =
	| "comms_template_archive"
	| "comms_template_create"
	| "comms_template_unarchive"
	| "comms_template_update"
	| "coupon_apply"
	| "coupon_create"
	| "coupon_delete"
	| "coupon_remove"
	| "tenant_announcement_create"
	| "tenant_bulk_suspend"
	| "tenant_dm"
	| "tenant_feature_override_clear"
	| "tenant_feature_override_set"
	| "tenant_force_cancel"
	| "tenant_invoice_refund"
	| "tenant_issue_credit"
	| "tenant_note_create"
	| "tenant_note_delete"
	| "tenant_note_update"
	| "tenant_provision"
	| "tenant_re_trial"
	| "tenant_restore"
	| "tenant_resume"
	| "tenant_soft_delete"
	| "tenant_suspend"
	| "tenant_tag_add"
	| "tenant_tag_bulk_add"
	| "tenant_tag_bulk_remove"
	| "tenant_tag_remove"
	| "tenant_tier_change";

export type AdminActionInput = {
	adminUserId: string;
	actionType: AdminActionType;
	targetOrganizationId?: string | null;
	targetUserId?: string | null;
	metadata?: unknown;
};

type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

function toRow(action: AdminActionInput) {
	return {
		adminUserId: action.adminUserId,
		actionType: action.actionType,
		targetOrganizationId: action.targetOrganizationId ?? null,
		targetUserId: action.targetUserId ?? null,
		metadata: (action.metadata ?? null) as object | null,
	};
}

/** Record one platform-admin audit row. Logged-not-fatal on failure. */
export async function recordAdminAction(
	cpDb: ControlPanelDb,
	action: AdminActionInput,
): Promise<void> {
	try {
		await cpDb.insert(adminSessionActions).values(toRow(action));
	} catch (err) {
		console.error(
			`[admin-audit] failed to record action "${action.actionType}":`,
			err,
		);
	}
}

/**
 * Record many audit rows in one insert (bulk fan-out — one row per target).
 * Same logged-not-fatal policy.
 */
export async function recordAdminActions(
	cpDb: ControlPanelDb,
	actions: ReadonlyArray<AdminActionInput>,
): Promise<void> {
	if (actions.length === 0) return;
	try {
		await cpDb.insert(adminSessionActions).values(actions.map(toRow));
	} catch (err) {
		console.error(
			`[admin-audit] failed to record ${actions.length} actions:`,
			err,
		);
	}
}
