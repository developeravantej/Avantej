/**
 * Script: Seed a SECOND tenant (for multi-tenant + saas e2e coverage)
 *
 * Provisions a second organization (real Neon branch) so the deferred
 * multi-tenant / saas e2e rows can run. Writes `_e2e/.auth/orgB.json` with the
 * new org's id for the specs to consume.
 *
 *   ⚠️  This creates a REAL, billable Neon project on your account. Tear it down
 *       when finished:  bun run scripts/seed-second-tenant.ts --teardown
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/seed-second-tenant.ts                       # provision org B (developer.avantej as owner/member)
 *   bun run scripts/seed-second-tenant.ts --payment-status=suspended   # provision + set paymentStatus (for saas specs)
 *   bun run scripts/seed-second-tenant.ts --set-status=active          # flip an existing org B's paymentStatus
 *   bun run scripts/seed-second-tenant.ts --teardown                   # delete the Neon project + org row
 *
 * After provisioning, run the gated specs:
 *   E2E_SECOND_TENANT=1 bunx playwright test --config _e2e/playwright.config.ts _e2e/web/multi-tenant _e2e/web/saas
 *
 * Pairing with the multi-tenant specs:
 *   - org B is owned/membered by developer.avantej@gmail.com (NOT the franchisee),
 *     so franchisee (admin.json, member of org A only) → org B == FORBIDDEN, and
 *     a developer session → org A == FORBIDDEN. That two-way denial is the
 *     isolation assertion.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { getControlPanelDb } from "../src/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import {
	provisionTenant,
	slugify,
} from "../src/services/tenant-provisioning.service";
import { deleteTenantProject } from "../src/services/neon.service";

const ORG_B_NAME = "E2E Second Tenant";
const ORG_B_SLUG = "e2e-second-tenant";
const OWNER_EMAIL = process.env.E2E_ORGB_OWNER ?? "developer.avantej@gmail.com";
const AUTH_OUT = resolve(__dirname, "../../../_e2e/.auth/orgB.json");

function arg(name: string): string | undefined {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit?.split("=")[1];
}
const has = (flag: string) => process.argv.includes(`--${flag}`);

async function findOrgB(db: ReturnType<typeof getControlPanelDb>) {
	return db.query.organizations.findFirst({
		where: eq(organizations.slug, slugify(ORG_B_SLUG)),
	});
}

async function teardown() {
	const db = getControlPanelDb();
	const org = await findOrgB(db);
	if (!org) {
		console.log("No org B found — nothing to tear down.");
		return;
	}
	if (org.neonProjectId) {
		await deleteTenantProject(org.neonProjectId);
		console.log(`Deleted Neon project ${org.neonProjectId}`);
	}
	await db.delete(organizations).where(eq(organizations.id, org.id));
	console.log(`Deleted org row ${org.id}`);
}

async function setStatus(status: string) {
	const db = getControlPanelDb();
	const org = await findOrgB(db);
	if (!org) throw new Error("org B not found — provision it first");
	await db
		.update(organizations)
		.set({ paymentStatus: status })
		.where(eq(organizations.id, org.id));
	console.log(`org B paymentStatus → ${status}`);
}

async function provision() {
	const db = getControlPanelDb();
	const existing = await findOrgB(db);
	let organizationId: string;
	if (existing) {
		organizationId = existing.id;
		console.log(`org B already exists: ${organizationId}`);
	} else {
		// adminUserId: any platform user id; the owner accepts via the invite link.
		const result = await provisionTenant(
			{
				name: ORG_B_NAME,
				slug: ORG_B_SLUG,
				country: "MY",
				ownerEmail: OWNER_EMAIL,
				ownerName: "E2E Org B Owner",
			},
			{
				controlPanelDb: db,
				adminUserId: process.env.E2E_ADMIN_USER_ID ?? "e2e-seed",
				frontendURL: process.env.FRONTEND_URL ?? "http://localhost:3021",
			},
		);
		organizationId = result.organizationId;
		console.log(`Provisioned org B: ${organizationId}`);
		console.log(`Owner invite: ${result.invitationLink}`);
		console.log(
			"NOTE: the owner (developer.avantej) must ACCEPT the invite to become an active member,",
		);
		console.log(
			"      then `bun e2e:seed`-style login captures _e2e/.auth/orgB.json for that user.",
		);
	}

	const paymentStatus = arg("payment-status");
	if (paymentStatus) await setStatus(paymentStatus);

	mkdirSync(resolve(__dirname, "../../../_e2e/.auth"), { recursive: true });
	writeFileSync(
		AUTH_OUT,
		`${JSON.stringify({ orgId: organizationId, ownerEmail: OWNER_EMAIL }, null, 2)}\n`,
	);
	console.log(`Wrote ${AUTH_OUT}`);
}

async function main() {
	if (has("teardown")) return teardown();
	const setOnly = arg("set-status");
	if (setOnly) return setStatus(setOnly);
	return provision();
}

main()
	.then(() => {
		console.log("✅ Done!");
		process.exit(0);
	})
	.catch((e) => {
		console.error("❌ seed-second-tenant failed:", e);
		process.exit(1);
	});
