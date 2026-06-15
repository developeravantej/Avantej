import { installmentPlans } from "@avantej-core/db/schema/tenant/installment-plans";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import type { Context } from "../../context";

export async function validateInstallmentPlanCodes(
	context: Context & { tenantDb: NonNullable<Context["tenantDb"]> },
	codes: string[],
): Promise<void> {
	for (const code of codes) {
		const plan = await context.tenantDb.query.installmentPlans.findFirst({
			where: and(
				eq(installmentPlans.code, code),
				eq(installmentPlans.isActive, true),
			),
		});
		if (!plan) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Unknown installment plan: ${code}`,
			});
		}
	}
}
