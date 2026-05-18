/**
 * Stripe.js client loader for the web app.
 *
 * Loads the Stripe.js library lazily and memoizes the singleton promise.
 * Set VITE_STRIPE_PUBLISHABLE_KEY in apps/web/.env.local (use the dev-shared
 * sandbox publishable key per ADR-0012).
 */

import { loadStripe, type Stripe } from "@stripe/stripe-js";

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as
	| string
	| undefined;

let stripePromise: Promise<Stripe | null> | null = null;

const getStripe = (): Promise<Stripe | null> => {
	if (!stripePromise) {
		if (!stripePublishableKey) {
			console.error(
				"VITE_STRIPE_PUBLISHABLE_KEY is not set — Stripe.js will not load",
			);
			return Promise.resolve(null);
		}
		stripePromise = loadStripe(stripePublishableKey);
	}
	return stripePromise;
};

export default getStripe;
