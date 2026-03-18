// TODO: Replace with oRPC client call
// See: utils/orpc.ts for API client pattern
// Old API: Stripe integration for checkout sessions
// This file contains Stripe client-side utilities

// TODO: Install @stripe/stripe-js when Stripe integration is needed
// import { loadStripe, type Stripe } from "@stripe/stripe-js";
type Stripe = any;

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

let stripePromise: Promise<Stripe | null> | null = null;

const getStripe = (): Promise<Stripe | null> => {
  // TODO: Implement Stripe integration when needed
  // if (!stripePromise) {
  //   stripePromise = loadStripe(stripePublishableKey);
  // }
  // return stripePromise || Promise.resolve(null);
  return Promise.resolve(null);
};

export default getStripe;


