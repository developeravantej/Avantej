/**
 * Pure notification-routing helpers — no DB, no env, no IO. Safe to import in
 * any context (Workers send layer, oRPC router write-time validation, tests).
 */

export const NOTIFICATION_TYPES = [
	"member_invitation",
	"payment_receipt",
	"auth_verification",
	"auth_password_reset",
	"auth_magic_link",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Tokens a tenant may use in a per-type subject override. Callers pass the
 * matching values via `subjectVars`. Documented in the UI under the input.
 */
export const SUBJECT_TOKENS: Record<NotificationType, string[]> = {
	member_invitation: ["organizationName", "role", "inviterName"],
	payment_receipt: ["amount", "appointmentId"],
	auth_verification: ["appName"],
	auth_password_reset: ["appName"],
	auth_magic_link: ["appName"],
};

/**
 * Replace each `{token}` with its value from `vars`. Unknown / missing tokens
 * render to "" so a live subject never contains a literal "{amount}".
 */
export function renderSubjectTemplate(
	template: string,
	vars: Record<string, string>,
): string {
	return template.replace(/\{(\w+)\}/g, (_match, key: string) => vars[key] ?? "");
}

/**
 * Header-injection guard + tidy. Strip all control chars (incl. CR/LF/tab),
 * collapse runs of whitespace, trim, cap at 255. Apply to the FINAL subject
 * (after token interpolation) so malicious token values can't inject headers.
 */
export function sanitizeSubject(subject: string): string {
	return subject
		// eslint-disable-next-line no-control-regex
		.replace(/[\x00-\x1F\x7F]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 255);
}
