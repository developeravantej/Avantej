/**
 * Better-Auth API Types
 *
 * Type definitions for Better-Auth API responses used in server-side code.
 * These types are inferred from Better-Auth's API structure and provide
 * type safety when calling Better-Auth methods server-side.
 *
 * Note: Better-Auth client library has its own types for client-side usage.
 * These types are specifically for server-side API calls.
 */

/**
 * Better-Auth User type
 * Matches Better-Auth's User type from their API.
 *
 * Optional/nullable fields are configured via `additionalFields` with
 * `required: false` in `apps/server/src/lib/better-auth.ts`. At runtime
 * Better-Auth returns these as `string | null | undefined`.
 */
export interface BetterAuthUser {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string | null | undefined;
	createdAt: Date;
	updatedAt: Date;
	// additionalFields (all `required: false`, hence nullable)
	firstName: string | null | undefined;
	lastName: string | null | undefined;
	phone?: string | null | undefined;
	idPassportNo?: string | null | undefined;
	addressType?: string | null | undefined;
	streetAddress?: string | null | undefined;
	city?: string | null | undefined;
	state?: string | null | undefined;
	country?: string | null | undefined;
	postalCode?: string | null | undefined;
	dateOfBirth?: string | null | undefined;
	emergencyContactName?: string | null | undefined;
	emergencyContactRelationship?: string | null | undefined;
	emergencyContactPhone?: string | null | undefined;
	// admin plugin fields
	banned?: boolean | null | undefined;
	role?: string | null | undefined;
	banReason?: string | null | undefined;
	banExpires?: Date | null | undefined;
}

/**
 * Better-Auth Session type
 * Matches Better-Auth's Session type from their API
 */
export interface BetterAuthSession {
	id: string;
	token: string;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
	ipAddress?: string | null | undefined;
	userAgent?: string | null | undefined;
	userId: string;
	activeOrganizationId?: string | null | undefined;
	impersonatedBy?: string | null | undefined;
}

/**
 * Response from Better-Auth signUpEmail API
 */
export interface BetterAuthSignUpResponse {
	user: BetterAuthUser;
	/**
	 * Session may not be present if email verification is required
	 */
	session?: BetterAuthSession;
}

/**
 * Response from Better-Auth signInEmail API
 */
export interface BetterAuthSignInResponse {
	user: BetterAuthUser;
	session: BetterAuthSession;
}

/**
 * Response from Better-Auth signOut API
 */
export interface BetterAuthSignOutResponse {
	message?: string;
}

/**
 * Response from Better-Auth sendVerificationEmail API
 */
export interface BetterAuthSendVerificationEmailResponse {
	message?: string;
}

/**
 * Response from Better-Auth verifyEmail API
 */
export interface BetterAuthVerifyEmailResponse {
	user: BetterAuthUser;
	message?: string;
}

/**
 * Response from Better-Auth sendForgotPasswordEmail API
 */
export interface BetterAuthSendForgotPasswordEmailResponse {
	message?: string;
}

/**
 * Response from Better-Auth resetPassword API
 */
export interface BetterAuthResetPasswordResponse {
	message?: string;
}

/**
 * Response from Better-Auth getSession API
 */
export interface BetterAuthGetSessionResponse {
	user: BetterAuthUser | null;
	session: BetterAuthSession | null;
}

/**
 * Better-Auth API Error type
 */
export interface BetterAuthApiError {
	message: string;
	status?: number;
	statusText?: string;
}

/**
 * Better-Auth API Result type (can be success or error)
 */
export type BetterAuthApiResult<T> = T | BetterAuthApiError;

/**
 * Type guard to check if result is an error
 */
export function isBetterAuthError<T>(
	result: BetterAuthApiResult<T>,
): result is BetterAuthApiError {
	return (
		result !== null &&
		typeof result === "object" &&
		"message" in result &&
		!("user" in result) &&
		!("session" in result)
	);
}

/**
 * Type guard to check if sign up response is valid
 */
export function isBetterAuthSignUpResponse(
	result: unknown,
): result is BetterAuthSignUpResponse {
	return (
		result !== null &&
		typeof result === "object" &&
		"user" in result &&
		typeof (result as any).user === "object" &&
		"id" in (result as any).user
	);
}

/**
 * Type guard to check if sign in response is valid
 */
export function isBetterAuthSignInResponse(
	result: unknown,
): result is BetterAuthSignInResponse {
	return (
		result !== null &&
		typeof result === "object" &&
		"user" in result &&
		"session" in result &&
		typeof (result as any).user === "object" &&
		typeof (result as any).session === "object" &&
		"id" in (result as any).user &&
		"token" in (result as any).session
	);
}
