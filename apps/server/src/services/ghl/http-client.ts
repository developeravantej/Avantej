// apps/server/src/services/ghl/http-client.ts
/**
 * GoHighLevel HTTP client.
 *
 * Wraps fetch with:
 *  - GHL base URL (https://services.leadconnectorhq.com)
 *  - Auth header (Bearer + Version 2021-07-28)
 *  - Timeout (default 5s)
 *  - Error normalization to GhlApiError
 *  - Optional query params for GET
 */

import { GhlApiError, type GhlApiErrorCode } from "./types";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
const DEFAULT_TIMEOUT_MS = 5000;

export interface GhlFetchArgs {
	method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	path: string;
	apiKey: string;
	body?: unknown;
	query?: Record<string, string | number | undefined>;
	timeoutMs?: number;
}

export async function ghlFetch<T = unknown>(
	args: GhlFetchArgs,
): Promise<T> {
	const { method, path, apiKey, body, query, timeoutMs = DEFAULT_TIMEOUT_MS } =
		args;

	let url = `${GHL_BASE_URL}${path}`;
	if (query) {
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(query)) {
			if (v !== undefined && v !== null) {
				params.append(k, String(v));
			}
		}
		const qs = params.toString();
		if (qs) url += `?${qs}`;
	}

	const controller = new AbortController();

	let response: Response;
	try {
		const timeoutPromise = new Promise<Response>((_, reject) => {
			setTimeout(() => {
				controller.abort();
				const err = new Error(`Timed out after ${timeoutMs}ms`);
				err.name = "AbortError";
				reject(err);
			}, timeoutMs);
		});
		response = await Promise.race([
			fetch(url, {
				method,
				headers: {
					Authorization: `Bearer ${apiKey}`,
					Version: GHL_API_VERSION,
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: body ? JSON.stringify(body) : undefined,
				signal: controller.signal,
			}),
			timeoutPromise,
		]);
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw new GhlApiError(
				"timeout",
				undefined,
				`Request to ${path} timed out after ${timeoutMs}ms`,
			);
		}
		throw new GhlApiError(
			"network",
			undefined,
			`Network error calling ${path}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	if (response.ok) {
		const text = await response.text();
		if (!text) return undefined as T;
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new GhlApiError(
				"unknown",
				response.status,
				`Failed to parse JSON response from ${path}`,
			);
		}
	}

	const code: GhlApiErrorCode =
		response.status === 401
			? "unauthorized"
			: response.status === 404
				? "not_found"
				: response.status === 429
					? "rate_limited"
					: response.status >= 400 && response.status < 500
						? "validation"
						: "unknown";

	let bodyText: unknown = undefined;
	try {
		bodyText = await response.json();
	} catch {
		bodyText = await response.text().catch(() => "");
	}

	throw new GhlApiError(
		code,
		response.status,
		`GHL API ${response.status} on ${path}`,
		bodyText,
	);
}
