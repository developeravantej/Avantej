import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { adminProcedure } from "@/lib/admin-procedure";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import {
	type StripeClientLike,
	type StripeInvoice,
	resolveStripeCustomerId,
	projectInvoice,
} from "./_shared";

export function createInvoicesProcedures(
	resolveStripe: () => StripeClientLike,
) {
	return {
		listInvoices: adminProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					limit: z.number().int().min(1).max(100).default(20),
					startingAfter: z.string().optional(),
				}),
			)
			.handler(async ({ context, input }) => {
				const cpDb = getControlPanelDb(context);
				const { customerId, orgFound } = await resolveStripeCustomerId(
					cpDb,
					input.organizationId,
				);
				if (!orgFound) {
					throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
				}
				if (!customerId) {
					return {
						invoices: [] as ReturnType<typeof projectInvoice>[],
						hasMore: false,
						nextCursor: undefined as string | undefined,
					};
				}
				const stripe = resolveStripe();
				let resp: { data: StripeInvoice[]; has_more: boolean };
				try {
					resp = await stripe.invoices.list({
						customer: customerId,
						limit: input.limit,
						starting_after: input.startingAfter,
						expand: ["data.charge"],
					});
				} catch (err) {
					throw new ORPCError("BAD_REQUEST", {
						message: `Stripe invoice list failed: ${
							err instanceof Error ? err.message : "unknown"
						}`,
					});
				}
				const invoices = resp.data.map(projectInvoice);
				const last = invoices[invoices.length - 1];
				return {
					invoices,
					hasMore: Boolean(resp.has_more),
					nextCursor: resp.has_more && last ? last.id : undefined,
				};
			}),

		getInvoice: adminProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					invoiceId: z.string().min(1),
				}),
			)
			.handler(async ({ context, input }) => {
				const cpDb = getControlPanelDb(context);
				const { customerId, orgFound } = await resolveStripeCustomerId(
					cpDb,
					input.organizationId,
				);
				if (!orgFound) {
					throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
				}
				if (!customerId) {
					throw new ORPCError("NOT_FOUND", {
						message: "Tenant has no Stripe customer record",
					});
				}
				const stripe = resolveStripe();
				let inv: StripeInvoice;
				try {
					inv = await stripe.invoices.retrieve(input.invoiceId, {
						expand: ["charge", "lines"],
					});
				} catch (err) {
					throw new ORPCError("NOT_FOUND", {
						message: `Stripe invoice retrieve failed: ${
							err instanceof Error ? err.message : "unknown"
						}`,
					});
				}
				const projected = projectInvoice(inv);
				const lines =
					inv.lines?.data.map((l) => ({
						id: l.id,
						description: l.description,
						amount: Number(l.amount ?? 0),
						currency: (l.currency ?? "usd").toLowerCase(),
						quantity: l.quantity,
					})) ?? [];
				return { invoice: projected, lines };
			}),
	};
}
