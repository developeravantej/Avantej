/**
 * Invitation Service
 *
 * Handles invitation creation, validation, and management for tenant organizations.
 * Invitations are stored in tenant databases and link users to organizations with specific roles and hierarchy scopes.
 *
 * Usage:
 * ```typescript
 * import { createInvitation, getInvitationByToken, listInvitations } from "@avantej-core/services";
 *
 * const invitation = await createInvitation({
 *   email: "user@example.com",
 *   role: "trainer",
 *   hierarchyScopeId: "branch-uuid",
 *   invitedBy: "admin-user-id",
 *   tenantDb: tenantDb,
 * });
 * ```
 */

import { eq, and, lt } from "drizzle-orm";
import { invitations } from "@avantej-core/db/schema/tenant/invitations";
import { members } from "@avantej-core/db/schema/tenant/members";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { user as userTable } from "@avantej-core/db/schema/auth";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { randomBytes } from "crypto";

/**
 * Create a new invitation
 *
 * Generates a secure token and creates an invitation record in the tenant database.
 * The invitation link should be constructed by the caller with organizationId included.
 *
 * @param params - Invitation creation parameters
 * @param params.email - Email address of the invitee
 * @param params.role - Role to assign (admin, trainer, staff, client)
 * @param params.hierarchyScopeId - Hierarchy node ID for access scope
 * @param params.invitedBy - User ID of the person sending the invitation
 * @param params.tenantDb - Tenant database client
 * @returns Created invitation record
 * @throws Error if invitation already exists or validation fails
 */
export async function createInvitation(params: {
	email: string;
	role: string;
	hierarchyScopeId: string;
	invitedBy: string;
	tenantDb: NeonDatabase<typeof tenantSchema>;
}): Promise<typeof invitations.$inferSelect> {
	const { email, role, hierarchyScopeId, invitedBy, tenantDb } = params;

	// Validate email format
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(email)) {
		throw new Error("Invalid email address");
	}

	// Validate role
	const validRoles = ["admin", "trainer", "staff", "client"];
	if (!validRoles.includes(role)) {
		throw new Error(`Invalid role. Must be one of: ${validRoles.join(", ")}`);
	}

	// Check for existing pending invitation
	const existing = await tenantDb.query.invitations.findFirst({
		where: and(
			eq(invitations.email, email.toLowerCase()),
			eq(invitations.status, "pending"),
		),
	});

	if (existing) {
		throw new Error(
			"A pending invitation already exists for this email address",
		);
	}

	// Generate secure token (32 bytes = 64 hex characters)
	const token = randomBytes(32).toString("hex");

	// Set expiration to 7 days from now
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

	// Create invitation
	const [invitation] = await tenantDb
		.insert(invitations)
		.values({
			email: email.toLowerCase(),
			role,
			hierarchyScopeId,
			invitedBy,
			token,
			status: "pending",
			expiresAt,
		})
		.returning();

	if (!invitation) {
		throw new Error("Failed to create invitation");
	}
	return invitation;
}

/**
 * Get invitation by token
 *
 * Retrieves an invitation from the tenant database using its token.
 *
 * @param token - Invitation token
 * @param tenantDb - Tenant database client
 * @returns Invitation record or null if not found
 */
export async function getInvitationByToken(
	token: string,
	tenantDb: NeonDatabase<typeof tenantSchema>,
): Promise<typeof invitations.$inferSelect | null> {
	const invitation = await tenantDb.query.invitations.findFirst({
		where: eq(invitations.token, token),
	});

	return invitation || null;
}

/**
 * Validate invitation
 *
 * Checks if an invitation is valid and can be accepted.
 *
 * @param invitation - Invitation record
 * @returns Object with isValid flag and error message if invalid
 */
export function validateInvitation(
	invitation: typeof invitations.$inferSelect | null,
): {
	isValid: boolean;
	error?: string;
} {
	if (!invitation) {
		return { isValid: false, error: "Invitation not found" };
	}

	if (invitation.status !== "pending") {
		return {
			isValid: false,
			error: `Invitation has already been ${invitation.status}`,
		};
	}

	if (new Date() > invitation.expiresAt) {
		return { isValid: false, error: "Invitation has expired" };
	}

	return { isValid: true };
}

/**
 * List invitations
 *
 * Retrieves invitations from the tenant database with optional filtering.
 *
 * @param params - Query parameters
 * @param params.tenantDb - Tenant database client
 * @param params.status - Filter by status (optional)
 * @param params.email - Filter by email (optional)
 * @param params.invitedBy - Filter by inviter (optional)
 * @returns Array of invitation records
 */
export async function listInvitations(params: {
	tenantDb: NeonDatabase<typeof tenantSchema>;
	status?: string;
	email?: string;
	invitedBy?: string;
}): Promise<Array<typeof invitations.$inferSelect>> {
	const { tenantDb, status, email, invitedBy } = params;

	const conditions = [];

	if (status) {
		conditions.push(eq(invitations.status, status));
	}

	if (email) {
		conditions.push(eq(invitations.email, email.toLowerCase()));
	}

	if (invitedBy) {
		conditions.push(eq(invitations.invitedBy, invitedBy));
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const allInvitations = await tenantDb.query.invitations.findMany({
		where: whereClause,
		orderBy: (invitations, { desc }) => [desc(invitations.createdAt)],
	});

	return allInvitations;
}

/**
 * Revoke invitation
 *
 * Marks an invitation as revoked (changes status to "declined").
 *
 * @param invitationId - Invitation ID
 * @param tenantDb - Tenant database client
 * @returns Updated invitation record
 */
export async function revokeInvitation(
	invitationId: string,
	tenantDb: NeonDatabase<typeof tenantSchema>,
): Promise<typeof invitations.$inferSelect> {
	const [updated] = await tenantDb
		.update(invitations)
		.set({ status: "declined" })
		.where(eq(invitations.id, invitationId))
		.returning();

	if (!updated) {
		throw new Error("Invitation not found");
	}

	return updated;
}

/** Invitation validity window (resend extends expiry by this amount). */
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Minimum gap between successive resends of the same invitation. */
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Error thrown when a resend is attempted within the cooldown window.
 * The handler maps this to a 429-style TOO_MANY_REQUESTS response.
 */
export class InvitationResendCooldownError extends Error {
	readonly retryAfterMs: number;
	constructor(retryAfterMs: number) {
		super(
			"Invitation was resent too recently. Please wait before resending again.",
		);
		this.name = "InvitationResendCooldownError";
		this.retryAfterMs = retryAfterMs;
	}
}

/**
 * Revoke all pending invitations for an email
 *
 * Marks every still-pending invitation matching the given email (in this
 * tenant) as "declined". Used when a member is removed so a stale, still-valid
 * invitation token cannot be used to rejoin the organization.
 *
 * @param email - Invitee email (case-insensitive)
 * @param tenantDb - Tenant database client
 * @returns Number of invitations revoked
 */
export async function revokePendingInvitationsByEmail(
	email: string,
	tenantDb: NeonDatabase<typeof tenantSchema>,
): Promise<number> {
	if (!email) {
		return 0;
	}

	const result = await tenantDb
		.update(invitations)
		.set({ status: "declined" })
		.where(
			and(
				eq(invitations.email, email.toLowerCase()),
				eq(invitations.status, "pending"),
			),
		)
		.returning();

	return result.length;
}

/**
 * Resend invitation
 *
 * Updates expiration date and returns the invitation for resending.
 * Note: The caller should send the email with the updated expiration.
 *
 * Rate limiting: there is no dedicated "last resent" column, but every resend
 * (and the initial create) sets expiresAt = now + 7 days. So the time of the
 * last send can be derived as (expiresAt - 7 days). If that derived send time
 * is within RESEND_COOLDOWN_MS of now, the resend is rejected. This prevents
 * indefinitely extending the expiry by hammering resend.
 *
 * @param invitationId - Invitation ID
 * @param tenantDb - Tenant database client
 * @returns Updated invitation record
 * @throws InvitationResendCooldownError if resent within the cooldown window
 */
export async function resendInvitation(
	invitationId: string,
	tenantDb: NeonDatabase<typeof tenantSchema>,
): Promise<typeof invitations.$inferSelect> {
	const now = Date.now();

	const existing = await tenantDb.query.invitations.findFirst({
		where: eq(invitations.id, invitationId),
	});

	if (!existing) {
		throw new Error("Invitation not found");
	}

	// Derive the time of the last send from the current expiry. Only enforce the
	// cooldown for still-pending invitations (expired ones should be resendable
	// to revive them). The derived last-send is in the future relative to now
	// only when the invitation is still within its TTL.
	if (existing.status === "pending") {
		const lastSentAt = existing.expiresAt.getTime() - INVITATION_TTL_MS;
		const elapsed = now - lastSentAt;
		if (elapsed >= 0 && elapsed < RESEND_COOLDOWN_MS) {
			throw new InvitationResendCooldownError(RESEND_COOLDOWN_MS - elapsed);
		}
	}

	// Extend expiration by 7 days from now
	const newExpiresAt = new Date(now + INVITATION_TTL_MS);

	const [updated] = await tenantDb
		.update(invitations)
		.set({
			expiresAt: newExpiresAt,
			// Reset status to pending if it was expired
			status: "pending",
		})
		.where(eq(invitations.id, invitationId))
		.returning();

	if (!updated) {
		throw new Error("Invitation not found");
	}

	return updated;
}

/**
 * Mark expired invitations
 *
 * Marks invitations that have passed their expiration date as expired.
 * This is typically called by a cron job or scheduled task.
 *
 * @param tenantDb - Tenant database client
 * @returns Number of invitations marked as expired
 */
export async function markExpiredInvitations(
	tenantDb: NeonDatabase<typeof tenantSchema>,
): Promise<number> {
	const now = new Date();

	const result = await tenantDb
		.update(invitations)
		.set({ status: "expired" })
		.where(
			and(eq(invitations.status, "pending"), lt(invitations.expiresAt, now)),
		)
		.returning();

	return result.length;
}

/**
 * Check if an email maps to a soft-deleted customer in this tenant.
 *
 * Pre-flight guard for invitations.create: if the invitee was previously
 * a client member whose customer_profiles row is soft-deleted, returning
 * blocked=true lets the handler throw BAD_REQUEST("ALREADY_DELETED") so
 * the admin is routed to a "Restore customer" flow instead of triggering
 * the broken acceptWithSignup chain (signup would fail because the user
 * already exists in the control-panel database).
 *
 * Logic:
 * 1. Lowercase and look up the email in the control-panel user table.
 *    If no user record exists → genuinely new email → { blocked: false }.
 * 2. Look up a tenant member row where userId=user.id AND role='client'.
 *    If none → { blocked: false }.
 * 3. Look up customer_profiles by userId.
 *    If profile.is_deleted=true → { blocked: true, userId, profileId }.
 *    Otherwise → { blocked: false }.
 *
 * This is a read-only check; it does NOT modify any rows.
 *
 * @param params.tenantDb       - Tenant database client
 * @param params.controlPanelDb - Control-panel database client
 * @param params.email          - Invitee email (case-insensitive)
 */
export async function checkSoftDeletedCustomerBlock(params: {
	tenantDb: NeonDatabase<typeof tenantSchema>;
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	email: string;
}): Promise<
	{ blocked: false } | { blocked: true; userId: string; profileId: string }
> {
	const { tenantDb, controlPanelDb, email } = params;
	const normalizedEmail = email.toLowerCase();

	// Step 1: Does a control-panel user with this email exist?
	const existingUser = await controlPanelDb.query.user.findFirst({
		where: eq(userTable.email, normalizedEmail),
	});

	if (!existingUser) {
		return { blocked: false };
	}

	// Step 2: Does this user have a client member record in this tenant?
	const clientMember = await tenantDb.query.members.findFirst({
		where: and(eq(members.userId, existingUser.id), eq(members.role, "client")),
	});

	if (!clientMember) {
		return { blocked: false };
	}

	// Step 3: Is their customer_profile soft-deleted?
	const profile = await tenantDb.query.customerProfiles.findFirst({
		where: eq(customerProfiles.userId, existingUser.id),
	});

	if (profile && profile.isDeleted) {
		return { blocked: true, userId: existingUser.id, profileId: profile.id };
	}

	return { blocked: false };
}
