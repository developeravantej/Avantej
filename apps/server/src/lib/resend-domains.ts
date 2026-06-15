/**
 * Resend Domains API wrapper
 *
 * Thin wrapper around the Resend SDK's domains endpoints — keeps the SDK
 * surface area in one place and reuses the lazy singleton from ./email.ts
 * so the `__resetResendClient` test hook still drains all state.
 *
 * Why a wrapper: every callsite (oRPC router, webhook handler, background
 * verifier) needs the same retry/error shape. Resend's SDK throws on network
 * errors but returns `{ data, error }` on API errors — we normalize to throw.
 */

import { getResendClient } from "./email";

export interface ResendDnsRecord {
	record: string;
	name: string;
	type: string;
	ttl?: string;
	status?: string;
	value: string;
	priority?: number;
}

export interface CreateResendDomainResult {
	id: string;
	name: string;
	status: string;
	records: ResendDnsRecord[];
}

export interface GetResendDomainResult {
	id: string;
	name: string;
	status: string;
	records?: ResendDnsRecord[];
}

function throwOnResendError(label: string, error: unknown): never {
	if (error && typeof error === "object" && "message" in error) {
		throw new Error(`Resend ${label} failed: ${(error as { message: string }).message}`);
	}
	throw new Error(`Resend ${label} failed: unknown error`);
}

/**
 * Register a new sending domain. The returned `records` payload should be
 * persisted verbatim — that's what the tenant adds to their DNS.
 */
export async function createResendDomain(params: {
	name: string;
	region?: "us-east-1" | "eu-west-1" | "sa-east-1" | "ap-northeast-1";
}): Promise<CreateResendDomainResult> {
	const resend = getResendClient();
	const result = await resend.domains.create({
		name: params.name,
		region: params.region,
	});
	if (result.error || !result.data) {
		return throwOnResendError("domains.create", result.error);
	}
	return result.data as unknown as CreateResendDomainResult;
}

/**
 * Fetch live domain status from Resend. Used to refresh DB rows after the
 * tenant publishes DNS records.
 */
export async function getResendDomain(resendDomainId: string): Promise<GetResendDomainResult> {
	const resend = getResendClient();
	const result = await resend.domains.get(resendDomainId);
	if (result.error || !result.data) {
		return throwOnResendError("domains.get", result.error);
	}
	return result.data as unknown as GetResendDomainResult;
}

/**
 * Ask Resend to re-check DNS. Idempotent — safe to call repeatedly.
 */
export async function verifyResendDomain(resendDomainId: string): Promise<void> {
	const resend = getResendClient();
	const result = await resend.domains.verify(resendDomainId);
	if (result.error) {
		return throwOnResendError("domains.verify", result.error);
	}
}

/**
 * Delete the domain at Resend (used when an org un-registers a sending domain).
 */
export async function deleteResendDomain(resendDomainId: string): Promise<void> {
	const resend = getResendClient();
	const result = await resend.domains.remove(resendDomainId);
	if (result.error) {
		return throwOnResendError("domains.remove", result.error);
	}
}
