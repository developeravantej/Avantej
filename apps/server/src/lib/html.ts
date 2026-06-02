/**
 * Canonical HTML escaping for values interpolated into email / HTML bodies.
 *
 * Single source of truth. This was hand-copied into comms, onboarding-alerts,
 * and payment-side-effects (and a 4th clone in a test), and had already drifted
 * on the apostrophe entity (`&#039;` vs `&#39;`). Both render identically, but a
 * single definition removes the drift and lets the XSS-escaping behavior be
 * tested once against the function that actually ships.
 *
 * Order matters: `&` MUST be escaped first so subsequent entities are not
 * double-escaped.
 */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
