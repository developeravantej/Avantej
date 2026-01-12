/**
 * Webhook Routes
 *
 * Handles external webhook events from Stripe for payment processing.
 *
 * Routes:
 * - POST /webhooks/stripe - Handle Stripe webhook events
 */

import { Hono } from "hono";
import { verifyWebhookSignature } from "@/lib/stripe";
import { handleCheckoutCompleted } from "@/services/payment.service";
import Stripe from "stripe";

export const webhookRoutes = new Hono();

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
				console.log(
					`Invoice payment succeeded: ${invoice.id} (subscription: ${invoice.subscription})`
				);
				// Payment succeeded - ensure organization payment status is active
				// This is handled by checkout.session.completed, but can be used
				// to update payment status for recurring invoices
				break;
			}

			case "invoice.payment_failed": {
				const invoice = event.data.object as Stripe.Invoice;
				console.log(
					`Invoice payment failed: ${invoice.id} (subscription: ${invoice.subscription})`
				);
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
