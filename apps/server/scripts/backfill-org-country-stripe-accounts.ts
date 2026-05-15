/**
 * Phase 4 — Backfill org_country_stripe_accounts from existing org-level
 * stripe_connect_account_id values.
 *
 * For each org with a legacy stripe_connect_account_id, fetch the country
 * from Stripe via stripe.accounts.retrieve(), then UPSERT a row into
 * org_country_stripe_accounts. Idempotent — re-running skips rows that
 * already match.
 *
 * Run after migration 0019:
 *   DATABASE_URL=... STRIPE_SECRET_KEY=sk_test_... bun run \
 *     apps/server/scripts/backfill-org-country-stripe-accounts.ts
 */

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, eq, isNotNull } from "drizzle-orm";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";

// ISO 3166-1 alpha-2 country -> ISO 4217 currency (Stripe-supported pairs).
const COUNTRY_TO_CURRENCY: Record<string, string> = {
	MY: "MYR",
	SG: "SGD",
	TH: "THB",
	ID: "IDR",
	PH: "PHP",
	VN: "VND",
	HK: "HKD",
	AU: "AUD",
	NZ: "NZD",
	US: "USD",
	GB: "GBP",
	JP: "JPY",
	CN: "CNY",
};

async function fetchStripeAccountCountry(
	acctId: string,
	secretKey: string,
): Promise<string | null> {
	const res = await fetch(`https://api.stripe.com/v1/accounts/${acctId}`, {
		headers: { Authorization: `Bearer ${secretKey}` },
	});
	if (!res.ok) {
		const body = await res.text();
		console.warn(`[backfill] accounts.retrieve(${acctId}) ${res.status}: ${body.slice(0, 200)}`);
		return null;
	}
	const json = (await res.json()) as { country?: string };
	return json.country ? json.country.toUpperCase() : null;
}

async function main() {
	const dbUrl = process.env.DATABASE_URL;
	const secretKey = process.env.STRIPE_SECRET_KEY;
	if (!dbUrl || !secretKey) {
		console.error("DATABASE_URL + STRIPE_SECRET_KEY required");
		process.exit(1);
	}

	const pool = new Pool({ connectionString: dbUrl });
	const db = drizzle({ client: pool });

	const orgs = await db
		.select()
		.from(organizations)
		.where(isNotNull(organizations.stripeConnectAccountId));

	console.log(`Found ${orgs.length} org(s) with legacy stripeConnectAccountId`);

	let inserted = 0;
	let skipped = 0;
	let failed = 0;

	for (const org of orgs) {
		const acctId = org.stripeConnectAccountId!;
		const country = await fetchStripeAccountCountry(acctId, secretKey);
		if (!country) {
			console.warn(`[skip-failed] org=${org.slug} acct=${acctId} — could not resolve country`);
			failed++;
			continue;
		}
		const currency = COUNTRY_TO_CURRENCY[country] ?? country;
		const [existing] = await db
			.select()
			.from(orgCountryStripeAccounts)
			.where(
				and(
					eq(orgCountryStripeAccounts.organizationId, org.id),
					eq(orgCountryStripeAccounts.countryCode, country),
				),
			)
			.limit(1);

		if (existing) {
			console.log(`[skip] org=${org.slug} country=${country} already linked acct=${existing.stripeAccountId}`);
			skipped++;
			continue;
		}

		await db.insert(orgCountryStripeAccounts).values({
			organizationId: org.id,
			countryCode: country,
			stripeAccountId: acctId,
			stripeConnectStatus: org.stripeConnectStatus,
			stripeConnectAccountType: org.stripeConnectAccountType,
			chargesEnabled: org.chargesEnabled,
			payoutsEnabled: org.payoutsEnabled,
			detailsSubmitted: org.detailsSubmitted,
			currency,
			stripeConnectOnboardingCompletedAt: org.stripeConnectOnboardingCompletedAt,
			connectAccountUpdatedAt: org.connectAccountUpdatedAt ?? new Date(),
		});
		console.log(`[insert] org=${org.slug} country=${country} currency=${currency} acct=${acctId}`);
		inserted++;
	}

	console.log(`\nDone. inserted=${inserted} skipped=${skipped} failed=${failed}`);
	await pool.end();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
