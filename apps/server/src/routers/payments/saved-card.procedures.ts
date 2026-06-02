import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "@avantej-core/api";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import {
	assertOrgContextMatch,
	assertTenantContext,
} from "@avantej-core/api/guards";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import {
	getConnectAccountForOrg,
	getConnectAccountForOrgCountry,
	computeApplicationFee,
	type ResolvedConnectAccount,
} from "@/services/connect-account.service";
import { resolveBranchCountryCode } from "@/services/branch-country.service";
import { type StripeClientLike } from "./_shared";

export function createSavedCardProcedures(
	resolveStripe: () => StripeClientLike,
) {
	return {
		listSavedCards: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					customerProfileId: z.string().uuid(),
				}),
			)
			.handler(async ({ context, input }) => {
				assertOrgContextMatch(context, input);
				assertTenantContext(context);

				const [profile] = await context.tenantDb
					.select()
					.from(customerProfiles)
					.where(eq(customerProfiles.id, input.customerProfileId))
					.limit(1);
				if (!profile?.stripeCustomerId) {
					return {
						cards: [] as Array<{
							id: string;
							brand: string;
							last4: string;
							expMonth: number;
							expYear: number;
							isDefault: boolean;
						}>,
					};
				}

				const stripe = resolveStripe();
				const list = await stripe.paymentMethods.list(
					{ customer: profile.stripeCustomerId, type: "card", limit: 20 },
					{
						stripeAccount: profile.stripeConnectAccountIdSnapshot ?? undefined,
					},
				);
				const defaultId = profile.defaultPaymentMethodId ?? null;
				return {
					cards: list.data
						.filter(
							(p): p is { id: string; card: NonNullable<typeof p.card> } =>
								p.card != null,
						)
						.map((p) => ({
							id: p.id,
							brand: p.card.brand,
							last4: p.card.last4,
							expMonth: p.card.exp_month,
							expYear: p.card.exp_year,
							isDefault: p.id === defaultId,
						})),
				};
			}),

		chargeSavedCard: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					customerProfileId: z.string().uuid(),
					appointmentId: z.string().uuid().nullable().optional(),
					paymentMethodId: z.string().min(1).nullable().optional(),
					amount: z.number().int().positive(),
					currency: z.string().min(3).max(3).default("MYR"),
					description: z.string().optional(),
				}),
			)
			.handler(async ({ context, input }) => {
				assertOrgContextMatch(context, input);
				assertTenantContext(context);

				const controlPanelDb = getControlPanelDb(context);

				const [profile] = await context.tenantDb
					.select()
					.from(customerProfiles)
					.where(eq(customerProfiles.id, input.customerProfileId))
					.limit(1);
				if (!profile?.stripeCustomerId) {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: "Customer has no saved card",
					});
				}
				const pmId = input.paymentMethodId ?? profile.defaultPaymentMethodId;
				if (!pmId) {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: "No payment method on file",
					});
				}

				// Phase 4: pick the Connect acct by appointment branch country when
				// possible. Fall back to customer's snapshot (acct that owns the
				// saved card) when there's no appointment. Final fallback: legacy
				// org-level acct. fee% is country-agnostic (tier-only), so legacy
				// is fine to provide it whenever we override only acctId.
				let acct: ResolvedConnectAccount;
				let stripeAccountId: string;
				if (input.appointmentId) {
					const [appt] = await context.tenantDb
						.select()
						.from(appointments)
						.where(eq(appointments.id, input.appointmentId))
						.limit(1);
					if (!appt) {
						throw new ORPCError("NOT_FOUND", {
							message: "Appointment not found",
						});
					}
					const countryCode = await resolveBranchCountryCode(
						appt.branchId,
						context.tenantDb,
					);
					acct = countryCode
						? await getConnectAccountForOrgCountry(
								input.organizationId,
								countryCode,
								controlPanelDb,
							)
						: await getConnectAccountForOrg(
								input.organizationId,
								controlPanelDb,
							);
					// Saved card lives on the customer's snapshot acct — if it
					// disagrees with the country resolution, the snapshot wins
					// (the card isn't shared across Connect accts).
					stripeAccountId =
						(profile.stripeConnectAccountIdSnapshot as
							| string
							| null
							| undefined) ?? acct.acctId;
				} else if (profile.stripeConnectAccountIdSnapshot) {
					acct = await getConnectAccountForOrg(
						input.organizationId,
						controlPanelDb,
					);
					stripeAccountId = profile.stripeConnectAccountIdSnapshot as string;
				} else {
					acct = await getConnectAccountForOrg(
						input.organizationId,
						controlPanelDb,
					);
					stripeAccountId = acct.acctId;
				}

				const applicationFeeAmount = computeApplicationFee(
					input.amount,
					acct.appFeeBps,
				);
				const currency = input.currency.toLowerCase();
				const stripe = resolveStripe();
				const pi = await stripe.paymentIntents.create(
					{
						amount: input.amount,
						currency,
						customer: profile.stripeCustomerId,
						payment_method: pmId,
						confirm: true,
						off_session: true,
						application_fee_amount: applicationFeeAmount,
						description: input.description,
						metadata: {
							customerProfileId: input.customerProfileId,
							organizationId: input.organizationId,
							...(input.appointmentId
								? { appointmentId: input.appointmentId }
								: {}),
						},
					},
					{
						stripeAccount: stripeAccountId,
						idempotencyKey: input.appointmentId
							? `pi:appt:offsession:${input.appointmentId}`
							: undefined,
					},
				);

				return {
					paymentIntentId: pi.id,
					status: pi.status,
					amount: input.amount,
					currency: currency.toUpperCase(),
					applicationFeeAmount,
				};
			}),
	};
}
