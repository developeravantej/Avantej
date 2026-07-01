/**
 * Cloudflare Email Sending provider (alternative to Resend).
 *
 * Sends transactional email via the Workers `send_email` binding. Selected by
 * `EMAIL_PROVIDER=cloudflare` — the default provider stays Resend, so this is a
 * zero-risk, flag-gated addition (see `sendEmail` in ./email.ts).
 *
 * Binding access: the `send_email` binding is only exposed on the per-request
 * `env` (Hono `c.env`), NOT on the module-global `cloudflare:workers` env that
 * `getEnvVar` reads. `sendEmail()` is called deep inside Better-Auth / services
 * without request context, so a middleware stashes the binding via
 * `rememberEmailBinding(c.env.EMAIL)` on each request. The binding object is the
 * same across requests, so caching it module-side is safe.
 *
 * The `from` domain must be onboarded for Email Sending on the Cloudflare
 * account (e.g. `send.avantej.com`). Set `CLOUDFLARE_EMAIL_FROM` to the default
 * sender (e.g. `noreply@send.avantej.com`).
 *
 * Why Cloudflare Email: no per-domain fee (unlimited sending domains, billed by
 * volume only). See docs/EMAIL_ARCHITECTURE_DECISION.md.
 */

/** The `send_email` binding shape (new Cloudflare Email Service — JSON API). */
interface CloudflareEmailBinding {
	send(message: {
		to: string | string[];
		from: { email: string; name?: string };
		subject: string;
		html?: string;
		text?: string;
		replyTo?: string;
	}): Promise<{ messageId?: string }>;
}

let cachedBinding: CloudflareEmailBinding | undefined;

/**
 * Stash the per-request `send_email` binding so provider code (which runs
 * without request context) can use it. Called by a Hono middleware with
 * `c.env.EMAIL`. Safe to overwrite — the binding object is identical across
 * requests.
 */
export function rememberEmailBinding(binding: unknown): void {
	if (
		binding &&
		typeof (binding as CloudflareEmailBinding).send === "function"
	) {
		cachedBinding = binding as CloudflareEmailBinding;
	}
}

export interface CloudflareSendOptions {
	to: string | string[];
	subject: string;
	html: string;
	text?: string;
	fromEmail: string;
	fromName: string;
}

export async function sendViaCloudflareEmail(
	opts: CloudflareSendOptions,
): Promise<{ messageId?: string }> {
	if (!cachedBinding) {
		throw new Error(
			"Cloudflare Email binding (EMAIL) unavailable — ensure the send_email binding is in wrangler.jsonc and rememberEmailBinding() runs in middleware",
		);
	}
	const result = await cachedBinding.send({
		to: Array.isArray(opts.to) ? opts.to : [opts.to],
		from: { email: opts.fromEmail, name: opts.fromName },
		subject: opts.subject,
		html: opts.html,
		text: opts.text || opts.html.replace(/<[^>]*>/g, ""),
	});
	console.log(
		`Email sent via Cloudflare (messageId=${result?.messageId ?? "n/a"}) to ${
			Array.isArray(opts.to) ? opts.to.join(", ") : opts.to
		}`,
	);
	return { messageId: result?.messageId };
}
