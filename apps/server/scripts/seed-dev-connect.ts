/**
 * Idempotent local-dev seed: re-link Stripe Connect accounts to orgs after a
 * control-panel DB reset.
 *
 * Why: Stripe-side connected accounts (acct_...) persist forever in test mode,
 * but our organizations.stripe_connect_account_id column gets wiped on
 * `bun db:reset`. Without this seed, every dev hits 10-15 min of manual
 * onboarding form-filling per test org. With it, link is restored in seconds.
 *
 * Multi-tenant safe: map is keyed by org slug, one acct per org. Add entries
 * as you onboard new test tenants. Production unaffected (script in scripts/,
 * not runtime).
 *
 * Run:
 *   DATABASE_URL=postgresql://... bun run apps/server/scripts/seed-dev-connect.ts
 *
 * To add a new mapping:
 *   1. Onboard once via http://localhost:3001/billing/connect (real OAuth flow)
 *   2. Note the acct_... in Stripe Dashboard -> Connect -> Accounts
 *   3. Append `<orgSlug>: acct_...` to DEV_CONNECT_MAP below
 *   4. Commit
 */

import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";

// org.slug -> stripe connected account id (test mode, one row per onboarded org).
// Each developer onboards once via the real OAuth flow; persist the acct here.
const DEV_CONNECT_MAP: Record<string, string> = {
	"test-fitness-franchise": "acct_1TWwNZGk6ShaTZfV",
	// Add more as new test orgs are onboarded.
};

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

	for (const [slug, acctId] of Object.entries(DEV_CONNECT_MAP)) {
		const [org] = await db
			.select()
			.from(organizations)
			.where(eq(organizations.slug, slug))
			.limit(1);

		if (!org) {
			console.warn(`[skip] no org with slug=${slug}`);
			missingOrg++;
			continue;
		}

		if (org.stripeConnectAccountId === acctId) {
			console.log(`[skip] ${slug} already linked to ${acctId}`);
			alreadyLinked++;
			continue;
		}

		await db
			.update(organizations)
			.set({
				stripeConnectAccountId: acctId,
				stripeConnectAccountType: "standard",
				stripeConnectStatus: "active",
				chargesEnabled: true,
				payoutsEnabled: false,
				detailsSubmitted: true,
				stripeConnectOnboardingCompletedAt:
					org.stripeConnectOnboardingCompletedAt ?? new Date(),
				connectAccountUpdatedAt: new Date(),
			})
			.where(eq(organizations.id, org.id));

		console.log(`[linked] ${slug} -> ${acctId}`);
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
