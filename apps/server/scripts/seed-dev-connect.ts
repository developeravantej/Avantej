/**
 * Idempotent local-dev seed: re-link Stripe Connect accounts to orgs after a
 * control-panel DB reset.
 *
 * Phase 4.5: writes directly to org_country_stripe_accounts (legacy
 * organizations.stripe_connect_account_id was dropped in migration 0020).
 *
 * Stripe-side connected accounts (acct_...) persist forever in test mode,
 * but our control-panel rows get wiped on `bun db:reset`. Without this seed,
 * every dev hits 10-15 min of manual onboarding form-filling per test org.
 * With it, link is restored in seconds.
 *
 * Run:
 *   DATABASE_URL=postgresql://... bun run apps/server/scripts/seed-dev-connect.ts
 *
 * To add a new mapping: onboard once via http://localhost:3001/billing/connect
 * (real OAuth flow), note the acct_... + country from Stripe Dashboard, then
 * append `{ orgSlug, countryCode, acctId }` to DEV_CONNECT_MAP below.
 */

import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";

// (org.slug, country_code) -> stripe connected account id (test mode).
// One row per onboarded (org, country). Each dev adds entries after their
// own first-time onboarding via the UI.
const DEV_CONNECT_MAP: Array<{
	slug: string;
	countryCode: string;
	currency: string;
	acctId: string;
}> = [
	{
		slug: "test-fitness-franchise",
		countryCode: "MY",
		currency: "MYR",
		acctId: "acct_1TWwNZGk6ShaTZfV",
	},
	// Add more as new test orgs / countries are onboarded.
];

async function main(): Promise<void> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error("DATABASE_URL is required");
		process.exit(1);
	}

	const pool = new Pool({ connectionString: databaseUrl });
	const db = drizzle({ client: pool });

	let linked = 0;
	let alreadyLinked = 0;
	let missingOrg = 0;

	for (const entry of DEV_CONNECT_MAP) {
		const { slug, countryCode, currency, acctId } = entry;
		const [org] = await db
			.select({ id: organizations.id })
			.from(organizations)
			.where(eq(organizations.slug, slug))
			.limit(1);

		if (!org) {
			console.warn(`[skip] no org with slug=${slug}`);
			missingOrg++;
			continue;
		}

		const [existing] = await db
			.select()
			.from(orgCountryStripeAccounts)
			.where(
				and(
					eq(orgCountryStripeAccounts.organizationId, org.id),
					eq(orgCountryStripeAccounts.countryCode, countryCode),
				),
			)
			.limit(1);

		if (existing?.stripeAccountId === acctId) {
			console.log(`[skip] ${slug}/${countryCode} already linked to ${acctId}`);
			alreadyLinked++;
			continue;
		}

		await db
			.insert(orgCountryStripeAccounts)
			.values({
				organizationId: org.id,
				countryCode,
				stripeAccountId: acctId,
				stripeConnectStatus: "active",
				stripeConnectAccountType: "standard",
				chargesEnabled: true,
				payoutsEnabled: false,
				detailsSubmitted: true,
				currency,
				stripeConnectOnboardingCompletedAt: new Date(),
				connectAccountUpdatedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [
					orgCountryStripeAccounts.organizationId,
					orgCountryStripeAccounts.countryCode,
				],
				set: {
					stripeAccountId: acctId,
					stripeConnectStatus: "active",
					chargesEnabled: true,
					detailsSubmitted: true,
					connectAccountUpdatedAt: new Date(),
					updatedAt: new Date(),
				},
			});

		console.log(`[linked] ${slug}/${countryCode} -> ${acctId}`);
		linked++;
	}

	await pool.end();
	console.log(
		`\nDone. linked=${linked} already=${alreadyLinked} missing_org=${missingOrg}`,
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
