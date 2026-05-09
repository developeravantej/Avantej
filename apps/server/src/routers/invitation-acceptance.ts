/**
 * Pure helper for invitations.acceptWithSignup boundary checks.
 *
 * Kept separate from the procedure so it's unit-testable without spinning up
 * Better-Auth, member service, or GHL sync.
 */

export type AcceptanceValidationError =
	| "invalid-token"
	| "email-mismatch"
	| "expired"
	| "already-accepted"
	| "declined";

export type AcceptanceValidationResult =
	| { ok: true }
	| { ok: false; error: AcceptanceValidationError };

interface InvitationLite {
	email: string;
	status: string;
	expiresAt: Date;
}

/**
 * Validates that a pending invitation can be accepted by the user signing up
 * with `signupEmail`. Pure function — no DB / no auth side effects.
 */
export function validateAcceptanceInput(
	invitation: InvitationLite | null,
	signupEmail: string,
): AcceptanceValidationResult {
	if (!invitation) return { ok: false, error: "invalid-token" };
	if (invitation.status === "accepted") return { ok: false, error: "already-accepted" };
	if (invitation.status === "declined") return { ok: false, error: "declined" };
	if (invitation.expiresAt.getTime() < Date.now()) return { ok: false, error: "expired" };
	if (invitation.email.toLowerCase() !== signupEmail.toLowerCase()) {
		return { ok: false, error: "email-mismatch" };
	}
	return { ok: true };
}
