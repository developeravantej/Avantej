/**
 * Platform Admin — Cross-Tenant Search (Plan F.1, Agent S).
 *
 * Single procedure `search` powering the ⌘K command palette. Resolves
 * a free-text query against organizations + (members→users.email) and
 * returns ranked, deduped tenant rows for jump-to-drill-in.
 *
 * Ranking: id (exact) > slug > name > email.
 * Deduped by organizationId, capped at `limit` (default 10, max 20).
 *
 * Auth: any platform-admin role (super_admin / support / billing).
 * Read-only — no audit row.
 */

import { z } from "zod";
import { eq, ilike, or, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { platformAdminProcedure as adminProcedure } from "@avantej-core/api";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import { user as userTable } from "@avantej-core/db/schema/auth";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MatchType = "id" | "slug" | "name" | "email";

function cpDbFrom(context: unknown): NeonDatabase<typeof controlPanelSchema> {
	const db = (
		context as { honoContext?: { get: (k: string) => unknown } }
	).honoContext?.get("controlPanelDb") as
		| NeonDatabase<typeof controlPanelSchema>
		| undefined;
	if (!db)
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel DB unavailable",
		});
	return db;
}

const RANK: Record<MatchType, number> = {
	id: 0,
	slug: 1,
	name: 2,
	email: 3,
};

export const platformAdminTenantsSearchRouter = {
	search: adminProcedure
		.input(
			z.object({
				query: z.string().min(1).max(200),
				limit: z.number().int().min(1).max(20).default(10),
			}),
		)
		.handler(
			async ({
				context,
				input,
			}): Promise<{
				results: Array<{
					orgId: string;
					orgName: string;
					slug: string;
					matchType: MatchType;
					matchedField?: string;
				}>;
			}> => {
				const cpDb = cpDbFrom(context);
				const raw = input.query.trim();
				if (raw.length === 0) return { results: [] };

				type Hit = {
					orgId: string;
					orgName: string;
					slug: string;
					matchType: MatchType;
					matchedField?: string;
				};
				const hits: Hit[] = [];

				// 1. UUID exact match — short-circuit.
				if (UUID_RE.test(raw)) {
					const [org] = await cpDb
						.select({
							id: organizations.id,
							name: organizations.name,
							slug: organizations.slug,
						})
						.from(organizations)
						.where(eq(organizations.id, raw));
					if (org) {
						return {
							results: [
								{
									orgId: org.id,
									orgName: org.name,
									slug: org.slug,
									matchType: "id",
									matchedField: org.id,
								},
							],
						};
					}
					return { results: [] };
				}

				const pattern = `%${raw}%`;

				// 2. Slug + name matches via single query — tag match type below.
				const orgRows = await cpDb
					.select({
						id: organizations.id,
						name: organizations.name,
						slug: organizations.slug,
					})
					.from(organizations)
					.where(
						or(
							ilike(organizations.slug, pattern),
							ilike(organizations.name, pattern),
						),
					)
					.limit(input.limit * 2);

				const lower = raw.toLowerCase();
				for (const r of orgRows) {
					const slugMatch = r.slug.toLowerCase().includes(lower);
					const nameMatch = r.name.toLowerCase().includes(lower);
					if (slugMatch) {
						hits.push({
							orgId: r.id,
							orgName: r.name,
							slug: r.slug,
							matchType: "slug",
							matchedField: r.slug,
						});
					} else if (nameMatch) {
						hits.push({
							orgId: r.id,
							orgName: r.name,
							slug: r.slug,
							matchType: "name",
							matchedField: r.name,
						});
					}
				}

				// 3. Email matches via user → organization_members join.
				const userMatches = await cpDb
					.select({ id: userTable.id, email: userTable.email })
					.from(userTable)
					.where(ilike(userTable.email, pattern))
					.limit(input.limit * 2);

				if (userMatches.length > 0) {
					const userIds = userMatches.map((u) => u.id);
					const emailByUserId = new Map(
						userMatches.map((u) => [u.id, u.email]),
					);
					const memberRows = await cpDb
						.select({
							userId: organizationMembers.userId,
							organizationId: organizationMembers.organizationId,
							orgName: organizations.name,
							orgSlug: organizations.slug,
						})
						.from(organizationMembers)
						.innerJoin(
							organizations,
							eq(organizations.id, organizationMembers.organizationId),
						)
						.where(inArray(organizationMembers.userId, userIds))
						.limit(input.limit * 4);

					for (const m of memberRows) {
						hits.push({
							orgId: m.organizationId,
							orgName: m.orgName,
							slug: m.orgSlug,
							matchType: "email",
							matchedField: emailByUserId.get(m.userId) ?? undefined,
						});
					}
				}

				// 4. Dedupe by orgId, keeping the best (lowest-rank) matchType.
				const bestByOrg = new Map<string, Hit>();
				for (const h of hits) {
					const cur = bestByOrg.get(h.orgId);
					if (!cur || RANK[h.matchType] < RANK[cur.matchType]) {
						bestByOrg.set(h.orgId, h);
					}
				}

				const ranked = Array.from(bestByOrg.values()).sort((a, b) => {
					const dr = RANK[a.matchType] - RANK[b.matchType];
					if (dr !== 0) return dr;
					return a.orgName.localeCompare(b.orgName);
				});

				return { results: ranked.slice(0, input.limit) };
			},
		),
};
