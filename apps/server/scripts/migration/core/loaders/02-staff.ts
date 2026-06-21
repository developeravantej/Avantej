/**
 * CanonicalStaff[] → three-way provisioning (cross-DB):
 *   control-panel  : user (Better-Auth) + organization_members cache
 *   tenant         : members (+ member_profiles)
 *
 * Decision #4 = provision logins, but lazily: users are created
 * emailVerified=false with NO credential account, so they claim via
 * magic-link / password-reset rather than a mass invite blast.
 *
 * Dedup is by email (handles staff-who-are-also-clients and re-runs). Idempotent
 * via the crosswalk. Records TWO crosswalk rows per staff so later loaders can
 * resolve either id they need:
 *   ('staff',        legacyId) → user.id   (text; used by created_by / commission staffId)
 *   ('staff_member', legacyId) → members.id (uuid; used by FK fields like trainerId)
 *
 * Cross-DB caveat: CP and tenant commits are not atomic. The tenant tx commits
 * first, then CP. A failure between them leaves a tenant member without its CP
 * user — recoverable by re-running (dedup by email re-links).
 */
import { sql } from "drizzle-orm";
import type { CanonicalStaff } from "../canonical";
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

export async function loadStaff(
	staff: CanonicalStaff[],
	ctx: Ctx,
): Promise<void> {
	const { cpTx, tx, orgId, rootId, log } = ctx;
	const now = new Date();

	for (const s of staff) {
		const email = s.email.trim().toLowerCase();
		if (!email) {
			log.skipped("staff (no email)", s.legacyId);
			continue;
		}

		if (await lookup(tx, "staff", s.legacyId, s.sourceSystem)) {
			log.skipped("staff", email);
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
				INSERT INTO "user" (id, name, first_name, last_name, email, email_verified, created_at, updated_at)
				VALUES (${userId}, ${s.name}, ${s.firstName ?? ""}, ${s.lastName ?? ""}, ${email}, false, ${now}, ${now})
			`);
			log.created("cp user", email);
		}

		// 2) organization_members cache (control panel).
		const existingOrgMember = await cpTx.execute(sql`
			SELECT id FROM organization_members
			WHERE user_id = ${userId} AND organization_id = ${orgId} LIMIT 1
		`);
		if (!existingOrgMember.rows[0]) {
			await cpTx.execute(sql`
				INSERT INTO organization_members (user_id, organization_id, role, status)
				VALUES (${userId}, ${orgId}, ${s.role}, ${s.status})
			`);
			log.created("org member", email);
		}

		// 3) tenant member — hierarchyScopeId from the location crosswalk.
		let scopeId = rootId;
		if (s.homeBranchLegacyId) {
			const branchNodeId = await lookup(
				tx,
				"location",
				s.homeBranchLegacyId,
				s.sourceSystem,
			);
			if (branchNodeId) scopeId = branchNodeId;
			else
				log.dropField(
					`staff.home_branch_id unresolved (${s.homeBranchLegacyId})`,
				);
		}

		let memberId: string;
		const existingMember = await tx.execute(
			sql`SELECT id FROM members WHERE user_id = ${userId} LIMIT 1`,
		);
		const foundMemberId = existingMember.rows[0]?.id;
		if (typeof foundMemberId === "string") {
			memberId = foundMemberId;
			log.skipped("tenant member", email);
		} else {
			const created = await tx.execute(sql`
				INSERT INTO members (user_id, role, hierarchy_scope_id, status)
				VALUES (${userId}, ${s.role}, ${scopeId}, ${s.status})
				RETURNING id
			`);
			const newId = created.rows[0]?.id;
			if (typeof newId !== "string")
				throw new Error(`member insert failed: ${email}`);
			memberId = newId;
			log.created("tenant member", email);
		}

		// 4) member_profiles (only when we have something to store).
		if (s.displayName || s.phone) {
			await tx.execute(sql`
				INSERT INTO member_profiles (member_id, display_name, phone_number)
				VALUES (${memberId}, ${s.displayName ?? null}, ${s.phone ?? null})
				ON CONFLICT (member_id) DO UPDATE
					SET display_name = COALESCE(EXCLUDED.display_name, member_profiles.display_name),
					    phone_number = COALESCE(EXCLUDED.phone_number, member_profiles.phone_number)
			`);
		}

		// 5) crosswalk — both ids.
		await record(tx, "staff", s.legacyId, s.sourceSystem, "user", userId);
		await record(
			tx,
			"staff_member",
			s.legacyId,
			s.sourceSystem,
			"members",
			memberId,
		);
	}
}
