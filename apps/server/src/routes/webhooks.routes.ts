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
import { handleCheckoutCompleted } from "@/services/payment.service";
import Stripe from "stripe";
import { authMiddleware } from "@/middleware/auth.middleware";
import { getControlPanelDb, getTenantDb } from "@/lib/db";
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
 * Handle Stripe webhook events
 *
 * Events handled:
 * - checkout.session.completed - Payment succeeded, provision organization
 * - customer.subscription.created - New subscription created
 * - customer.subscription.updated - Subscription updated (plan change, status change)
 * - customer.subscription.deleted - Subscription canceled
 * - invoice.payment_succeeded - Invoice payment succeeded
 * - invoice.payment_failed - Invoice payment failed
 */
webhookRoutes.post("/stripe", async (c) => {
	try {
		// Get raw body as string (required for signature verification)
		const body = await c.req.text();
		const signature = c.req.header("stripe-signature");

		if (!signature) {
			return c.json({ error: "Missing Stripe-Signature header" }, 400);
		}

		// Verify webhook signature
		let event: Stripe.Event;
		try {
			event = verifyWebhookSignature(body, signature);
		} catch (error) {
			console.error("Webhook signature verification failed:", error);
			return c.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Invalid webhook signature",
				},
				400
			);
		}

		console.log(`Received Stripe webhook event: ${event.type}`);

		// Handle event based on type
		switch (event.type) {
			case "checkout.session.completed": {
				const session = event.data.object as Stripe.Checkout.Session;
				console.log(
					`Processing checkout.session.completed for session ${session.id}`
				);

				try {
					await handleCheckoutCompleted(session);
					console.log(
						`✓ Successfully processed checkout session ${session.id}`
					);
				} catch (error) {
					console.error(
						`Error processing checkout session ${session.id}:`,
						error
					);
					// Don't re-raise error to prevent webhook retry loops
					// Stripe will retry if we return non-2xx, but we want to handle
					// idempotency ourselves
					return c.json(
						{
							received: true,
							error:
								error instanceof Error
									? error.message
									: "Failed to process checkout",
						},
						200
					);
				}
				break;
			}

			case "customer.subscription.created": {
				const subscription = event.data.object as Stripe.Subscription;
				console.log(
					`Subscription created: ${subscription.id} (customer: ${subscription.customer})`
				);
				// Subscription is handled by checkout.session.completed
				// This event is informational
				break;
			}

			case "customer.subscription.updated": {
				const subscription = event.data.object as Stripe.Subscription;
				console.log(
					`Subscription updated: ${subscription.id}, status: ${subscription.status}`
				);
				// TODO: Update subscription status in database if needed
				// For now, subscription status is managed via checkout.session.completed
				break;
			}

			case "customer.subscription.deleted": {
				const subscription = event.data.object as Stripe.Subscription;
				console.log(`Subscription deleted: ${subscription.id}`);
				// TODO: Handle subscription cancellation
				// Could suspend organization or mark for deletion
				break;
			}

			case "invoice.payment_succeeded": {
				const invoice = event.data.object as Stripe.Invoice;
				console.log(`Invoice payment succeeded: ${invoice.id}`);
				// Payment succeeded - ensure organization payment status is active
				// This is handled by checkout.session.completed, but can be used
				// to update payment status for recurring invoices
				break;
			}

			case "invoice.payment_failed": {
				const invoice = event.data.object as Stripe.Invoice;
				console.log(`Invoice payment failed: ${invoice.id}`);
				// TODO: Handle payment failure
				// Could suspend organization or send notification
				break;
			}

			default:
				console.log(`Unhandled webhook event type: ${event.type}`);
		}

		return c.json({ received: true });
	} catch (error) {
		console.error("Error processing webhook:", error);
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to process webhook",
			},
			500
		);
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
