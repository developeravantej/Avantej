import {
	AgreementAlreadySignedError,
	getPackageAgreement,
	signPackageAgreement,
} from "@avantej-core/services";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	assertTenantContext,
	guardBranchAccessible,
	requirePermissionOrpc,
} from "../../guards";

/**
 * Package-agreement procedures (UAT §2). `getAgreement` returns the view-model the
 * web client renders into a PDF (jsPDF, client-side — mirrors the invoice flow).
 * `signAgreement` captures the customer's e-signature into the existing
 * `package_instances.e_signature` / `terms_agreed_at` columns and is idempotency-
 * guarded: a signed agreement is immutable.
 */
export const packageInstancesAgreementProcedures = {
	getAgreement: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			assertTenantContext(context);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"read",
			);

			const pkg = await context.tenantDb.query.packageInstances.findFirst({
				where: eq(packageInstances.id, input.packageInstanceId),
			});
			if (!pkg) {
				throw new ORPCError("NOT_FOUND", {
					message: `Package not found: ${input.packageInstanceId}`,
				});
			}
			const svc = await context.tenantDb.query.services.findFirst({
				where: eq(services.id, pkg.serviceId),
			});
			try {
				guardBranchAccessible(svc?.branchId, context.accessibleNodeIds);
			} catch {
				throw new ORPCError("NOT_FOUND", {
					message: `Package not found: ${input.packageInstanceId}`,
				});
			}

			const agreement = await getPackageAgreement(
				context.tenantDb,
				input.packageInstanceId,
			);
			if (!agreement) {
				throw new ORPCError("NOT_FOUND", {
					message: `Package not found: ${input.packageInstanceId}`,
				});
			}
			return agreement;
		}),

	signAgreement: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
				signedName: z.string().trim().min(1).max(120),
				// Optional drawn-signature image (data URL). Capped to keep the row small.
				signatureDataUrl: z
					.string()
					.startsWith("data:image/")
					.max(500_000)
					.optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			assertTenantContext(context);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"update",
			);

			try {
				return await signPackageAgreement(
					context.tenantDb,
					input.packageInstanceId,
					{
						signedName: input.signedName,
						signatureDataUrl: input.signatureDataUrl,
					},
				);
			} catch (err) {
				if (err instanceof AgreementAlreadySignedError) {
					throw new ORPCError("CONFLICT", { message: err.message });
				}
				if (err instanceof Error && err.message.includes("not found")) {
					throw new ORPCError("NOT_FOUND", { message: err.message });
				}
				throw err;
			}
		}),
};
