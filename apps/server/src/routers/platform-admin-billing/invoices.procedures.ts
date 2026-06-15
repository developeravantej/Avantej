import { z } from "zod";
import { adminProcedure } from "@/lib/admin-procedure";
import { getStripeClient } from "@/lib/stripe";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import { type StripeClientLike, fetchCrossTenantInvoices } from "./_shared";

export function createInvoicesProcedures(stripeOverride?: StripeClientLike) {
	const resolveStripe = (): StripeClientLike =>
		stripeOverride ?? (getStripeClient() as unknown as StripeClientLike);

	return {
		listInvoicesCrossTenant: adminProcedure
			.input(
				z.object({
					limit: z.number().int().min(1).max(100).default(50),
					days: z.number().int().min(7).max(180).default(30),
				}),
			)
			.handler(async ({ context, input }) => {
				const cpDb = getControlPanelDb(context);
				const stripe = resolveStripe();
				const result = await fetchCrossTenantInvoices(
					cpDb,
					stripe,
					input.limit,
					Math.max(5, Math.ceil(input.limit / 4)),
					input.days,
				);
				return {
					invoices: result.invoices,
					stripeAvailable: result.stripeAvailable,
				};
			}),
	};
}
