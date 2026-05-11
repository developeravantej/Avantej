/**
 * GoHighLevel API request/response types.
 * Scoped to the surface we sync (Contacts, Users, Locations, Custom Fields).
 */

export interface GhlContactPayload {
	locationId: string;
	firstName?: string;
	lastName?: string;
	name?: string;
	email?: string;
	phone?: string;
	dateOfBirth?: string; // YYYY-MM-DD
	address1?: string;
	source?: string;
	tags?: string[];
	customFields?: Array<{ id: string; value: string | number }>;
}

export interface GhlContact {
	id: string;
	locationId: string;
	firstName?: string;
	lastName?: string;
	email?: string;
	phone?: string;
	tags?: string[];
}

export interface GhlUserPayload {
	companyId: string;
	firstName: string;
	lastName: string;
	email: string;
	phone?: string;
	type: "account" | "agency";
	role: "admin" | "user";
	locationIds: string[];
	permissions?: Record<string, boolean>;
	scopes?: string[];
	scopesAssignedToOnly?: string[];
	platformLanguage?: string;
}

export interface GhlUser {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	phone?: string;
	roles?: { type: string; role: string; locationIds: string[] };
}

export interface GhlLocation {
	id: string;
	name: string;
	companyId: string;
}

export interface GhlCustomField {
	id: string;
	name: string;
	fieldKey: string;
	dataType:
		| "TEXT"
		| "LARGE_TEXT"
		| "NUMERICAL"
		| "DATE"
		| "PHONE"
		| "EMAIL"
		| "SINGLE_OPTIONS"
		| "MULTIPLE_OPTIONS";
	locationId: string;
	// SINGLE_OPTIONS / MULTIPLE_OPTIONS only. GHL returns either string[] or
	// { label, value }[] depending on field version; treat as string[] of labels.
	options?: string[];
}

export type GhlApiErrorCode =
	| "unauthorized"
	| "not_found"
	| "rate_limited"
	| "validation"
	| "timeout"
	| "network"
	| "unknown";

export class GhlApiError extends Error {
	constructor(
		public code: GhlApiErrorCode,
		public httpStatus: number | undefined,
		message: string,
		public responseBody?: unknown,
	) {
		super(message);
		this.name = "GhlApiError";
	}
}
