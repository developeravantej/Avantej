/**
 * Shared resolution helpers for the branded print documents (invoice +
 * receipt): tenant billing identity, branch display block, and customer
 * contact. Used by routers/invoices/detail.procedures.ts and
 * routers/receipts/.
 */

import { eq } from "drizzle-orm";
import { getBillingProfile } from "@avantej-core/services";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { walkInCustomers } from "@avantej-core/db/schema/tenant/walk-in-customers";
import { getControlPanelDb } from "./context-helpers";
import { getProofsBucket, loadAsDataUrl } from "./r2-bucket";

// biome-ignore lint/suspicious/noExplicitAny: loose context stub; behaviour is asserted, not the type
type LooseTenantDb = any;

export type DocumentIdentity = {
	legalName: string | null;
	registrationNo: string | null;
	address: string | null;
	footerNote: string | null;
	logoDataUrl: string | null;
};

/**
 * Tenant document identity: billing profile fields with the logo inlined as a
 * data URL (print pages must not need authenticated R2 fetches). A missing
 * bucket binding degrades to no logo — it must never block printing.
 */
export async function resolveDocumentIdentity(context: {
	tenantDb: LooseTenantDb;
	honoContext?: unknown;
}): Promise<DocumentIdentity> {
	const profile = await getBillingProfile(context.tenantDb);
	let logoDataUrl: string | null = null;
	if (profile?.logoKey && profile.logoContentType) {
		try {
			logoDataUrl = await loadAsDataUrl(
				getProofsBucket(context),
				profile.logoKey,
				profile.logoContentType,
			);
		} catch {
			logoDataUrl = null;
		}
	}
	return {
		legalName: profile?.legalName ?? null,
		registrationNo: profile?.registrationNo ?? null,
		address: profile?.address ?? null,
		footerNote: profile?.footerNote ?? null,
		logoDataUrl,
	};
}

/** Branch display block (name + address) for a nullable branchId. */
export async function resolveBranchDisplay(
	tenantDb: LooseTenantDb,
	branchId: string | null,
): Promise<{ name: string; address: string | null } | null> {
	if (!branchId) return null;
	const [node, details] = await Promise.all([
		tenantDb.query.hierarchyNodes.findFirst({
			where: eq(hierarchyNodes.id, branchId),
			columns: { name: true },
		}),
		tenantDb.query.branchDetails.findFirst({
			where: eq(branchDetails.nodeId, branchId),
			columns: { address: true },
		}),
	]);
	if (!node) return null;
	return { name: node.name, address: details?.address ?? null };
}

/**
 * Customer contact for the BILLED TO block. Walk-in ids live in
 * walk_in_customers; the sentinel "anonymous" (quick-add walk-ins) must never
 * be looked up. Members: phone from customer_profiles (by userId), email from
 * the control-panel users table.
 */
export async function resolveCustomerContact(
	context: { tenantDb: LooseTenantDb; honoContext?: unknown },
	customerId: string | null,
	customerType: string | null,
): Promise<{ phone: string | null; email: string | null }> {
	if (!customerId || customerId === "anonymous") {
		return { phone: null, email: null };
	}
	if (customerType === "walk_in") {
		const walkIn = await context.tenantDb.query.walkInCustomers.findFirst({
			where: eq(walkInCustomers.id, customerId),
			columns: { phone: true, email: true },
		});
		return { phone: walkIn?.phone ?? null, email: walkIn?.email ?? null };
	}
	const cpDb = getControlPanelDb(
		context as Parameters<typeof getControlPanelDb>[0],
	);
	const [profile, cpUser] = await Promise.all([
		context.tenantDb.query.customerProfiles.findFirst({
			where: eq(customerProfiles.userId, customerId),
			columns: { phone: true },
		}),
		cpDb
			.select({ email: cpUsers.email })
			.from(cpUsers)
			.where(eq(cpUsers.id, customerId))
			.limit(1),
	]);
	return { phone: profile?.phone ?? null, email: cpUser[0]?.email ?? null };
}
