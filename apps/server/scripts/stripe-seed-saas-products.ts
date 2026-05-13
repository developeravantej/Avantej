/**
 * Idempotent seed for SaaS Products + Prices in the Stripe sandbox.
 *
 * Per ADR-0002 (tier pricing) and ADR-0012 (sandbox topology).
 *
 * Run with the dev-shared sandbox secret in env:
 *   STRIPE_SECRET_KEY=sk_test_... bun run scripts/stripe-seed-saas-products.ts
 *
 * Outputs the resulting price IDs; copy them into your .env.local as
 *   STRIPE_PRICE_BASIC=price_xxx
 *   STRIPE_PRICE_PROFESSIONAL=price_yyy
 *   STRIPE_PRICE_ENTERPRISE=price_zzz
 *
 * Idempotency: products/prices are matched by metadata.seedKey + seedVersion;
 * re-running prints "[skip]" for already-seeded entities.
 */

import Stripe from "stripe";

const SEED_VERSION = "avantej-saas-v1";

const tiers = [
	{
		key: "basic",
		name: "Avantej SaaS — Basic",
		description: "Single org, 25 staff, 100 customers/mo, 3% app fee.",
		amount: 4900, // $49.00 in cents
	},
	{
		key: "professional",
		name: "Avantej SaaS — Professional",
		description:
			"Up to 5 orgs, 1000 customers/mo, GHL + memberships, 2% app fee.",
		amount: 14900, // $149.00 in cents
	},
	{
		key: "enterprise",
		name: "Avantej SaaS — Enterprise",
		description: "Unlimited; lowest fees; dedicated CSM.",
		amount: 49900, // $499.00 in cents
	},
];

async function main() {
	const sk = process.env.STRIPE_SECRET_KEY;
	if (!sk) throw new Error("STRIPE_SECRET_KEY env var is required");
	const stripe = new Stripe(sk, { apiVersion: "2025-10-29.clover" });

	for (const tier of tiers) {
		// Find existing product by metadata.seedKey + seedVersion.
		const existing = await stripe.products.search({
			query: `metadata['seedKey']:'${tier.key}' AND metadata['seedVersion']:'${SEED_VERSION}'`,
			limit: 1,
		});

		let product: Stripe.Product;
		if (existing.data.length > 0) {
			product = existing.data[0]!;
			console.log(`[skip] product ${tier.key} exists: ${product.id}`);
		} else {
			product = await stripe.products.create({
				name: tier.name,
				description: tier.description,
				metadata: { seedKey: tier.key, seedVersion: SEED_VERSION },
			});
			console.log(`[create] product ${tier.key}: ${product.id}`);
		}

		// Find existing recurring price for this product+amount+interval.
		const prices = await stripe.prices.list({
			product: product.id,
			active: true,
			limit: 10,
		});
		const matchingPrice = prices.data.find(
			(p) =>
				p.unit_amount === tier.amount &&
				p.recurring?.interval === "month" &&
				p.currency === "usd",
		);

		let price: Stripe.Price;
		if (matchingPrice) {
			price = matchingPrice;
			console.log(`  [skip] price ${tier.key}: ${price.id}`);
		} else {
			price = await stripe.prices.create({
				product: product.id,
				unit_amount: tier.amount,
				currency: "usd",
				recurring: { interval: "month" },
				metadata: { seedKey: tier.key, seedVersion: SEED_VERSION },
			});
			console.log(`  [create] price ${tier.key}: ${price.id}`);
		}

		console.log(`STRIPE_PRICE_${tier.key.toUpperCase()}=${price.id}`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
