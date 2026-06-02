/**
 * Seed a TEST Stripe connected account so POS online/Stripe sales pass the SP-01
 * gate (orgCountryStripeAccounts.charges_enabled=true) in local dev.
 *
 * Usage:
 *   DATABASE_URL=$(grep ^DATABASE_URL= apps/server/.dev.vars | cut -d= -f2-) \
 *     node e2e/scripts/seed-stripe-account.mjs
 *
 * This does NOT touch Stripe — it only writes the control-panel row recordSale
 * checks. The stripe_account_id is a placeholder; recordSale uses a placeholder
 * intent id and never calls Stripe during the sale (confirmation is webhook-driven).
 */
import pg from "pg";

const ORG = process.env.SEED_ORG_ID ?? "996febce-aaad-4ded-8f47-02d2b566c8ee";
const url = process.env.DATABASE_URL;
if (!url) {
	console.error("DATABASE_URL is required");
	process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const r = await client.query(
	`INSERT INTO org_country_stripe_accounts
     (organization_id, country_code, stripe_account_id, stripe_connect_status,
      charges_enabled, payouts_enabled, details_submitted, currency)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
   ON CONFLICT (organization_id, country_code) DO UPDATE SET
     charges_enabled = EXCLUDED.charges_enabled,
     payouts_enabled = EXCLUDED.payouts_enabled,
     details_submitted = EXCLUDED.details_submitted,
     stripe_connect_status = EXCLUDED.stripe_connect_status
   RETURNING id, charges_enabled`,
	[ORG, "MY", "acct_test_e2e_seed", "active", true, true, true, "MYR"],
);
console.log("seeded org_country_stripe_accounts:", JSON.stringify(r.rows[0]));
await client.end();
