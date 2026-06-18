/**
 * Branch Invite Service
 *
 * Handles creation and lifecycle management of branch self-signup invitations.
 * These are long-lived, multi-use invites encoded in QR codes at gym branches.
 * Unlike staff invitations, they have no target email and accept any new registrant.
 *
 * Key differences from staff invitations (kind='staff'):
 * - email is null (anyone can redeem)
 * - Long expiry (+10 years)
 * - usesCount / maxUses for capacity control
 * - isActive flag for soft-revocation without expiry manipulation
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { invitations } from "@avantej-core/db/schema/tenant/invitations";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type Invitation = typeof invitations.$inferSelect;

/**
 * Generate a URL-safe base64 token using Web Crypto API (Cloudflare Workers compatible).
 * 32 random bytes → 43 base64url chars (no padding).
 */
function generateBase64UrlToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	// Convert to base64url without using Buffer (Workers safe)
	const base64 = btoa(String.fromCharCode(...bytes));
	return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface CreateBranchInviteParams {
	branchId: string; // hierarchyScopeId — the tenant hierarchy node for this branch
	invitedBy: string; // userId of the admin creating the invite
	maxUses?: number | null;
}

export interface BranchInviteRow {
	id: string;
	token: string;
	hierarchyScopeId: string;
	usesCount: number;
	maxUses: number | null;
	isActive: boolean;
	expiresAt: Date;
	createdAt: Date;
	invitedBy: string;
}

/**
 * Create a new branch self-signup invitation.
 * Token is base64url-encoded 32 random bytes.
 * Expiry is set 10 years in the future.
 */
export async function createBranchInvite(
	tenantDb: TenantDb,
	params: CreateBranchInviteParams,
): Promise<Invitation> {
	const { branchId, invitedBy, maxUses } = params;

	const token = generateBase64UrlToken();

	// 10 years far-future expiry — effectively permanent until revoked
	const expiresAt = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);

	const rows = await tenantDb
		.insert(invitations)
		.values({
			email: null,
			role: "client",
			hierarchyScopeId: branchId,
			invitedBy,
			token,
			status: "pending",
			expiresAt,
			kind: "branch_self_signup",
			usesCount: 0,
			maxUses: maxUses ?? null,
			isActive: true,
		})
		.returning();

	const invite = rows[0];
	if (!invite) {
		throw new Error("Failed to create branch invite");
	}

	return invite;
}

/**
 * List all active branch self-signup invitations scoped to a given branch (hierarchyScopeId).
 */
export async function listBranchInvites(
	tenantDb: TenantDb,
	branchId: string,
): Promise<Invitation[]> {
	return tenantDb.query.invitations.findMany({
		where: and(
			eq(invitations.kind, "branch_self_signup"),
			eq(invitations.hierarchyScopeId, branchId),
			eq(invitations.isActive, true),
		),
		orderBy: (t, { desc }) => [desc(t.createdAt)],
	});
}

/**
 * List one row per accessible branch with that branch's most recent active
 * branch_self_signup invite (or null if none). Used by the Onboarding index page.
 */
export interface BranchInviteIndexRow {
	branchId: string;
	branchName: string;
	invite: {
		id: string;
		token: string;
		url: string;
		usesCount: number;
		maxUses: number | null;
		isActive: boolean;
		expiresAt: Date;
		createdAt: Date;
	} | null;
}

export async function listAllBranchInvites(
	tenantDb: TenantDb,
	accessibleNodeIds: string[],
	webBaseUrl: string,
): Promise<BranchInviteIndexRow[]> {
	if (accessibleNodeIds.length === 0) return [];

	// Branches the caller can see
	const branches = await tenantDb
		.select({
			id: hierarchyNodes.id,
			name: hierarchyNodes.name,
			type: hierarchyNodes.type,
		})
		.from(hierarchyNodes)
		.where(
			and(
				eq(hierarchyNodes.type, "branch"),
				inArray(hierarchyNodes.id, accessibleNodeIds),
			),
		);

	if (branches.length === 0) return [];

	const branchIds = branches.map((b) => b.id);
	// Most recent active invite per branch
	const invitesRaw = await tenantDb
		.select({
			id: invitations.id,
			token: invitations.token,
			hierarchyScopeId: invitations.hierarchyScopeId,
			usesCount: invitations.usesCount,
			maxUses: invitations.maxUses,
			isActive: invitations.isActive,
			expiresAt: invitations.expiresAt,
			createdAt: invitations.createdAt,
		})
		.from(invitations)
		.where(
			and(
				eq(invitations.kind, "branch_self_signup"),
				eq(invitations.isActive, true),
				inArray(invitations.hierarchyScopeId, branchIds),
			),
		)
		.orderBy(desc(invitations.createdAt));

	// Keep only the latest invite per branch
	const latest = new Map<string, (typeof invitesRaw)[number]>();
	for (const inv of invitesRaw) {
		if (inv.hierarchyScopeId && !latest.has(inv.hierarchyScopeId)) {
			latest.set(inv.hierarchyScopeId, inv);
		}
	}

	return branches.map((b) => {
		const inv = latest.get(b.id);
		return {
			branchId: b.id,
			branchName: b.name,
			invite: inv
				? {
						id: inv.id,
						token: inv.token,
						url: `${webBaseUrl}/onboarding/${inv.token}`,
						usesCount: inv.usesCount ?? 0,
						maxUses: inv.maxUses ?? null,
						isActive: inv.isActive ?? true,
						expiresAt: inv.expiresAt,
						createdAt: inv.createdAt,
					}
				: null,
		};
	});
}

/**
 * Soft-revoke a branch invite by setting isActive=false.
 * Does not change status so usesCount history is preserved.
 */
export async function revokeBranchInvite(
	tenantDb: TenantDb,
	inviteId: string,
): Promise<Invitation> {
	const [updated] = await tenantDb
		.update(invitations)
		.set({ isActive: false })
		.where(
			and(
				eq(invitations.id, inviteId),
				eq(invitations.kind, "branch_self_signup"),
			),
		)
		.returning();

	if (!updated) {
		throw new Error("Branch invite not found");
	}

	return updated;
}

/**
 * Validate a branch self-signup invite.
 * Returns the invite if valid, throws ORPCError-friendly errors otherwise.
 */
export type BranchInviteValidationError =
	| "NOT_FOUND"
	| "REVOKED"
	| "EXPIRED"
	| "MAX_USES_REACHED";

export interface ValidateBranchInviteResult {
	invite: Invitation;
	error?: BranchInviteValidationError;
	isValid: boolean;
}

export async function validateBranchInvite(
	tenantDb: TenantDb,
	token: string,
): Promise<ValidateBranchInviteResult> {
	const invite = await tenantDb.query.invitations.findFirst({
		where: and(
			eq(invitations.token, token),
			eq(invitations.kind, "branch_self_signup"),
		),
	});

	if (!invite) {
		return {
			invite: null as unknown as Invitation,
			isValid: false,
			error: "NOT_FOUND",
		};
	}

	if (!invite.isActive) {
		return { invite, isValid: false, error: "REVOKED" };
	}

	if (new Date() > invite.expiresAt) {
		return { invite, isValid: false, error: "EXPIRED" };
	}

	if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
		return { invite, isValid: false, error: "MAX_USES_REACHED" };
	}

	return { invite, isValid: true };
}

/**
 * Atomically increment usesCount on a branch invite.
 * Must be called only after the member row is successfully inserted.
 */
export async function incrementBranchInviteUses(
	tenantDb: TenantDb,
	inviteId: string,
): Promise<void> {
	await tenantDb
		.update(invitations)
		.set({ usesCount: sql`uses_count + 1` })
		.where(eq(invitations.id, inviteId));
}
