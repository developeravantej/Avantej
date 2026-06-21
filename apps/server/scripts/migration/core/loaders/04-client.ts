/**
 * CanonicalClient[] → control-panel user + organization_members (role client) +
 * tenant members (role client) + customer_profiles.
 *
 * Identity + structured address land on the `user` table (idPassportNo,
 * address parts, dob, emergency contact); the profile carries the contact/fitness
 * view. Lazy login (emailVerified=false, isUnclaimed=true, no credential).
 *
 * Shared family emails (account_groups) are NOT in this dataset; if a second
 * client reuses an email that already has a primary profile, we flag and skip
 * the duplicate rather than violate the userId-unique index — a proper
 * account_group dependent path is a later enhancement.
 *
 * Crosswalk: ('client', legacyId) → user.id (used by sales.customerId,
 * appointments.userId, package_instances.clientId — all text userId).
 */
import { sql } from "drizzle-orm";
import type { CanonicalClient } from "../canonical";
import { lookup, record } from "../crosswalk";
import type { CpTx, Tx } from "../../lib/db";
import type { MigrationLog } from "../../lib/log";

interface Ctx {
	cpTx: CpTx;
	tx: Tx;
	orgId: string;
	rootId: string;
	log: MigrationLog;
}

function dateOnly(d: Date | null | undefined): string | null {
	return d ? d.toISOString().slice(0, 10) : null;
}

export async function loadClients(
	clients: CanonicalClient[],
	ctx: Ctx,
): Promise<void> {
	const { cpTx, tx, orgId, rootId, log } = ctx;
	const now = new Date();

	for (const c of clients) {
		const email = c.email.trim().toLowerCase();
		if (!email) {
			log.skipped("client (no email)", c.legacyId);
			continue;
		}
		if (await lookup(tx, "client", c.legacyId, c.sourceSystem)) {
			log.skipped("client", email);
			continue;
		}

		// 1) Control-panel user — dedup by email.
		let userId: string;
		const existingUser = await cpTx.execute(
			sql`SELECT id FROM "user" WHERE email = ${email} LIMIT 1`,
		);
		const foundUserId = existingUser.rows[0]?.id;
		if (typeof foundUserId === "string") {
			userId = foundUserId;
			log.skipped("cp user", email);
		} else {
			userId = crypto.randomUUID();
			await cpTx.execute(sql`
				INSERT INTO "user"
					(id, name, first_name, last_name, email, email_verified, phone,
					 id_passport_no, address_type, street_address, city, state, country, postal_code,
					 date_of_birth, emergency_contact_name, emergency_contact_relationship,
					 emergency_contact_phone, created_at, updated_at)
				VALUES
					(${userId}, ${c.name}, ${c.firstName ?? ""}, ${c.lastName ?? ""}, ${email}, false, ${c.phone ?? null},
					 ${c.identityNo ?? null}, ${c.addressType ?? null}, ${c.address ?? null}, ${c.city ?? null}, ${c.state ?? null}, ${c.country ?? null}, ${c.postalCode ?? null},
					 ${dateOnly(c.dateOfBirth)}, ${c.emergencyContactName ?? null}, ${c.emergencyContactRelationship ?? null},
					 ${c.emergencyContactPhone ?? null}, ${now}, ${now})
			`);
			log.created("cp user", email);
		}

		// 2) organization_members (role client).
		const existingOrgMember = await cpTx.execute(sql`
			SELECT id FROM organization_members
			WHERE user_id = ${userId} AND organization_id = ${orgId} LIMIT 1
		`);
		if (!existingOrgMember.rows[0]) {
			await cpTx.execute(sql`
				INSERT INTO organization_members (user_id, organization_id, role, status)
				VALUES (${userId}, ${orgId}, 'client', ${c.status})
			`);
			log.created("org member (client)", email);
		}

		// 3) tenant member (role client) — scope from home branch.
		let scopeId = rootId;
		if (c.homeBranchLegacyId) {
			const branchNodeId = await lookup(
				tx,
				"location",
				c.homeBranchLegacyId,
				c.sourceSystem,
			);
			if (branchNodeId) scopeId = branchNodeId;
			else
				log.dropField(
					`client.home_branch_id unresolved (${c.homeBranchLegacyId})`,
				);
		}
		const existingMember = await tx.execute(
			sql`SELECT id FROM members WHERE user_id = ${userId} LIMIT 1`,
		);
		if (!existingMember.rows[0]) {
			await tx.execute(sql`
				INSERT INTO members (user_id, role, hierarchy_scope_id, status)
				VALUES (${userId}, 'client', ${scopeId}, ${c.status})
			`);
			log.created("tenant member (client)", email);
		}

		// 4) customer_profiles — guard against shared-email duplicate (no account_group yet).
		const existingProfile = await tx.execute(
			sql`SELECT id FROM customer_profiles WHERE user_id = ${userId} LIMIT 1`,
		);
		if (existingProfile.rows[0]) {
			log.dropField(`shared email — needs account_group (${email})`);
		} else {
			let primaryStaffMemberId: string | null = null;
			if (c.primaryCoachLegacyId) {
				primaryStaffMemberId = await lookup(
					tx,
					"staff_member",
					c.primaryCoachLegacyId,
					c.sourceSystem,
				);
				if (!primaryStaffMemberId)
					log.dropField(
						`client.primary_coach unresolved (${c.primaryCoachLegacyId})`,
					);
			}
			await tx.execute(sql`
				INSERT INTO customer_profiles
					(user_id, phone, date_of_birth, gender, address,
					 emergency_contact_name, emergency_contact_phone,
					 primary_staff_member_id, is_unclaimed, is_deleted)
				VALUES
					(${userId}, ${c.phone ?? null}, ${c.dateOfBirth ?? null}, ${c.gender ?? null}, ${c.address ?? null},
					 ${c.emergencyContactName ?? null}, ${c.emergencyContactPhone ?? null},
					 ${primaryStaffMemberId}, true, false)
			`);
			log.created("customer profile", email);
		}

		await record(tx, "client", c.legacyId, c.sourceSystem, "user", userId);
	}
}
