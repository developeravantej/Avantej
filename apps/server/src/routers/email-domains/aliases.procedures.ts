/**
 * Email Domain Router — alias procedures (list/add/remove).
 */

import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "@avantej-core/api";
import {
	addAlias,
	getEmailDomainById,
	listAliasesForDomain,
	removeAlias,
} from "@avantej-core/services/email-domain.service";
import {
	getControlPanelDb,
	getPgErrorCode,
	LOCAL_PART_REGEX,
	requireOrgAdmin,
} from "./_shared";

export const aliasProcedures = {
	/**
	 * List aliases for a domain.
	 */
	listAliases: protectedProcedure
		.input(
			z.object({
				emailDomainId: z.string().uuid(),
				organizationId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication required",
				});
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(
				cpDb,
				context.session.user.id,
				input.organizationId,
			);

			const domain = await getEmailDomainById(cpDb, {
				id: input.emailDomainId,
				organizationId: input.organizationId,
			});
			if (!domain) {
				throw new ORPCError("NOT_FOUND", { message: "Email domain not found" });
			}
			return listAliasesForDomain(cpDb, input.emailDomainId);
		}),

	/**
	 * Add a new alias on a domain.
	 */
	addAlias: protectedProcedure
		.input(
			z.object({
				emailDomainId: z.string().uuid(),
				organizationId: z.string().uuid(),
				localPart: z
					.string()
					.regex(LOCAL_PART_REGEX, "Letters, numbers, . _ -"),
				label: z.string().min(1).max(100).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication required",
				});
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(
				cpDb,
				context.session.user.id,
				input.organizationId,
			);

			const domain = await getEmailDomainById(cpDb, {
				id: input.emailDomainId,
				organizationId: input.organizationId,
			});
			if (!domain) {
				throw new ORPCError("NOT_FOUND", { message: "Email domain not found" });
			}

			try {
				return await addAlias(cpDb, {
					emailDomainId: input.emailDomainId,
					localPart: input.localPart.toLowerCase(),
					label: input.label,
				});
			} catch (e) {
				// Drizzle wraps the pg error; the unique-violation code (23505)
				// lives on `.cause`, not on the top-level message. Match the code
				// via the cause-walking helper rather than string-matching, which
				// misses the wrapped case and leaks a raw 500.
				if (getPgErrorCode(e) === "23505") {
					throw new ORPCError("CONFLICT", {
						message: "Alias already exists for this local-part",
					});
				}
				throw e;
			}
		}),

	/**
	 * Remove an alias.
	 */
	removeAlias: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				emailDomainId: z.string().uuid(),
				organizationId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication required",
				});
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(
				cpDb,
				context.session.user.id,
				input.organizationId,
			);

			const domain = await getEmailDomainById(cpDb, {
				id: input.emailDomainId,
				organizationId: input.organizationId,
			});
			if (!domain) {
				throw new ORPCError("NOT_FOUND", { message: "Email domain not found" });
			}

			const removed = await removeAlias(cpDb, {
				id: input.id,
				emailDomainId: input.emailDomainId,
			});
			if (!removed) {
				throw new ORPCError("NOT_FOUND", { message: "Alias not found" });
			}
			return { deleted: true as const, id: input.id };
		}),
};
