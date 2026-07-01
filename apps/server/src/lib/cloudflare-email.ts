/**
 * Cloudflare Email Sending provider (alternative to Resend).
 *
 * Sends transactional email via the Workers `send_email` binding (`env.EMAIL`).
 * Selected by `EMAIL_PROVIDER=cloudflare` — the default provider stays Resend,
 * so this is a zero-risk, flag-gated addition (see `sendEmail` in ./email.ts).
 *
 * The `from` domain must be onboarded for Email Sending on the Cloudflare
 * account (e.g. `send.avantej.com`). Set `CLOUDFLARE_EMAIL_FROM` to the default
 * sender (e.g. `noreply@send.avantej.com`).
 *
 * Why Cloudflare Email: no per-domain fee (unlimited sending domains; billed by
 * volume only), native to Workers, and it removes the Resend per-domain cost
 * ceiling for multi-tenant white-label. See docs/EMAIL_ARCHITECTURE_DECISION.md.
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

function getEmailBinding(): CloudflareEmailBinding | undefined {
	try {
		const { env } = require("cloudflare:workers") as {
			env: Record<string, unknown>;
		};
		const binding = env.EMAIL as CloudflareEmailBinding | undefined;
		return binding && typeof binding.send === "function" ? binding : undefined;
	} catch {
		return undefined;
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
): Promise<void> {
	const binding = getEmailBinding();
	if (!binding) {
		throw new Error(
			"Cloudflare Email binding (EMAIL) is not configured on this Worker — add `send_email` to wrangler.jsonc",
		);
	}
	const result = await binding.send({
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
}
