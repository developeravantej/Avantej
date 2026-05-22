import {
	createScheduledReport,
	deleteScheduledReport,
	listScheduledReports,
	requirePermission,
	toggleScheduledReportActive,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";

const windowKeySchema = z.enum(["7D", "30D", "90D", "YTD"]);
const frequencySchema = z.enum(["daily", "weekly", "monthly"]);
const formatSchema = z.enum(["pdf", "csv"]);

// Comma-separated recipients — each token must be a valid email.
const recipientsSchema = z
	.string()
	.trim()
	.min(1, "At least one recipient is required")
	.refine(
		(s) =>
			s
				.split(",")
				.map((r) => r.trim())
				.filter(Boolean)
				.every((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)),
		{ message: "All recipients must be valid email addresses" },
	);

export const scheduledReportsRouter = {
	list: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			return listScheduledReports(context.tenantDb);
		}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				recipients: recipientsSchema,
				reportName: z.string().trim().min(1).max(200),
				windowKey: windowKeySchema,
				format: formatSchema.default("pdf"),
				frequency: frequencySchema,
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database or member not available",
				});
			}
			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"reports",
					"export",
				);
			} catch {
				throw new ORPCError("FORBIDDEN", { message: "Permission denied" });
			}
			return createScheduledReport(context.tenantDb, {
				recipients: input.recipients,
				reportName: input.reportName,
				windowKey: input.windowKey,
				format: input.format,
				frequency: input.frequency,
				createdBy: context.session?.user.id,
			});
		}),

	delete: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database or member not available",
				});
			}
			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"reports",
					"export",
				);
			} catch {
				throw new ORPCError("FORBIDDEN", { message: "Permission denied" });
			}
			await deleteScheduledReport(context.tenantDb, input.id);
			return { success: true };
		}),

	toggle: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				isActive: z.boolean(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database or member not available",
				});
			}
			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"reports",
					"export",
				);
			} catch {
				throw new ORPCError("FORBIDDEN", { message: "Permission denied" });
			}
			return toggleScheduledReportActive(
				context.tenantDb,
				input.id,
				input.isActive,
			);
		}),
};
