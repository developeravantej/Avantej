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
} from "@/services/connect-account.service";
import { resolveBranchCountryCode } from "@/services/branch-country.service";
import { getOrCreateStripeCustomer } from "@/services/customer-stripe.service";
import { type StripeClientLike, resolveGrossAmount } from "./_shared";

export function createIntentProcedures(resolveStripe: () => StripeClientLike) {
	return {
		createPaymentIntent: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					appointmentId: z.string().uuid(),
				}),
			)
			.handler(async ({ context, input }) => {
				assertOrgContextMatch(context, input);
				assertTenantContext(context);

				const controlPanelDb = getControlPanelDb(context);

				// Fetch appointment.
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
				if (appt.paymentStatus === "paid") {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: "Appointment is already paid",
					});
				}

				// Phase 4: resolve Connect account per the branch's country.
				const countryCode = await resolveBranchCountryCode(
					appt.branchId,
					context.tenantDb,
				);
				const acct = countryCode
					? await getConnectAccountForOrgCountry(
							input.organizationId,
							countryCode,
							controlPanelDb,
						)
					: await getConnectAccountForOrg(input.organizationId, controlPanelDb);

				const amount = resolveGrossAmount(appt);
				const currency = (appt.currency ?? "MYR").toLowerCase();
				const applicationFeeAmount = computeApplicationFee(
					amount,
					acct.appFeeBps,
				);

				const stripe = resolveStripe();
				const pi = await stripe.paymentIntents.create(
					{
						amount,
						currency,
						application_fee_amount: applicationFeeAmount,
						automatic_payment_methods: { enabled: true },
						metadata: {
							appointmentId: appt.id,
							organizationId: input.organizationId,
							branchId: appt.branchId,
						},
					},
					{
						stripeAccount: acct.acctId,
						idempotencyKey: `pi:appt:${appt.id}`,
					},
				);

				// Persist snapshot fields so historical rows survive Phase 4 schema move.
				await context.tenantDb
					.update(appointments)
					.set({
						stripePaymentIntentId: pi.id,
						stripeConnectAccountIdSnapshot: acct.acctId,
						applicationFeeAmount,
						currency: currency.toUpperCase(),
						updatedAt: new Date(),
					})
					.where(eq(appointments.id, appt.id));

				return {
					clientSecret: pi.client_secret ?? "",
					paymentIntentId: pi.id,
					stripeAccountId: acct.acctId,
					amount,
					currency: currency.toUpperCase(),
					applicationFeeAmount,
				};
			}),

		createSetupIntent: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					customerProfileId: z.string().uuid(),
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
				if (!profile) {
					throw new ORPCError("NOT_FOUND", {
						message: "Customer profile not found",
					});
				}

				// Phase 4: customer's stripeConnectAccountIdSnapshot anchors the
				// acct for already-provisioned customers. fee% comes from legacy
				// (org-level) resolver — we don't yet know the country here so
				// can't call the country-specific resolver for the snapshot acct.
				// v1 follow-up: derive primary country from the customer's branch
				// or from organizations.primaryCountryCode and use the country
				// resolver consistently. For now, legacy provides the fee bps
				// (tier-only, country-agnostic), which is correct.
				const acct = await getConnectAccountForOrg(
					input.organizationId,
					controlPanelDb,
				);
				const snapshotAcctId = profile.stripeConnectAccountIdSnapshot as
					| string
					| null
					| undefined;
				const stripeAccountId = snapshotAcctId ?? acct.acctId;

				const stripe = resolveStripe();
				const { customerId } = await getOrCreateStripeCustomer({
					tenantDb: context.tenantDb,
					stripe,
					customerProfileId: input.customerProfileId,
					connectAccountId: stripeAccountId,
					organizationId: input.organizationId,
				});

				const setupIntent = await stripe.setupIntents.create(
					{
						customer: customerId,
						usage: "off_session",
						metadata: {
							customerProfileId: input.customerProfileId,
							organizationId: input.organizationId,
						},
					},
					{ stripeAccount: stripeAccountId },
				);

				return {
					clientSecret: setupIntent.client_secret ?? "",
					setupIntentId: setupIntent.id,
					stripeAccountId,
					stripeCustomerId: customerId,
				};
			}),
	};
}
