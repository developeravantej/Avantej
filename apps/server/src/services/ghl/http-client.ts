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

export async function ghlFetch<T = unknown>(args: GhlFetchArgs): Promise<T> {
	if (process.env.MOCK_GHL === "1" && process.env.NODE_ENV !== "production") {
		return mockGhlResponse(args) as T;
	}

	const {
		method,
		path,
		apiKey,
		body,
		query,
		timeoutMs = DEFAULT_TIMEOUT_MS,
	} = args;

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
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		const timeoutPromise = new Promise<Response>((_, reject) => {
			timeoutId = setTimeout(() => {
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
		if (timeoutId) clearTimeout(timeoutId);
	} catch (error) {
		if (timeoutId) clearTimeout(timeoutId);
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

function mockGhlResponse(args: GhlFetchArgs): unknown {
	const { method, path } = args;

	// GET /locations/:id  → validateGhlApiKey
	if (method === "GET" && /^\/locations\/[^/]+$/.test(path)) {
		const id = path.split("/")[2];
		return { id, name: "Mock Location", companyId: "mock_company" };
	}

	// GET /locations/:id/customFields  → ensureCustomFieldsExist read
	if (method === "GET" && /^\/locations\/[^/]+\/customFields$/.test(path)) {
		return { customFields: [] };
	}

	// POST /locations/:id/customFields  → ensureCustomFieldsExist create
	if (method === "POST" && /^\/locations\/[^/]+\/customFields$/.test(path)) {
		const body = args.body as { name?: string; fieldKey?: string } | undefined;
		const idSeed =
			body?.fieldKey ?? body?.name ?? Math.random().toString(36).slice(2);
		return {
			id: `mock_cf_${idSeed}`,
			name: body?.name,
			fieldKey: body?.fieldKey,
		};
	}

	// POST /contacts/  → syncCustomerToGhl create
	if (method === "POST" && path === "/contacts/") {
		const body = args.body as
			| { locationId?: string; email?: string }
			| undefined;
		return {
			id: `mock_contact_${Math.random().toString(36).slice(2, 10)}`,
			locationId: body?.locationId ?? "mock_location",
			email: body?.email,
		};
	}

	// PUT /contacts/:id  → syncCustomerToGhl update
	if (method === "PUT" && /^\/contacts\/[^/]+$/.test(path)) {
		const id = path.split("/")[2];
		const body = args.body as
			| { locationId?: string; email?: string }
			| undefined;
		return { id, locationId: body?.locationId, email: body?.email };
	}

	// DELETE /contacts/:id  → syncCustomerToGhl delete
	if (method === "DELETE" && /^\/contacts\/[^/]+$/.test(path)) {
		return undefined;
	}

	// POST /users/  → syncStaffToGhl create
	if (method === "POST" && path === "/users/") {
		const body = args.body as
			| { email?: string; firstName?: string; lastName?: string }
			| undefined;
		return {
			id: `mock_user_${Math.random().toString(36).slice(2, 10)}`,
			email: body?.email,
			firstName: body?.firstName,
			lastName: body?.lastName,
		};
	}

	// PUT /users/:id  → syncStaffToGhl update
	if (method === "PUT" && /^\/users\/[^/]+$/.test(path)) {
		const id = path.split("/")[2];
		return { id };
	}

	// DELETE /users/:id  → syncStaffToGhl delete
	if (method === "DELETE" && /^\/users\/[^/]+$/.test(path)) {
		return undefined;
	}

	throw new Error(`MOCK_GHL: unhandled path ${method} ${path}`);
}
