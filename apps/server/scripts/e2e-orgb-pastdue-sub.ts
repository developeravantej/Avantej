/**
 * E2E fixture: put org B into a "past_due past grace" SaaS state so the
 * require-active-saas-sub middleware returns SAAS_PAST_DUE_READONLY on writes
 * while reads pass. Creates a subscriptions row (status=past_due,
 * gracePeriodEndsAt in the past), links org B via organizations.subscriptionId,
 * and resets paymentStatus to "active" (so orpc-tenant doesn't 403 first).
 *
 *   cd apps/server && bun run scripts/e2e-orgb-pastdue-sub.ts
 *   bun run scripts/e2e-orgb-pastdue-sub.ts --clear   # detach the sub (back to no-sub)
 *
 * Slug-scoped to org B ("e2e-second-tenant"); refuses to touch any other org.
 */
import { eq } from "drizzle-orm";
import { getControlPanelDb } from "../src/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { slugify } from "../src/services/tenant-provisioning.service";

const ORG_B_SLUG = "e2e-second-tenant";
const clear = process.argv.includes("--clear");

async function main() {
	const db = getControlPanelDb();
	const org = await db.query.organizations.findFirst({
		where: eq(organizations.slug, slugify(ORG_B_SLUG)),
	});
	if (!org) throw new Error("org B not found — provision it first");

	if (clear) {
		await db
			.update(organizations)
			.set({ subscriptionId: null })
			.where(eq(organizations.id, org.id));
		console.log("org B subscriptionId cleared");
		return;
	}

	const now = Date.now();
	const past = new Date(now - 7 * 24 * 60 * 60 * 1000); // 7 days ago (grace expired)
	const stamp = String(now);

	const [sub] = await db
		.insert(subscriptions)
		.values({
			stripeSubscriptionId: `sub_e2e_pastdue_${stamp}`,
			stripeCustomerId: `cus_e2e_pastdue_${stamp}`,
			stripePriceId: "price_e2e_professional",
			tier: "professional",
			organizationCountLimit: 3,
			applicationFeeBps: 200,
			status: "past_due",
			pastDueAt: past,
			gracePeriodEndsAt: past, // in the PAST -> past_due_past_grace -> read_only
		})
		.returning();
	if (!sub) throw new Error("failed to create past_due subscription");

	await db
		.update(organizations)
		// keep paymentStatus active so the suspended/cancelled 403 doesn't fire first;
		// read-only is decided by the subscription's past_due+expired-grace.
		.set({ subscriptionId: sub.id, paymentStatus: "active" })
		.where(eq(organizations.id, org.id));

	console.log(
		`org B -> past_due sub ${sub.id} (grace ${past.toISOString()}), paymentStatus=active`,
	);
}

main()
	.then(() => {
		console.log("✅ Done!");
		process.exit(0);
	})
	.catch((e) => {
		console.error("❌ e2e-orgb-pastdue-sub failed:", e);
		process.exit(1);
	});
