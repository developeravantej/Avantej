/**
 * Onboarding Service
 *
 * Handles the branch self-signup (QR-code) onboarding flow.
 * Called from the public onboarding router; creates a Better-Auth user +
 * a tenant members row in a single coordinated operation.
 *
 * Idempotency guarantee:
 * If the same email re-submits the same token (network retry, browser back),
 * we detect the existing member row and return a sign-in session instead of
 * erroring or creating duplicate records.
 *
 * Transactional note (Cloudflare Workers + Neon):
 * Better-Auth user creation is a call to the auth HTTP handler (writes to the
 * control-panel DB). It cannot be wrapped in the tenant-DB transaction.
 * If the member insert fails after auth user creation, an orphan auth user
 * may exist — this is acceptable and handled by Better-Auth's own de-dup on
 * subsequent sign-in attempts.
 */

import { eq, sql } from "drizzle-orm";
import { members } from "@avantej-core/db/schema/tenant/members";
import { roles } from "@avantej-core/db/schema/tenant/roles";
import { invitations } from "@avantej-core/db/schema/tenant/invitations";
import { user } from "@avantej-core/db/schema/auth";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { validateBranchInvite } from "./branch-invite.service";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

// ---------------------------------------------------------------------------
// getInviteContext
// ---------------------------------------------------------------------------

export interface GetInviteContextParams {
	token: string;
	tenantDb: TenantDb;
	controlPanelDb: ControlPanelDb;
	organizationId: string;
}

export interface InviteContextResult {
	orgName: string;
	branchName: string;
	branchAddress?: string | null;
	brandLogoUrl?: string | null;
}

/**
 * Look up the invite and return branded context for the onboarding landing page.
 * Validates: invite exists, isActive, kind='branch_self_signup', not expired, uses not exhausted.
 */
export async function getInviteContext(
	params: GetInviteContextParams,
): Promise<InviteContextResult> {
	const { token, tenantDb, controlPanelDb, organizationId } = params;

	const { isValid, invite, error } = await validateBranchInvite(
		tenantDb,
		token,
	);

	if (!isValid || !invite) {
		const httpCode = error === "NOT_FOUND" ? "NOT_FOUND" : "GONE";
		throw Object.assign(new Error(errorMessage(error ?? "NOT_FOUND")), {
			code: httpCode,
		});
	}

	const [branchNode, org] = await Promise.all([
		tenantDb.query.hierarchyNodes.findFirst({
			where: eq(hierarchyNodes.id, invite.hierarchyScopeId),
		}),
		controlPanelDb.query.organizations.findFirst({
			where: eq(organizations.id, organizationId),
		}),
	]);

	return {
		orgName: org?.name ?? "the organization",
		branchName: branchNode?.name ?? "our branch",
		branchAddress: null,
		brandLogoUrl: null, // org logo URL not yet stored in schema
	};
}

// ---------------------------------------------------------------------------
// redeemBranchInvite
// ---------------------------------------------------------------------------

export interface RedeemInviteParams {
	token: string;
	organizationId: string;
	email: string;
	password: string;
	fullName: string;
	phone?: string | null;
	tenantDb: TenantDb;
	controlPanelDb: ControlPanelDb;
	/** Base URL of the Better-Auth server (e.g. http://localhost:3000) */
	betterAuthBaseUrl: string;
	/** Original request — headers forwarded to Better-Auth for cookie handling */
	rawRequest: Request;
}

export interface RedeemInviteResult {
	userId: string;
	memberId: string;
	/** Session token from Better-Auth — front-end sets this as bearer or cookie */
	sessionToken: string;
	/** Whether this was an idempotent re-login (true) or a new registration (false) */
	isExistingUser: boolean;
}

/**
 * Redeem a branch self-signup invite:
 * 1. Validate invite.
 * 2. Idempotency: if user already exists AND has a member row → sign in, return session.
 * 3. Create Better-Auth user (sign-up) OR sign in existing-but-unmembered user.
 * 4. In a tenant-DB transaction: insert member row + increment invite usesCount.
 * 5. Sync org membership to control panel (non-fatal on failure).
 */
export async function redeemBranchInvite(
	params: RedeemInviteParams,
): Promise<RedeemInviteResult> {
	// phone is accepted in the input type for forward-compat but the members table
	// has no phone column yet; callers can store it via member_profiles.
	const {
		token,
		organizationId,
		email,
		password,
		fullName,
		tenantDb,
		controlPanelDb,
		betterAuthBaseUrl,
		rawRequest,
	} = params;

	// 1. Validate invite
	const { isValid, invite, error } = await validateBranchInvite(
		tenantDb,
		token,
	);

	if (!isValid || !invite) {
		const httpCode = error === "NOT_FOUND" ? "NOT_FOUND" : "GONE";
		throw Object.assign(new Error(errorMessage(error ?? "NOT_FOUND")), {
			code: httpCode,
		});
	}

	const normalizedEmail = email.toLowerCase().trim();

	// 2. Check if user already exists in control panel
	const existingAuthUser = await controlPanelDb.query.user.findFirst({
		where: eq(user.email, normalizedEmail),
	});

	if (existingAuthUser) {
		// Check if member row already exists (full idempotency path)
		const existingMember = await tenantDb.query.members.findFirst({
			where: eq(members.userId, existingAuthUser.id),
		});

		if (existingMember) {
			// Fully idempotent: just sign them in, do NOT increment usesCount
			const sessionToken = await signInViaBetterAuth(
				betterAuthBaseUrl,
				rawRequest,
				normalizedEmail,
				password,
			);

			return {
				userId: existingAuthUser.id,
				memberId: existingMember.id,
				sessionToken,
				isExistingUser: true,
			};
		}
	}

	// 3. Create or sign in via Better-Auth
	let userId: string;
	let sessionToken: string;

	if (existingAuthUser) {
		// Auth user exists but has no member row in this tenant
		userId = existingAuthUser.id;
		sessionToken = await signInViaBetterAuth(
			betterAuthBaseUrl,
			rawRequest,
			normalizedEmail,
			password,
		);
	} else {
		// Fully new user — create via Better-Auth sign-up
		const result = await signUpViaBetterAuth(
			betterAuthBaseUrl,
			rawRequest,
			normalizedEmail,
			password,
			fullName,
		);
		userId = result.userId;
		sessionToken = result.sessionToken;
	}

	// 4. Insert member row + increment invite usesCount in one tenant-DB tx
	let memberId!: string;

	await tenantDb.transaction(async (tx) => {
		// Resolve roleId FK from roles table (matches MembershipService pattern)
		const [roleRow] = await tx
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.name, "client"))
			.limit(1);

		const insertedRows = await tx
			.insert(members)
			.values({
				userId,
				role: "client",
				roleId: roleRow?.id ?? null,
				hierarchyScopeId: invite.hierarchyScopeId,
				status: "active",
				invitationId: invite.id,
			})
			.returning();

		const newMember = insertedRows[0];
		if (!newMember) {
			throw new Error("Failed to insert member row");
		}
		memberId = newMember.id;

		// Increment invite uses atomically in the same tx
		await tx
			.update(invitations)
			.set({ usesCount: sql`uses_count + 1` })
			.where(eq(invitations.id, invite.id));
	});

	// 5. Sync to control panel org_members (non-fatal — member row already created above)
	try {
		const { MembershipService } = await import(
			"@avantej-core/db/services/membership.service"
		);
		const svc = new MembershipService(controlPanelDb);
		// createMember does a dual-write, but member is already in tenant DB.
		// We call it only for the org_members control-panel insert.
		// Guard against duplicate insert: createMember will throw on unique violation,
		// which we catch here.
		await svc.createMember({
			userId,
			organizationId,
			role: "client",
			hierarchyScopeId: invite.hierarchyScopeId,
			invitationId: invite.id,
			tenantDb,
		});
	} catch (syncErr) {
		// Non-fatal: tenant member row is committed. Org_members sync can be backfilled.
		console.error("[onboarding] org_members sync failed (non-fatal):", syncErr);
	}

	return {
		userId,
		memberId,
		sessionToken,
		isExistingUser: false,
	};
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function errorMessage(code: string): string {
	switch (code) {
		case "NOT_FOUND":
			return "Invite link not found. Ask reception for a new code.";
		case "REVOKED":
			return "This invite link has been revoked. Ask reception for a new code.";
		case "EXPIRED":
			return "This invite link has expired. Ask reception for a new code.";
		case "MAX_USES_REACHED":
			return "This invite link has reached its maximum uses. Ask reception for a new code.";
		default:
			return "Invalid invite link.";
	}
}

interface BetterAuthSignUpResult {
	userId: string;
	sessionToken: string;
}

async function signUpViaBetterAuth(
	baseUrl: string,
	rawRequest: Request,
	email: string,
	password: string,
	name: string,
): Promise<BetterAuthSignUpResult> {
	const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...forwardableHeaders(rawRequest),
		},
		body: JSON.stringify({ email, password, name }),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Better-Auth sign-up failed (${response.status}): ${body}`);
	}

	const data = (await response.json()) as {
		user?: { id?: string };
		session?: { token?: string };
		token?: string;
	};

	const userId = data.user?.id;
	const sessionToken = data.session?.token ?? data.token;

	if (!userId || !sessionToken) {
		throw new Error(
			"Better-Auth sign-up returned incomplete user/session data",
		);
	}

	return { userId, sessionToken };
}

async function signInViaBetterAuth(
	baseUrl: string,
	rawRequest: Request,
	email: string,
	password: string,
): Promise<string> {
	const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...forwardableHeaders(rawRequest),
		},
		body: JSON.stringify({ email, password }),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Better-Auth sign-in failed (${response.status}): ${body}`);
	}

	const data = (await response.json()) as {
		session?: { token?: string };
		token?: string;
	};

	const sessionToken = data.session?.token ?? data.token;

	if (!sessionToken) {
		throw new Error("Better-Auth sign-in returned no session token");
	}

	return sessionToken;
}

/** Extract a safe subset of request headers to forward to Better-Auth */
function forwardableHeaders(req: Request): Record<string, string> {
	const safe: Record<string, string> = {};
	for (const key of ["origin", "user-agent", "x-forwarded-for"]) {
		const val = req.headers.get(key);
		if (val) safe[key] = val;
	}
	return safe;
}
