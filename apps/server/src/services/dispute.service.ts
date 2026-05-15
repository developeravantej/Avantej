/**
 * Dispute Service (Plan C Phase C.2).
 *
 * Handles the 5 Stripe dispute events on the connect endpoint:
 *   - charge.dispute.created
 *   - charge.dispute.updated
 *   - charge.dispute.closed
 *   - charge.dispute.funds_reinstated
 *   - charge.dispute.funds_withdrawn
 *
 * Triple-delivery per ADR-0020:
 *   1. Email tenant owner via Resend with response deadline prominent
 *   2. Insert tenant `notifications` row (in-app surface)
 *   3. Upsert `platform_dispute_queue` row (control-panel admin queue)
 *
 * Each side effect is independently try/caught — a missing email or
 * tenant DB failure must not prevent the platform queue write (which
 * is Avantej's authoritative copy for ops oversight).
 */

import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { platformDisputeQueue } from "@avantej-core/db/schema/control-panel/platform-dispute-queue";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { user as authUser } from "@avantej-core/db/schema/auth";
import { notifications } from "@avantej-core/db/schema/tenant/notifications";
import { sendEmail } from "@/lib/email";

type CpDb = NeonDatabase<typeof controlPanelSchema>;
type TenantDb = NeonDatabase<typeof tenantSchema>;

const DISPUTE_EVENT_TYPES = new Set<string>([
	"charge.dispute.created",
	"charge.dispute.updated",
	"charge.dispute.closed",
	"charge.dispute.funds_reinstated",
	"charge.dispute.funds_withdrawn",
]);

const NOTIFY_BY_EVENT: Record<string, { kind: string; title: string; informational: boolean }> = {
	"charge.dispute.created": {
		kind: "dispute_opened",
		title: "Customer disputed a charge",
		informational: false,
	},
	"charge.dispute.updated": {
		kind: "dispute_updated",
		title: "Dispute status updated",
		informational: false,
	},
	"charge.dispute.closed": {
		kind: "dispute_closed",
		title: "Dispute closed",
		informational: false,
	},
	"charge.dispute.funds_reinstated": {
		kind: "dispute_funds_reinstated",
		title: "Disputed funds reinstated",
		informational: true,
	},
	"charge.dispute.funds_withdrawn": {
		kind: "dispute_funds_withdrawn",
		title: "Disputed funds withdrawn",
		informational: true,
	},
};

export interface OnDisputeEventArgs {
	controlPanelDb: CpDb;
	tenantDb: TenantDb | null; // null if org can't be resolved → skip tenant-side notifications
	event: Stripe.Event;
}

export async function onDisputeEvent(args: OnDisputeEventArgs): Promise<void> {
	const { controlPanelDb, tenantDb, event } = args;
	if (!DISPUTE_EVENT_TYPES.has(event.type)) {
		return;
	}

	const dispute = event.data.object as Stripe.Dispute;
	const stripeAccount = event.account ?? null;

	// Resolve organizationId via org_country_stripe_accounts (Phase 4 source-of-truth).
	let organizationId: string | null = null;
	if (stripeAccount) {
		const [hit] = await controlPanelDb
			.select({ organizationId: orgCountryStripeAccounts.organizationId })
			.from(orgCountryStripeAccounts)
			.where(eq(orgCountryStripeAccounts.stripeAccountId, stripeAccount))
			.limit(1);
		organizationId = hit?.organizationId ?? null;
	}

	if (!organizationId) {
		console.warn(
			`[dispute] ${event.type} for acct=${stripeAccount} dispute=${dispute.id} — no matching org. Skipping all side effects.`,
		);
		return;
	}

	const deadlineSec =
		(dispute as { evidence_details?: { due_by?: number | null } }).evidence_details?.due_by ?? null;
	const deadlineAt = typeof deadlineSec === "number" ? new Date(deadlineSec * 1000) : null;

	const notifyMeta = NOTIFY_BY_EVENT[event.type] ?? null;

	// Side effect 1: upsert platform_dispute_queue (authoritative platform audit).
	try {
		await controlPanelDb
			.insert(platformDisputeQueue)
			.values({
				organizationId,
				stripeAccountId: stripeAccount ?? "",
				disputeId: dispute.id,
				status: dispute.status,
				amount: dispute.amount,
				currency: dispute.currency,
				reason: dispute.reason ?? null,
				deadlineAt,
			})
			.onConflictDoUpdate({
				target: platformDisputeQueue.disputeId,
				set: {
					status: dispute.status,
					deadlineAt,
					updatedAt: new Date(),
				},
			});
		console.log(
			`[dispute] ${event.type} platform_dispute_queue upserted dispute=${dispute.id} org=${organizationId} status=${dispute.status}`,
		);
	} catch (e) {
		console.error(
			`[dispute] platform_dispute_queue upsert failed for dispute=${dispute.id}:`,
			e,
		);
	}

	// Side effect 2: tenant in-app notification (best-effort).
	if (tenantDb && notifyMeta) {
		try {
			const [org] = await controlPanelDb
				.select({ ownerUserId: organizations.ownerUserId })
				.from(organizations)
				.where(eq(organizations.id, organizationId))
				.limit(1);
			const recipientUserId = org?.ownerUserId;
			if (recipientUserId) {
				await tenantDb.insert(notifications).values({
					userId: recipientUserId,
					type: "payment",
					title: notifyMeta.title,
					message: `Dispute ${dispute.id} — ${dispute.status}. Amount: ${(dispute.amount / 100).toFixed(2)} ${dispute.currency.toUpperCase()}.${deadlineAt ? ` Respond by ${deadlineAt.toUTCString()}.` : ""}`,
					relatedId: null,
					relatedType: "stripe_dispute",
				});
				console.log(
					`[dispute] tenant notifications inserted for org=${organizationId} user=${recipientUserId}`,
				);
			} else {
				console.warn(
					`[dispute] org=${organizationId} has no owner_user_id — skipping tenant notification`,
				);
			}
		} catch (e) {
			console.error(`[dispute] tenant notification insert failed:`, e);
		}
	}

	// Side effect 3: email tenant owner (best-effort, skip for informational events).
	if (notifyMeta && !notifyMeta.informational) {
		try {
			const [orgRow] = await controlPanelDb
				.select({ ownerUserId: organizations.ownerUserId, name: organizations.name })
				.from(organizations)
				.where(eq(organizations.id, organizationId))
				.limit(1);
			if (!orgRow?.ownerUserId) {
				console.warn(`[dispute] org=${organizationId} owner_user_id missing — skipping email`);
				return;
			}
			const [u] = await controlPanelDb
				.select({ email: authUser.email, name: authUser.name })
				.from(authUser)
				.where(eq(authUser.id, orgRow.ownerUserId))
				.limit(1);
			if (!u?.email) {
				console.warn(`[dispute] owner user=${orgRow.ownerUserId} has no email — skipping`);
				return;
			}
			const amountStr = `${(dispute.amount / 100).toFixed(2)} ${dispute.currency.toUpperCase()}`;
			const subject = `Dispute ${notifyMeta.title.toLowerCase()} — ${amountStr}${deadlineAt ? ` — respond by ${deadlineAt.toUTCString()}` : ""}`;
			const dashboardUrl = stripeAccount
				? `https://dashboard.stripe.com/${stripeAccount}/disputes/${dispute.id}`
				: `https://dashboard.stripe.com/disputes/${dispute.id}`;
			const html = `
				<p>Hi ${u.name ?? "there"},</p>
				<p>A customer has ${notifyMeta.title.toLowerCase()} on a charge for your business (${orgRow.name ?? organizationId}).</p>
				<ul>
					<li><strong>Dispute ID:</strong> ${dispute.id}</li>
					<li><strong>Amount:</strong> ${amountStr}</li>
					<li><strong>Reason:</strong> ${dispute.reason ?? "unspecified"}</li>
					<li><strong>Status:</strong> ${dispute.status}</li>
					${deadlineAt ? `<li><strong>Evidence due by:</strong> ${deadlineAt.toUTCString()}</li>` : ""}
				</ul>
				<p>Submit evidence directly in your Stripe Dashboard:</p>
				<p><a href="${dashboardUrl}">${dashboardUrl}</a></p>
				<p>If you don't respond before the deadline, Stripe will rule for the customer and the funds will be withdrawn from your account.</p>
			`;
			await sendEmail({
				to: u.email,
				subject,
				html,
			});
			console.log(`[dispute] email sent to ${u.email} for dispute=${dispute.id}`);
		} catch (e) {
			console.error(`[dispute] email send failed:`, e);
		}
	}
}
