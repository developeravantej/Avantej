/**
 * Payment Side Effects Service (Plan B Phase 3a)
 *
 * Invoked from the Stripe Connect webhook handler when an appointment's
 * `payment_intent.succeeded` event arrives and the appointment has just been
 * flipped to `payment_status = "paid"`. Drives the post-payment workflow:
 *
 *   1. Auto-confirm the appointment (status: pending -> confirmed).
 *   2. Append an `appointment_status_history` row recording the transition.
 *   3. Send a payment-receipt email to the customer (best-effort).
 *
 * Each side effect is independently try/caught and logged. A failure in one
 * step does not block the others (e.g. an email send failure must not roll
 * back the status transition).
 *
 * Deferred to later phases:
 *   - Commission ledger entry (Phase 3b).
 *   - sales_orders.payment_status sync — paid appointments don't always have
 *     a sales_order (that's a POS concept).
 *   - SMS receipts (email only for now).
 *
 * Workers compatibility: this service does NOT import any DB singletons. All
 * DB access uses the `tenantDb` / `controlPanelDb` connections passed in by
 * the webhook handler (which obtained them via `getTenantDb(c)` /
 * `getControlPanelDb(c)`).
 */

import { and, eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { appointmentClients } from "@avantej-core/db/schema/tenant/appointment-clients";
import { walkInCustomers } from "@avantej-core/db/schema/tenant/walk-in-customers";
import { appointmentStatusHistory } from "@avantej-core/db/schema/tenant/appointment-status-history";
import { user } from "@avantej-core/db/schema/auth";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { sendTenantEmail } from "@/lib/email-send-tenant";
import { escapeHtml } from "@/lib/html";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export interface OnAppointmentPaidArgs {
	tenantDb: TenantDb;
	controlPanelDb: ControlPanelDb;
	appointmentId: string;
	organizationId: string;
	paymentIntentId: string | null;
	amountCents: number | null;
	currency: string | null;
}

/**
 * Format an amount in minor units (cents/sen) as a localized money string,
 * e.g. 12345 + "MYR" -> "MYR 123.45". Falls back gracefully if currency is
 * unknown.
 */
export function formatMoney(
	amountCents: number | null,
	currency: string | null,
): string {
	if (amountCents == null) return "—";
	const major = (amountCents / 100).toFixed(2);
	return currency ? `${currency.toUpperCase()} ${major}` : major;
}

/**
 * Drive the post-payment workflow for an appointment that has just been
 * marked `paid`. All three side effects are best-effort and independently
 * caught — none can fail the webhook ack.
 */
export async function onAppointmentPaid(
	args: OnAppointmentPaidArgs,
): Promise<void> {
	const {
		tenantDb,
		controlPanelDb,
		appointmentId,
		organizationId,
		paymentIntentId,
		amountCents,
		currency,
	} = args;

	// --- 1. Auto-confirm appointment (pending -> confirmed) ---
	let fromStatus: string | null = null;
	let confirmed = false;
	try {
		// Only flip pending -> confirmed. Respect terminal/non-pending states
		// (confirmed / completed / cancelled / no-show) by guarding the WHERE.
		const updated = await tenantDb
			.update(appointments)
			.set({ status: "confirmed", updatedAt: new Date() })
			.where(
				and(
					eq(appointments.id, appointmentId),
					eq(appointments.status, "pending"),
				),
			)
			.returning({ id: appointments.id, status: appointments.status });

		if (updated.length > 0) {
			fromStatus = "pending";
			confirmed = true;
			console.log(
				`[payment-side-effects] auto-confirmed appt=${appointmentId} org=${organizationId} pi=${paymentIntentId ?? "n/a"}`,
			);
		} else {
			console.log(
				`[payment-side-effects] appt=${appointmentId} not in pending state; skipping auto-confirm`,
			);
		}
	} catch (err) {
		console.error(
			`[payment-side-effects] auto-confirm failed for appt=${appointmentId}:`,
			err,
		);
	}

	// --- 2. Append appointment_status_history row ---
	// Only write history if we actually transitioned. Match the
	// `appendAppointmentStatusHistory` shape from packages/services.
	if (confirmed) {
		try {
			await tenantDb.insert(appointmentStatusHistory).values({
				appointmentId,
				fromStatus,
				toStatus: "confirmed",
				changedBy: "system",
				reason: "payment_confirmed",
				notes: paymentIntentId
					? `Stripe payment_intent ${paymentIntentId} succeeded`
					: null,
			});
		} catch (err) {
			console.error(
				`[payment-side-effects] status-history insert failed for appt=${appointmentId}:`,
				err,
			);
		}
	}

	// --- 3. Send payment receipt email (best-effort) ---
	try {
		await sendPaymentReceiptEmail({
			tenantDb,
			controlPanelDb,
			appointmentId,
			organizationId,
			paymentIntentId,
			amountCents,
			currency,
		});
	} catch (err) {
		// sendPaymentReceiptEmail internally swallows expected misses (no
		// email on file) and only throws for unexpected errors. Log + move
		// on — a failed receipt must not roll back the workflow.
		console.error(
			`[payment-side-effects] receipt email failed for appt=${appointmentId}:`,
			err,
		);
	}
}

/**
 * Resolve the customer email for an appointment.
 *
 * Two lookup paths via `appointment_clients`:
 *   - member client → `appointment_clients.client_id` is a Better-Auth
 *     user.id; email lives on control-panel `auth.user.email`.
 *   - walk-in client → `appointment_clients.walk_in_customer_id` →
 *     `walk_in_customers.email` (nullable).
 *
 * If neither path yields an email, returns null and the caller logs + skips.
 *
 * Note: the task spec said "joined via appointment_clients → customer_profiles",
 * but `customer_profiles` has no email column. The authoritative source for a
 * member's email is the control-panel `user` table.
 */
async function resolveCustomerEmail(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
	appointmentId: string,
): Promise<{ email: string | null; name: string | null }> {
	const [client] = await tenantDb
		.select({
			clientId: appointmentClients.clientId,
			clientType: appointmentClients.clientType,
			walkInCustomerId: appointmentClients.walkInCustomerId,
		})
		.from(appointmentClients)
		.where(eq(appointmentClients.appointmentId, appointmentId))
		.limit(1);

	if (!client) {
		return { email: null, name: null };
	}

	if (client.clientType === "walk-in" && client.walkInCustomerId) {
		const [wic] = await tenantDb
			.select({ email: walkInCustomers.email, name: walkInCustomers.name })
			.from(walkInCustomers)
			.where(eq(walkInCustomers.id, client.walkInCustomerId))
			.limit(1);
		return { email: wic?.email ?? null, name: wic?.name ?? null };
	}

	// Member path: clientId references auth.user.id (Better-Auth user, stored
	// on control panel db). No FK due to cross-database constraint.
	if (!client.clientId) {
		return { email: null, name: null };
	}
	const [u] = await controlPanelDb
		.select({ email: user.email, name: user.name })
		.from(user)
		.where(eq(user.id, client.clientId))
		.limit(1);
	return { email: u?.email ?? null, name: u?.name ?? null };
}

interface ReceiptEmailArgs {
	tenantDb: TenantDb;
	controlPanelDb: ControlPanelDb;
	appointmentId: string;
	organizationId: string;
	paymentIntentId: string | null;
	amountCents: number | null;
	currency: string | null;
}

async function sendPaymentReceiptEmail(args: ReceiptEmailArgs): Promise<void> {
	const {
		tenantDb,
		controlPanelDb,
		appointmentId,
		organizationId,
		paymentIntentId,
		amountCents,
		currency,
	} = args;

	const { email, name } = await resolveCustomerEmail(
		tenantDb,
		controlPanelDb,
		appointmentId,
	);

	if (!email) {
		console.log(
			`[payment-side-effects] no customer email on file for appt=${appointmentId} org=${organizationId} — skipping receipt`,
		);
		return;
	}

	const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";
	const formattedAmount = formatMoney(amountCents, currency);
	const piRef = paymentIntentId
		? `<p style="color:#6b7280;font-size:12px;">Reference: ${escapeHtml(paymentIntentId)}</p>`
		: "";

	const subject = `Payment receipt — ${formattedAmount}`;
	const html = `
		<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
			<h1 style="font-size:20px;margin:0 0 16px;">Payment received</h1>
			<p>${greeting}</p>
			<p>Thanks — we've received your payment of <strong>${escapeHtml(formattedAmount)}</strong> for your upcoming appointment. Your booking is now confirmed.</p>
			<p style="color:#6b7280;font-size:13px;">Appointment ID: ${escapeHtml(appointmentId)}</p>
			${piRef}
			<p style="color:#6b7280;font-size:12px;margin-top:24px;">This is an automated receipt. Reply to this email if anything looks wrong.</p>
		</div>
	`.trim();

	await sendTenantEmail(controlPanelDb, {
		organizationId,
		to: email,
		subject,
		html,
		notificationType: "payment_receipt",
		subjectVars: { amount: formattedAmount, appointmentId },
		allowPlatformFallback: true,
	});

	console.log(
		`[payment-side-effects] receipt sent for appt=${appointmentId} to=${email}`,
	);
}

/**
 * Minimal HTML escaping for values interpolated into the receipt template.
 */
