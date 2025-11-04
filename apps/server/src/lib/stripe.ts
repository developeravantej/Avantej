/**
 * Stripe Webhook Signature Verification
 *
 * Verifies Stripe webhook signatures to ensure requests are authentic.
 * Uses Stripe SDK's constructEvent method for signature validation.
 *
 * Environment Variables:
 * - STRIPE_WEBHOOK_SECRET: Webhook signing secret from Stripe dashboard (starts with whsec_)
 *
 * Usage:
 * ```typescript
 * import { verifyWebhookSignature } from "@/lib/stripe";
 *
 * const event = await verifyWebhookSignature(body, signature);
 * // Process event...
 * ```
 */

import Stripe from "stripe";
import { env } from "cloudflare:workers";

/**
 * Stripe client instance
 * Initialized with secret key from environment
 */
let stripeClient: Stripe | null = null;

/**
 * Get or create Stripe client instance
 */
function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }
    stripeClient = new Stripe(secretKey, {
      apiVersion: "2025-10-29.clover",
    });
  }
  return stripeClient;
}

/**
 * Verify Stripe webhook signature and parse event
 *
 * @param body - Raw request body as string (must be raw, not parsed JSON)
 * @param signature - Stripe-Signature header value
 * @returns Parsed Stripe event object
 * @throws Error if signature is invalid or webhook secret is missing
 *
 * @example
 * ```typescript
 * const signature = request.headers.get("stripe-signature");
 * const body = await request.text();
 * const event = verifyWebhookSignature(body, signature);
 * ```
 */
export function verifyWebhookSignature(
  body: string,
  signature: string | null
): Stripe.Event {
  if (!signature) {
    throw new Error("Missing Stripe-Signature header");
  }

  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set");
  }

  const stripe = getStripeClient();

  try {
    // Verify signature and construct event
    // This will throw if signature is invalid
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );

    return event;
  } catch (error) {
    if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
      throw new Error(`Invalid webhook signature: ${error.message}`);
    }
    throw new Error(
      `Webhook signature verification failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

