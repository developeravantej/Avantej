/**
 * Tenant Provisioning Service (Plan E Phase E.7).
 *
 * Programmatic counterpart to `apps/server/scripts/migrate-existing-tenant.ts` —
 * but for spinning up a *new* tenant from the platform-admin wizard.
 *
 * Steps (in order):
 *   1. Validate slug uniqueness against control_panel.organizations.
 *   2. Create a Neon project via the Neon API (reuses createTenantProject).
 *   3. Run tenant migrations against the new project.
 *   4. Insert the organizations row (no ownerUserId yet — set on invite accept).
 *   5. Seed RBAC + create the root hierarchy node.
 *   6. Create an admin-role invitation in the tenant DB (reuses createInvitation).
 *   7. Send the invitation email (reuses sendInvitationEmail).
 *   8. Write an admin_session_actions audit row (action_type='tenant_provision').
 *
 * Cleanup: if any post-Neon-creation step throws we best-effort delete the
 * Neon project to avoid leaking orphan tenants (mirrors the policy in
 * organizations.routes.ts).
 *
 * Country: persisted on organizations.country_code (Plan E follow-up
 * migration 0025). Also retained in the audit metadata so historical
 * runs prior to the column being added remain queryable. Per-country
 * Stripe Connect accounts continue to live in
 * org_country_stripe_accounts, so the country code is
 * recorded in the audit metadata only. The wizard collects it so it lights
 * up the future per-country Connect onboarding path without a schema change.
 */

import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import {
	encrypt,
	runTenantMigrations,
	seedRBACData,
	LATEST_MIGRATION_VERSION,
} from "@avantej-core/db";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { createInvitation } from "@avantej-core/services";
import {
	createTenantProject,
	deleteTenantProject,
} from "@/services/neon.service";
import { sendInvitationEmail } from "@/lib/email";

export type ProvisionTenantInput = {
	name: string;
	slug: string;
	country: "MY" | "SG" | "TH";
	ownerEmail: string;
	ownerName?: string;
};

export type ProvisionTenantDeps = {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	adminUserId: string;
	inviterName?: string;
	frontendURL: string;
};

export type ProvisionTenantResult = {
	organizationId: string;
	slug: string;
	neonProjectId: string;
	invitationToken: string;
	invitationLink: string;
};

function slugify(raw: string): string {
	return raw
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function validateSlug(slug: string): boolean {
	return /^[a-z0-9-]+$/.test(slug) && slug.length >= 3 && slug.length <= 64;
}

export async function provisionTenant(
	input: ProvisionTenantInput,
	deps: ProvisionTenantDeps,
): Promise<ProvisionTenantResult> {
	const { controlPanelDb, adminUserId, inviterName, frontendURL } = deps;

	const name = input.name.trim();
	const slug = slugify(input.slug);
	const country = input.country;
	const ownerEmail = input.ownerEmail.trim().toLowerCase();

	if (name.length < 2) {
		throw new Error("Organization name must be at least 2 characters");
	}
	if (!validateSlug(slug)) {
		throw new Error(
			"Slug must be 3-64 chars, lowercase letters, digits, or hyphens",
		);
	}
	if (!["MY", "SG", "TH"].includes(country)) {
		throw new Error("Country must be one of: MY, SG, TH");
	}

	// 1. Slug uniqueness
	const existing = await controlPanelDb.query.organizations.findFirst({
		where: eq(organizations.slug, slug),
	});
	if (existing) {
		throw new Error(`Slug already taken: ${slug}`);
	}

	let provisionedProjectId: string | null = null;
	try {
		// 2. Create Neon project
		const { projectId, connectionString } = await createTenantProject({
			slug,
			region: "aws-ap-southeast-1",
		});
		provisionedProjectId = projectId;

		// 3. Run tenant migrations
		await runTenantMigrations(connectionString);

		// 4. Insert org row (ownerUserId stays null until owner accepts invite)
		const encryptedConnectionString = encrypt(connectionString);
		const [organization] = await controlPanelDb
			.insert(organizations)
			.values({
				name,
				slug,
				neonProjectId: projectId,
				connectionString: encryptedConnectionString,
				paymentStatus: "active",
				schemaVersion: LATEST_MIGRATION_VERSION,
				countryCode: country,
				// subscriptionId & ownerUserId stay null until the owner accepts the
				// invite and (optionally) subscribes. Cast satisfies Drizzle's insert
				// type which currently treats these nullable columns as required.
				subscriptionId: null,
				ownerUserId: null,
			} as unknown as typeof organizations.$inferInsert)
			.returning({
				id: organizations.id,
				slug: organizations.slug,
				neonProjectId: organizations.neonProjectId,
			});

		if (!organization) {
			throw new Error("Failed to insert organization row");
		}

		// 5. Seed RBAC + root hierarchy node
		const tenantPool = new Pool({ connectionString });
		const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

		let invitationToken: string;
		try {
			await seedRBACData(tenantDb);

			const [orgNode] = await tenantDb
				.insert(hierarchyNodes)
				.values({
					name,
					slug,
					type: "organization",
					depth: 0,
					parentId: null,
				})
				.returning();

			if (!orgNode) {
				throw new Error("Failed to create root hierarchy node");
			}

			// 6. Create admin-role invitation for the owner
			const invitation = await createInvitation({
				email: ownerEmail,
				role: "admin",
				hierarchyScopeId: orgNode.id,
				invitedBy: adminUserId,
				tenantDb,
			});
			invitationToken = invitation.token;
		} finally {
			await tenantPool.end().catch(() => {
				/* swallow pool close errors */
			});
		}

		const invitationLink = `${frontendURL.replace(/\/$/, "")}/accept-invitation?token=${invitationToken}&orgId=${organization.id}`;

		// 7. Email the owner (best-effort — failure to email shouldn't roll back
		// the Neon project; the admin can resend from the invitations UI).
		try {
			await sendInvitationEmail(
				ownerEmail,
				invitationLink,
				name,
				inviterName,
				"admin",
			);
		} catch (err) {
			console.error(
				"[provisionTenant] invite email failed (org still created):",
				err,
			);
		}

		// 8. Audit row
		await controlPanelDb.insert(adminSessionActions).values({
			adminUserId,
			actionType: "tenant_provision",
			targetOrganizationId: organization.id,
			metadata: {
				slug,
				country,
				ownerEmail,
				ownerName: input.ownerName ?? null,
				neonProjectId: projectId,
				invitationToken,
			},
		} as unknown as typeof adminSessionActions.$inferInsert);

		return {
			organizationId: organization.id,
			slug: organization.slug,
			neonProjectId: organization.neonProjectId ?? projectId,
			invitationToken,
			invitationLink,
		};
	} catch (err) {
		// Best-effort cleanup: delete the Neon project if we created one.
		if (provisionedProjectId) {
			try {
				await deleteTenantProject(provisionedProjectId);
			} catch (cleanupErr) {
				console.error(
					`[provisionTenant] cleanup of Neon project ${provisionedProjectId} failed:`,
					cleanupErr,
				);
			}
		}
		throw err;
	}
}
