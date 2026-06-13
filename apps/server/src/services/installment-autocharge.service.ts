/**
 * Phase E2 — Multi-tenant installment auto-charge service.
 *
 * Fires daily (folded into the existing "0 2 * * *" cron slot alongside the
 * installment sweep) after the sweep has run, so newly-overdue installments
 * are included in the same nightly run.
 *
 * Per-installment logic:
 *   1. Find candidates: pending/overdue, due_date <= now, package has
 *      auto_charge_enabled=true + stripe_customer_id + default_payment_method_id,
 *      remainingDue > 0.
 *   2. Skip installments that already have a stripe_payment_intent_id (in-flight
 *      or previously succeeded — avoids double-charge).
 *   3. Create an off-session PaymentIntent on the connected account with an
 *      idempotency key of `inst-autocharge-<installmentId>-<dueDateEpoch>`.
 *      Persist the PI id immediately so any retry sees it on step 2.
 *   4. On card_error / authentication_required (SCA): do NOT confirm; generate a
 *      fallback payment link via the shared helper; notify org admins in-app.
 *   5. All other errors: log + continue (never abort the whole run).
 *
 * Stripe best-practices:
 *   - off_session: true + confirm: true for autonomous charging.
 *   - No payment_method_types — dynamic payment methods.
 *   - Idempotency key scoped to (installmentId, dueDateEpoch) so a cron restart
 *     within the same due-date epoch reuses the existing PI rather than creating
 *     a second one (deduplication at the Stripe layer as well as the DB layer).
 */

import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel-schema";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { services } from "@avantej-core/db/schema/tenant/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { notifications } from "@avantej-core/db/schema/tenant/notifications";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { and, eq, inArray, isNotNull, lte, isNull } from "drizzle-orm";
import {
	getConnectAccountForOrg,
	getConnectAccountForOrgCountry,
	computeApplicationFee,
} from "@/services/connect-account.service";
import { resolveBranchCountryCode } from "@/services/branch-country.service";
import { getStripeClient } from "@/lib/stripe";
import type Stripe from "stripe";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export interface InstallmentAutoChargeReport {
	orgsScanned: number;
	candidates: number;
	charged: number;
	fellBackToLink: number;
	errors: number;
}

export interface RunInstallmentAutoChargeArgs {
	controlPanelDb: ControlPanelDb;
	getTenantDb: (organizationId: string) => Promise<unknown>;
	stripe?: ReturnType<typeof getStripeClient>;
	now?: Date;
}

// ---------------------------------------------------------------------------
// Shared helper: create a fallback payment link without going through oRPC
// ---------------------------------------------------------------------------

async function createFallbackPaymentLink(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
	stripe: ReturnType<typeof getStripeClient>,
	installment: typeof installments.$inferSelect,
	organizationId: string,
	webAppUrl: string,
): Promise<string | null> {
	try {
		const remainingDue =
			installment.amount +
			(installment.taxAmount ?? 0) -
			(installment.amountPaid ?? 0);
		if (remainingDue <= 0) return null;

		// Load package instance for context.
		const [pkg] = await tenantDb
			.select({
				id: packageInstances.id,
				serviceId: packageInstances.serviceId,
				salesOrderId: packageInstances.salesOrderId,
				installmentsTotal: packageInstances.installmentsTotal,
			})
			.from(packageInstances)
			.where(eq(packageInstances.id, installment.packageInstanceId))
			.limit(1);
		if (!pkg) return null;

		// Resolve service name.
		let serviceName = "Package";
		if (pkg.serviceId) {
			const [svc] = await tenantDb
				.select({ name: services.name })
				.from(services)
				.where(eq(services.id, pkg.serviceId))
				.limit(1);
			if (svc?.name) serviceName = String(svc.name);
		}

		// Sales order for redirect + branch resolution.
		const salesOrderId =
			installment.salesOrderId ?? pkg.salesOrderId ?? null;
		const [salesOrder] = salesOrderId
			? await tenantDb
					.select({ id: salesOrders.id, branchId: salesOrders.branchId })
					.from(salesOrders)
					.where(eq(salesOrders.id, salesOrderId))
					.limit(1)
			: [null];

		// Resolve Connect account.
		const branchId = salesOrder?.branchId ?? null;
		const countryCode = branchId
			? await resolveBranchCountryCode(branchId, tenantDb)
			: null;
		const acct = countryCode
			? await getConnectAccountForOrgCountry(
					organizationId,
					countryCode,
					controlPanelDb,
				)
			: await getConnectAccountForOrg(organizationId, controlPanelDb);

		if (!acct.chargesEnabled) return null;

		// Deactivate any existing link to prevent double-payment.
		if (installment.stripePaymentLinkId) {
			try {
				await stripe.paymentLinks.update(
					String(installment.stripePaymentLinkId),
					{ active: false },
					{ stripeAccount: acct.acctId },
				);
			} catch {
				// best-effort
			}
		}

		const currency = "myr";
		const applicationFeeAmount = computeApplicationFee(
			remainingDue,
			acct.appFeeBps,
		);
		const lineItemName = `Installment #${installment.installmentNumber} of ${pkg.installmentsTotal ?? "?"} — ${serviceName}`;

		const price = await stripe.prices.create(
			{
				unit_amount: remainingDue,
				currency,
				product_data: { name: lineItemName },
			},
			{ stripeAccount: acct.acctId },
		);

		const sharedMetadata = {
			type: "installment",
			installmentId: installment.id,
			packageInstanceId: installment.packageInstanceId,
			salesOrderId: salesOrderId ?? "",
			organizationId,
		};

		const redirectUrl = salesOrderId
			? `${webAppUrl}/dashboard/sales/${salesOrderId}?installmentPaid=1`
			: `${webAppUrl}/dashboard/packages/view`;

		const link = await stripe.paymentLinks.create(
			{
				line_items: [{ price: price.id, quantity: 1 }],
				application_fee_amount: applicationFeeAmount,
				after_completion: {
					type: "redirect",
					redirect: { url: redirectUrl },
				},
				restrictions: { completed_sessions: { limit: 1 } },
				metadata: sharedMetadata,
				payment_intent_data: { metadata: sharedMetadata },
			},
			{ stripeAccount: acct.acctId },
		);

		// Persist the new link id on the installment row.
		await tenantDb
			.update(installments)
			.set({
				stripePaymentLinkId: link.id,
				updatedAt: new Date(),
			})
			.where(eq(installments.id, installment.id));

		return link.url;
	} catch (err) {
		console.error(
			`[installment-autocharge] createFallbackPaymentLink threw for installment=${installment.id}:`,
			err instanceof Error ? err.message : String(err),
		);
		return null;
	}
}

// ---------------------------------------------------------------------------
// Notify org admins about a failed auto-charge
// ---------------------------------------------------------------------------

async function notifyAdminsOfAutoChargeFailed(
	tenantDb: TenantDb,
	params: {
		installmentId: string;
		installmentNumber: number;
		amountCents: number;
		reason: string;
		fallbackLinkUrl: string | null;
	},
): Promise<void> {
	const admins = await tenantDb
		.select({ userId: members.userId })
		.from(members)
		.where(and(eq(members.role, "admin"), eq(members.status, "active")));

	if (admins.length === 0) return;

	const amountRm = (params.amountCents / 100).toFixed(2);
	const title = `Auto-charge failed — Installment #${params.installmentNumber}`;
	const message = params.fallbackLinkUrl
		? `Auto-charge of RM ${amountRm} for installment #${params.installmentNumber} failed (${params.reason}). A payment link has been generated: ${params.fallbackLinkUrl}`
		: `Auto-charge of RM ${amountRm} for installment #${params.installmentNumber} failed (${params.reason}). Please collect payment manually.`;

	await tenantDb.insert(notifications).values(
		admins.map((a) => ({
			userId: a.userId,
			type: "installment_autocharge_failed",
			title,
			message,
			relatedId: params.installmentId,
			relatedType: "installment",
		})),
	);
}

// ---------------------------------------------------------------------------
// Main service
// ---------------------------------------------------------------------------

export async function runInstallmentAutoCharge(
	args: RunInstallmentAutoChargeArgs,
): Promise<InstallmentAutoChargeReport> {
	const { controlPanelDb, getTenantDb } = args;
	const now = args.now ?? new Date();
	const stripe = args.stripe ?? getStripeClient();

	// Read WEB_APP_URL at runtime (CF Workers env).
	let webAppUrl = "https://app.avantej.com";
	try {
		const { env } = require("cloudflare:workers") as {
			env: Record<string, string | undefined>;
		};
		if (env.WEB_APP_URL) webAppUrl = env.WEB_APP_URL;
	} catch {
		if (process.env.WEB_APP_URL) webAppUrl = process.env.WEB_APP_URL;
	}

	const report: InstallmentAutoChargeReport = {
		orgsScanned: 0,
		candidates: 0,
		charged: 0,
		fellBackToLink: 0,
		errors: 0,
	};

	const orgs = await controlPanelDb
		.select({ id: organizations.id, name: organizations.name })
		.from(organizations)
		.where(eq(organizations.paymentStatus, "active"));

	for (const org of orgs) {
		report.orgsScanned++;
		try {
			const tenantDb = (await getTenantDb(org.id)) as TenantDb;

			// Resolve Connect account once per org (lazy — only needed if candidates exist).
			// We resolve it per-installment to support country-specific accounts correctly,
			// so this just acts as a short-circuit when the org has no Connect account.

			// Find candidates: pending/overdue installments past their due date,
			// on packages with auto_charge_enabled + both Stripe ids set,
			// and NOT yet having a stripe_payment_intent_id (to avoid double-charge).
			const candidates = await tenantDb
				.select({
					id: installments.id,
					installmentNumber: installments.installmentNumber,
					amount: installments.amount,
					taxAmount: installments.taxAmount,
					amountPaid: installments.amountPaid,
					dueDate: installments.dueDate,
					packageInstanceId: installments.packageInstanceId,
					salesOrderId: installments.salesOrderId,
					stripePaymentLinkId: installments.stripePaymentLinkId,
					stripePaymentIntentId: installments.stripePaymentIntentId,
					// package fields joined below
				})
				.from(installments)
				.innerJoin(
					packageInstances,
					eq(installments.packageInstanceId, packageInstances.id),
				)
				.where(
					and(
						inArray(installments.status, ["pending", "overdue"]),
						lte(installments.dueDate, now),
						eq(packageInstances.autoChargeEnabled, true),
						isNotNull(packageInstances.stripeCustomerId),
						isNotNull(packageInstances.defaultPaymentMethodId),
						// Skip if we already issued a PI for this installment — either
						// in-flight or previously confirmed via the webhook.
						isNull(installments.stripePaymentIntentId),
					),
				);

			report.candidates += candidates.length;

			for (const candidate of candidates) {
				try {
					// Load package for Stripe customer + PM ids (the JOIN above didn't
					// SELECT them — re-fetch the single row instead of a wide join).
					const [pkg] = await tenantDb
						.select({
							stripeCustomerId: packageInstances.stripeCustomerId,
							defaultPaymentMethodId: packageInstances.defaultPaymentMethodId,
							salesOrderId: packageInstances.salesOrderId,
						})
						.from(packageInstances)
						.where(eq(packageInstances.id, candidate.packageInstanceId))
						.limit(1);

					if (!pkg?.stripeCustomerId || !pkg.defaultPaymentMethodId) {
						// Race: auto_charge was disabled between the outer SELECT and now.
						continue;
					}

					const remainingDue =
						candidate.amount +
						(candidate.taxAmount ?? 0) -
						(candidate.amountPaid ?? 0);
					if (remainingDue <= 0) continue;

					// Resolve Connect account for this package.
					const effectiveSalesOrderId =
						candidate.salesOrderId ?? pkg.salesOrderId ?? null;
					const [salesOrder] = effectiveSalesOrderId
						? await tenantDb
								.select({ branchId: salesOrders.branchId })
								.from(salesOrders)
								.where(eq(salesOrders.id, effectiveSalesOrderId))
								.limit(1)
						: [null];

					const branchId = salesOrder?.branchId ?? null;
					const countryCode = branchId
						? await resolveBranchCountryCode(branchId, tenantDb)
						: null;
					const acct = countryCode
						? await getConnectAccountForOrgCountry(
								org.id,
								countryCode,
								controlPanelDb,
							)
						: await getConnectAccountForOrg(org.id, controlPanelDb);

					if (!acct.chargesEnabled) {
						console.warn(
							`[installment-autocharge] org=${org.id} inst=${candidate.id} skip — Connect account not charges-enabled`,
						);
						continue;
					}

					const applicationFeeAmount = computeApplicationFee(
						remainingDue,
						acct.appFeeBps,
					);

					// Idempotency key: scoped to (installmentId, dueDateEpoch). A cron
					// restart within the same due-date epoch reuses the existing PI at
					// the Stripe layer rather than creating a duplicate.
					const dueDateEpoch = Math.floor(
						candidate.dueDate.getTime() / 1000,
					);
					const idempotencyKey = `inst-autocharge-${candidate.id}-${dueDateEpoch}`;

					const piMetadata = {
						type: "installment",
						installmentId: candidate.id,
						packageInstanceId: candidate.packageInstanceId,
						salesOrderId: effectiveSalesOrderId ?? "",
						organizationId: org.id,
					};

					// Create and immediately confirm the off-session PaymentIntent.
					let pi: Stripe.PaymentIntent;
					try {
						pi = await stripe.paymentIntents.create(
							{
								amount: remainingDue,
								currency: "myr",
								customer: pkg.stripeCustomerId,
								payment_method: pkg.defaultPaymentMethodId,
								off_session: true,
								confirm: true,
								application_fee_amount: applicationFeeAmount,
								metadata: piMetadata,
								// DO NOT set payment_method_types — dynamic payment methods.
							},
							{
								stripeAccount: acct.acctId,
								idempotencyKey,
							},
						) as unknown as Stripe.PaymentIntent;
					} catch (stripeErr) {
						const err = stripeErr as Stripe.errors.StripeCardError & {
							code?: string;
						};
						const isAuthRequired =
							err.code === "authentication_required" ||
							err.code === "card_error";

						if (isAuthRequired) {
							// SCA fallback: generate a payment link for the customer to
							// complete 3DS themselves.
							const fallbackUrl = await createFallbackPaymentLink(
								tenantDb,
								controlPanelDb,
								stripe,
								candidate as typeof installments.$inferSelect,
								org.id,
								webAppUrl,
							);
							try {
								await notifyAdminsOfAutoChargeFailed(tenantDb, {
									installmentId: candidate.id,
									installmentNumber: candidate.installmentNumber,
									amountCents: remainingDue,
									reason: err.code ?? "authentication_required",
									fallbackLinkUrl: fallbackUrl,
								});
							} catch (notifyErr) {
								console.error(
									`[installment-autocharge] notify failed for inst=${candidate.id}:`,
									notifyErr instanceof Error
										? notifyErr.message
										: String(notifyErr),
								);
							}
							report.fellBackToLink++;
							console.warn(
								`[installment-autocharge] org=${org.id} inst=${candidate.id} SCA fallback — code=${err.code}`,
							);
						} else {
							// Non-SCA error: log and continue.
							report.errors++;
							console.error(
								`[installment-autocharge] org=${org.id} inst=${candidate.id} PI create failed:`,
								err instanceof Error ? err.message : String(err),
							);
						}
						continue;
					}

					// Persist the PI id immediately so replay skips this installment.
					await tenantDb
						.update(installments)
						.set({
							stripePaymentIntentId: pi.id,
							updatedAt: new Date(),
						})
						.where(eq(installments.id, candidate.id));

					// The payment_intent.succeeded webhook (existing E1 branch) will call
					// confirmInstallmentPayment when Stripe fires the event.
					report.charged++;
					console.log(
						`[installment-autocharge] org=${org.id} inst=${candidate.id} PI created pi=${pi.id} status=${pi.status}`,
					);
				} catch (rowErr) {
					report.errors++;
					console.error(
						`[installment-autocharge] org=${org.id} inst=${candidate.id} row error:`,
						rowErr instanceof Error ? rowErr.message : String(rowErr),
					);
				}
			}
		} catch (orgErr) {
			report.errors++;
			console.error(
				`[installment-autocharge] org=${org.id} top-level error:`,
				orgErr instanceof Error ? orgErr.message : String(orgErr),
			);
		}
	}

	return report;
}
