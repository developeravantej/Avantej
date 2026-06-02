/**
 * Shared types, helpers, and factory for the payments router.
 */

import { ORPCError } from "@orpc/server";
import { getStripeClient } from "@/lib/stripe";

/** Minimal Stripe surface — keeps the router DI-testable without the SDK. */
export type StripeClientLike = {
	paymentIntents: {
		create: (
			params: unknown,
			options?: { stripeAccount?: string; idempotencyKey?: string },
		) => Promise<{ id: string; client_secret: string | null; status: string }>;
	};
	paymentLinks: {
		create: (
			params: unknown,
			options?: { stripeAccount?: string },
		) => Promise<{ id: string; url: string }>;
	};
	prices: {
		create: (
			params: unknown,
			options?: { stripeAccount?: string },
		) => Promise<{ id: string }>;
	};
	refunds: {
		create: (
			params: unknown,
			options?: { stripeAccount?: string; idempotencyKey?: string },
		) => Promise<{
			id: string;
			status: string | null;
			amount: number;
			currency: string;
		}>;
	};
	customers: {
		create: (
			params: {
				email?: string;
				name?: string;
				metadata?: Record<string, string>;
			},
			options?: { stripeAccount?: string },
		) => Promise<{ id: string }>;
		retrieve: (
			id: string,
			options?: { stripeAccount?: string },
		) => Promise<{ id: string; deleted?: boolean }>;
	};
	setupIntents: {
		create: (
			params: {
				customer: string;
				payment_method_types?: string[];
				usage?: "off_session" | "on_session";
				metadata?: Record<string, string>;
			},
			options?: { stripeAccount?: string },
		) => Promise<{ id: string; client_secret: string | null; status: string }>;
	};
	paymentMethods: {
		list: (
			params: { customer: string; type?: string; limit?: number },
			options?: { stripeAccount?: string },
		) => Promise<{
			data: Array<{
				id: string;
				card?: {
					brand: string;
					last4: string;
					exp_month: number;
					exp_year: number;
				} | null;
			}>;
		}>;
	};
};

export function getEnvVar(key: string): string | undefined {
	try {
		const { env } = require("cloudflare:workers") as {
			env: Record<string, string | undefined>;
		};
		const v = env[key];
		if (v !== undefined) return v;
	} catch {
		// Not in Cloudflare Workers runtime.
	}
	const globalEnv = (globalThis as { env?: Record<string, string | undefined> })
		.env;
	if (globalEnv?.[key] !== undefined) return globalEnv[key];
	return process.env[key];
}

/** Pull the gross charge amount (in cents) from the appointment row. */
export function resolveGrossAmount(appt: {
	sessionTotal: number | null;
	pricePerClient: number | null;
}): number {
	if (typeof appt.sessionTotal === "number" && appt.sessionTotal > 0) {
		return appt.sessionTotal;
	}
	if (typeof appt.pricePerClient === "number" && appt.pricePerClient > 0) {
		return appt.pricePerClient;
	}
	throw new ORPCError("BAD_REQUEST", {
		message: "Appointment has no priced session_total or price_per_client",
	});
}

export function makeResolveStripe(
	override?: StripeClientLike,
): () => StripeClientLike {
	return () => override ?? (getStripeClient() as unknown as StripeClientLike);
}
