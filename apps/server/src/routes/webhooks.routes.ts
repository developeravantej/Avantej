/**
 * Webhook Routes
 *
 * Handles external webhook events from Stripe for payment processing.
 *
 * Routes:
 * - POST /webhooks/stripe - Handle Stripe webhook events
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { verifyWebhookSignature } from "@/lib/stripe";
import type Stripe from "stripe";
import {
	claimWebhookEvent,
	markEventProcessed,
	markEventFailed,
} from "@/services/webhook-dedupe.service";
import {
	upsertSubscriptionFromStripe,
	markPastDue,
	markActive,
} from "@/services/saas-subscription.service";
import { authMiddleware } from "@/middleware/auth.middleware";
import { getControlPanelDb, getTenantDb } from "@/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { and, desc, eq } from "drizzle-orm";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { ghlSyncEvents } from "@avantej-core/db/schema/tenant/ghl-sync-events";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import {
	GhlWebhookError,
	markGhlWebhookFailed,
	processGhlWebhook,
} from "@/services/gohighlevel.service";

export const webhookRoutes = new Hono();

function parseLimit(rawLimit: string | undefined, fallback = 20): number {
	if (!rawLimit) {
		return fallback;
	}
	const parsed = Number.parseInt(rawLimit, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.min(parsed, 100);
}

async function getAccessibleLocationIds(c: Context) {
	const controlPanelDb = getControlPanelDb(c);
	const user = c.get("user");
	const memberships = await controlPanelDb
		.select({ organizationId: organizationMembers.organizationId })
		.from(organizationMembers)
		.where(
			and(
				eq(organizationMembers.userId, user.id),
				eq(organizationMembers.status, "active")
			)
		);

	return memberships.map((item) => item.organizationId);
}

async function ensureLocationAccess(
	c: Context,
	locationId: string
) {
	const controlPanelDb = getControlPanelDb(c);
	const [location] = await controlPanelDb
		.select({
			id: ghlBranchLinks.id,
			locationId: ghlBranchLinks.ghlLocationId,
			organizationId: ghlBranchLinks.organizationId,
			isActive: ghlBranchLinks.isActive,
			createdAt: ghlBranchLinks.createdAt,
			updatedAt: ghlBranchLinks.updatedAt,
		})
		.from(ghlBranchLinks)
		.where(eq(ghlBranchLinks.ghlLocationId, locationId))
		.limit(1);

	if (!location || !location.isActive) {
		return { error: "Location not found", status: 404 as const };
	}

	const organizationIds = await getAccessibleLocationIds(c);
	if (!organizationIds.includes(location.organizationId)) {
		return { error: "Forbidden", status: 403 as const };
	}

	return { location, status: 200 as const };
}

/**
 * POST /webhooks/stripe/platform
 *
 * Handles Stripe Billing events (subscription lifecycle + invoice events).
 * Verifies the platform webhook secret, deduplicates via processedWebhookEvents,
 * and dispatches to the saas-subscription service.
 */
webhookRoutes.post("/stripe/platform", async (c) => {
	const body = await c.req.text();
	const signature = c.req.header("stripe-signature");
	if (!signature) {
		return c.json({ error: "Missing Stripe-Signature header" }, 400);
	}

	let event: Stripe.Event;
	try {
		event = await verifyWebhookSignature(body, signature, "platform");
	} catch (e) {
		return c.json(
			{ error: e instanceof Error ? e.message : "Invalid signature" },
			400,
		);
	}

	const claim = await claimWebhookEvent({
		eventId: event.id,
		eventType: event.type,
		source: "platform",
		stripeAccount: null,
	});
	if (claim.status === "already_processed") {
		return c.json({ received: true, deduped: true }, 200);
	}

	try {
		switch (event.type) {
			case "customer.subscription.created":
			case "customer.subscription.updated":
			case "customer.subscription.deleted": {
				const sub = event.data.object as Stripe.Subscription;
				await upsertSubscriptionFromStripe(sub);
				break;
			}
			case "invoice.payment_failed": {
				const inv = event.data.object as Stripe.Invoice;
				// Stripe API 2025-10-29.clover removed the typed `subscription` field from
				// Stripe.Invoice; the property is still present on the wire payload.
				const subRef = (inv as unknown as { subscription?: string | { id: string } }).subscription;
				if (subRef) {
					const subId = typeof subRef === "string" ? subRef : subRef.id;
					await markPastDue(subId);
				}
				break;
			}
			case "invoice.paid": {
				const inv = event.data.object as Stripe.Invoice;
				// Stripe API 2025-10-29.clover removed the typed `subscription` field from
				// Stripe.Invoice; the property is still present on the wire payload.
				const subRef = (inv as unknown as { subscription?: string | { id: string } }).subscription;
				if (subRef) {
					const subId = typeof subRef === "string" ? subRef : subRef.id;
					await markActive(subId);
				}
				break;
			}
			default:
				// No-op for unhandled platform events in v1.
				console.log(`[platform webhook] unhandled event ${event.type}`);
				break;
		}
		await markEventProcessed(event.id);
		return c.json({ received: true }, 200);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await markEventFailed(event.id, msg);
		console.error(`Platform webhook handler failed for ${event.id}:`, e);
		return c.json({ error: "Handler failed" }, 500);
	}
});

/**
 * POST /webhooks/stripe/connect
 *
 * Stub handler for Stripe Connect events (Plan B/C).
 * Verifies the connect webhook secret, deduplicates, and acks 200.
 * No business logic is dispatched in v1.
 */
webhookRoutes.post("/stripe/connect", async (c) => {
	const body = await c.req.text();
	const signature = c.req.header("stripe-signature");
	if (!signature) {
		return c.json({ error: "Missing Stripe-Signature header" }, 400);
	}

	let event: Stripe.Event;
	try {
		event = await verifyWebhookSignature(body, signature, "connect");
	} catch (e) {
		return c.json(
			{ error: e instanceof Error ? e.message : "Invalid signature" },
			400,
		);
	}

	const claim = await claimWebhookEvent({
		eventId: event.id,
		eventType: event.type,
		source: "connect",
		stripeAccount: event.account ?? null,
	});
	if (claim.status === "already_processed") {
		return c.json({ received: true, deduped: true }, 200);
	}

	try {
		const controlPanelDb = getControlPanelDb(c);
		if (event.type === "account.updated") {
			const account = event.data.object as Stripe.Account;
			const orgId = (account.metadata?.organizationId ?? null) as string | null;
			const chargesEnabled = !!account.charges_enabled;
			const payoutsEnabled = !!account.payouts_enabled;
			const detailsSubmitted = !!account.details_submitted;
			const status = chargesEnabled ? "active" : "pending";

			// Prefer metadata.organizationId; fall back to stripe_connect_account_id lookup.
			const whereClause = orgId
				? eq(organizations.id, orgId)
				: eq(organizations.stripeConnectAccountId, account.id);

			const [org] = await controlPanelDb
				.select()
				.from(organizations)
				.where(whereClause)
				.limit(1);

			if (org) {
				await controlPanelDb
					.update(organizations)
					.set({
						stripeConnectAccountId: account.id,
						chargesEnabled,
						payoutsEnabled,
						detailsSubmitted,
						stripeConnectStatus: status,
						stripeConnectOnboardingCompletedAt:
							detailsSubmitted && !org.stripeConnectOnboardingCompletedAt
								? new Date()
								: org.stripeConnectOnboardingCompletedAt,
						connectAccountUpdatedAt: new Date(),
					})
					.where(eq(organizations.id, org.id));
				console.log(
					`[connect webhook] account.updated synced for org=${org.id} acct=${account.id} charges=${chargesEnabled} payouts=${payoutsEnabled} details=${detailsSubmitted}`,
				);
			} else {
				console.warn(
					`[connect webhook] account.updated for acct=${account.id} — no matching org (metadata.organizationId=${orgId})`,
				);
			}
		} else if (
			event.type === "payment_intent.succeeded" ||
			event.type === "payment_intent.payment_failed" ||
			event.type === "charge.refunded"
		) {
			const pi = event.data.object as Stripe.PaymentIntent | Stripe.Charge;
			const metadata = (pi as { metadata?: Record<string, string> }).metadata ?? {};
			const appointmentId = metadata.appointmentId;
			const organizationId = metadata.organizationId;

			if (!appointmentId || !organizationId) {
				console.warn(
					`[connect webhook] ${event.type} missing metadata.appointmentId/organizationId — pi=${pi.id} acct=${event.account}`,
				);
			} else {
				const tenantDb = await getTenantDb(organizationId, c);

				const succeeded = event.type === "payment_intent.succeeded";
				const failed = event.type === "payment_intent.payment_failed";
				const refunded = event.type === "charge.refunded";

				const update: Record<string, unknown> = { updatedAt: new Date() };
				if (succeeded) {
					update.paymentStatus = "paid";
					update.paidAt = new Date();
					update.paymentFailureReason = null;
					const pmTypes = (pi as Stripe.PaymentIntent).payment_method_types;
					if (Array.isArray(pmTypes) && pmTypes.length > 0 && pmTypes[0]) {
						update.paymentMethodType = pmTypes[0];
					}
				} else if (failed) {
					update.paymentStatus = "failed";
					const err = (pi as Stripe.PaymentIntent).last_payment_error;
					update.paymentFailureReason = err?.message ?? "Payment failed";
				} else if (refunded) {
					update.paymentStatus = "refunded";
				}

				// For payment_intent.* events, pi.id is the PI; for charge.refunded,
				// pi is a Charge with payment_intent property.
				const intentId =
					event.type === "charge.refunded"
						? (pi as Stripe.Charge).payment_intent?.toString() ?? null
						: pi.id;

				if (intentId) {
					await tenantDb
						.update(appointments)
						.set(update)
						.where(eq(appointments.stripePaymentIntentId, intentId));
					console.log(
						`[connect webhook] ${event.type} synced for appt=${appointmentId} pi=${intentId} status=${update.paymentStatus}`,
					);
				} else {
					console.warn(
						`[connect webhook] ${event.type} no resolvable PaymentIntent ID for appt=${appointmentId}`,
					);
				}
			}
		} else {
			console.log(`[connect webhook] unhandled event ${event.type} acct=${event.account}`);
		}
		await markEventProcessed(event.id);
		return c.json({ received: true }, 200);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await markEventFailed(event.id, msg);
		console.error(`Connect webhook handler failed for ${event.id}:`, e);
		return c.json({ error: "Handler failed" }, 500);
	}
});

/**
 * Handle GoHighLevel custom workflow webhooks
 *
 * URL locationId is the primary tenant routing key.
 */
webhookRoutes.post("/gohighlevel/:locationId", async (c) => {
	const locationId = c.req.param("locationId");
	const rawBody = await c.req.text();
	const signature = c.req.header("x-wh-signature") || undefined;
	const authorization = c.req.header("authorization") || undefined;
	const headerSecret =
		c.req.header("x-webhook-secret") || c.req.header("x-ghl-webhook-secret") || undefined;
	const querySecret = c.req.query("token") || c.req.query("secret") || undefined;

	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(rawBody) as Record<string, unknown>;
	} catch {
		return c.json({ error: "Invalid JSON payload" }, 400);
	}

		try {
			const result = await processGhlWebhook({
				c,
				locationId,
			rawBody,
			signature,
			authorization,
			headerSecret,
			querySecret,
				payload,
			});
			const { responseData, ...meta } = result;

			return c.json({
				received: true,
				locationId,
				...meta,
				...responseData,
			});
		} catch (error) {
		const status = (
			error instanceof GhlWebhookError ? error.status : 500
		) as 400 | 401 | 403 | 404 | 500;
		const code =
			error instanceof GhlWebhookError ? error.code : "internal_error";
		const message =
			error instanceof Error ? error.message : "Failed to process GHL webhook";

		await markGhlWebhookFailed({
			c,
			locationId,
			payload,
			rawBody,
			errorMessage: message,
		});

		return c.json(
			{
				error: message,
				code,
				locationId,
			},
			status
		);
	}
});

/**
 * Demo endpoint: list sync events for a location
 */
webhookRoutes.get("/gohighlevel/:locationId/events", authMiddleware, async (c) => {
	try {
		const locationId = c.req.param("locationId");
		const access = await ensureLocationAccess(c, locationId);
		if ("error" in access) {
			return c.json({ error: access.error }, access.status);
		}

		const limit = parseLimit(c.req.query("limit"), 25);
		const tenantDb = await getTenantDb(access.location.organizationId, c);
		const events = await tenantDb
			.select({
				id: ghlSyncEvents.id,
				eventKey: ghlSyncEvents.eventKey,
				eventType: ghlSyncEvents.eventType,
				ghlContactId: ghlSyncEvents.ghlContactId,
				email: ghlSyncEvents.email,
				status: ghlSyncEvents.status,
				errorMessage: ghlSyncEvents.errorMessage,
				rawPayload: ghlSyncEvents.rawPayload,
				createdAt: ghlSyncEvents.createdAt,
			})
			.from(ghlSyncEvents)
			.orderBy(desc(ghlSyncEvents.createdAt))
			.limit(limit);

		return c.json({
			locationId,
			organizationId: access.location.organizationId,
			events,
		});
	} catch (error) {
		console.error("Failed to fetch GHL sync events:", error);
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to fetch GHL sync events",
			},
			500
		);
	}
});

/**
 * Demo endpoint: list contact links for a location
 */
webhookRoutes.get("/gohighlevel/:locationId/links", authMiddleware, async (c) => {
	try {
		const locationId = c.req.param("locationId");
		const access = await ensureLocationAccess(c, locationId);
		if ("error" in access) {
			return c.json({ error: access.error }, access.status);
		}

		const limit = parseLimit(c.req.query("limit"), 50);
		const tenantDb = await getTenantDb(access.location.organizationId, c);
		const links = await tenantDb
			.select({
				id: ghlContactLinks.id,
				ghlContactId: ghlContactLinks.ghlContactId,
				userId: ghlContactLinks.userId,
				customerProfileId: ghlContactLinks.customerProfileId,
				syncStatus: ghlContactLinks.syncStatus,
				lastSyncedAt: ghlContactLinks.lastSyncedAt,
				createdAt: ghlContactLinks.createdAt,
				updatedAt: ghlContactLinks.updatedAt,
				profileIsDeleted: customerProfiles.isDeleted,
				profileDeletedAt: customerProfiles.deletedAt,
			})
			.from(ghlContactLinks)
			.leftJoin(
				customerProfiles,
				eq(customerProfiles.id, ghlContactLinks.customerProfileId)
			)
			.orderBy(desc(ghlContactLinks.updatedAt))
			.limit(limit);

		return c.json({
			locationId,
			organizationId: access.location.organizationId,
			links,
		});
	} catch (error) {
		console.error("Failed to fetch GHL contact links:", error);
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to fetch GHL contact links",
			},
			500
		);
	}
});
