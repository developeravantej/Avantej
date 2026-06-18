import type { APIRequestContext } from "@playwright/test";
import { rpc } from "./_safe-mutation";

// Shared fixture discovery for package-instance specs. Not a *.spec.ts, so the
// Playwright runner ignores it. Everything is read-only discovery against the
// live tenant — picks pre-existing rows rather than creating new dependencies.

export type PkgFixtures = {
	serviceId: string; // an active service (branchId null preferred — no branch gate)
	clientId: string; // a `client` member's userId (package owner)
	trainerMemberId: string | null; // an active trainer member id, or null
};

let cached: PkgFixtures | null = null;

export async function getPkgFixtures(
	request: APIRequestContext,
	organizationId: string,
): Promise<PkgFixtures> {
	if (cached) return cached;

	const svcRes = await rpc(request, "services/list", { organizationId });
	const services = Array.isArray(svcRes)
		? svcRes
		: (svcRes?.items ?? svcRes?.services ?? []);
	const service =
		services.find((s: any) => s.isActive && s.branchId == null) ??
		services.find((s: any) => s.isActive) ??
		services[0];

	const memRes = await rpc(request, "members/list", { organizationId });
	const members = Array.isArray(memRes)
		? memRes
		: (memRes?.items ?? memRes?.members ?? []);
	const client = members.find(
		(m: any) => m.role === "client" && m.status === "active" && !m.deletedAt,
	);
	const trainer = members.find(
		(m: any) => m.role === "trainer" && m.status === "active" && !m.deletedAt,
	);

	cached = {
		serviceId: service?.id,
		clientId: client?.userId,
		trainerMemberId: trainer?.id ?? null,
	};
	return cached;
}

// Standard validity window for a created package instance.
export function pkgWindow() {
	const startsAt = new Date(Date.UTC(2026, 0, 1)).toISOString();
	const expiresAt = new Date(Date.UTC(2027, 0, 1)).toISOString();
	return { startsAt, expiresAt };
}
