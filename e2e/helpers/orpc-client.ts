/**
 * Lightweight oRPC client for Playwright tests.
 *
 * Uses the browser page's session cookie (already loaded via storageState) to
 * authenticate requests.  Calls are made with `page.request.post()` so the
 * session cookie header is injected automatically by Playwright's context.
 *
 * Usage:
 *   const client = makeOrpcClient(page, orgId);
 *   const members = await client<MembersListInput, MembersListOutput>(
 *     "members", "list", { organizationId: orgId }
 *   );
 */

import type { Page } from "@playwright/test";

export interface OrpcError {
	code: string;
	message: string;
	status?: number;
}

export class OrpcClientError extends Error {
	readonly code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
		this.name = "OrpcClientError";
	}
}

/**
 * Raw oRPC call over HTTP.
 *
 * Uses page.evaluate() so the fetch runs inside Chrome's network context —
 * Chrome resolves *.localhost domains correctly whereas Node.js (undici) does not.
 * The relative URL /rpc/{router}/{procedure} means the browser sends the
 * session cookie automatically (same origin).
 *
 * @param page       - Playwright Page (provides session cookie)
 * @param router     - Router name as registered in baseRouter (e.g. "members")
 * @param procedure  - Procedure name (e.g. "list")
 * @param input      - Input object passed as JSON body
 * @returns Parsed response data
 */
export async function orpcCall<TInput, TOutput>(
	page: Page,
	router: string,
	procedure: string,
	input: TInput,
): Promise<TOutput> {
	// The fetch below uses a RELATIVE URL (/rpc/...) evaluated in the page context.
	// On a fresh test the page sits at about:blank, where a relative fetch has no
	// origin and throws — which callers (pickFirst*, seed helpers) catch and turn
	// into a null/skip, silently disabling whole specs. Guard once here: if we're
	// not yet on an http(s) origin, navigate to the dashboard first. Once the page
	// is on a real URL this never fires again, so it won't disturb mid-flow calls.
	if (!page.url().startsWith("http")) {
		await page.goto("/dashboard");
		await page.waitForLoadState("domcontentloaded");
	}

	const result = await page.evaluate<
		{ ok: boolean; status: number; body: unknown },
		{ r: string; p: string; i: unknown }
	>(
		async ({ r, p, i }) => {
			const resp = await fetch(`/rpc/${r}/${p}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ json: i }),
			});
			return { ok: resp.ok, status: resp.status, body: await resp.json() };
		},
		{ r: router, p: procedure, i: input as unknown },
	);

	// oRPC error envelope shape: { json: { defined: false, code, status, message, data? } }
	// — comes back as HTTP 200, NOT 4xx. We must inspect body.json.code/defined to detect.
	type OrpcErrorEnvelope = {
		defined: false;
		code: string;
		message: string;
		status?: number;
		data?: unknown;
	};
	const body = result.body as {
		json?: TOutput | OrpcErrorEnvelope;
		error?: OrpcError;
	};

	// Hard HTTP error or top-level error key
	if (!result.ok || body.error) {
		const err = body.error;
		const bodyText = JSON.stringify(body).slice(0, 500);
		throw new OrpcClientError(
			err?.code ?? String(result.status),
			err?.message ??
				`oRPC ${router}.${procedure} failed with HTTP ${result.status} — body: ${bodyText}`,
		);
	}

	// oRPC-level error encoded inside body.json
	if (
		body.json &&
		typeof body.json === "object" &&
		"defined" in body.json &&
		(body.json as OrpcErrorEnvelope).defined === false &&
		"code" in body.json
	) {
		const e = body.json as OrpcErrorEnvelope;
		throw new OrpcClientError(
			e.code,
			`oRPC ${router}.${procedure} → ${e.code}: ${e.message}`,
		);
	}

	return body.json as TOutput;
}

/**
 * Curried factory — pass the page once, get a shorter call site.
 *
 * const c = makeOrpcClient(page);
 * await c("members", "list", { organizationId });
 */
export function makeOrpcClient(page: Page) {
	return <TInput, TOutput>(
		router: string,
		procedure: string,
		input: TInput,
	): Promise<TOutput> =>
		orpcCall<TInput, TOutput>(page, router, procedure, input);
}
