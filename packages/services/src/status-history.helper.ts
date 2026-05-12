/**
 * Status History Helper
 *
 * Shared writer functions used by entity services to append a status_history
 * row in the same transaction (or connection) as a status mutation.
 *
 * Per audit C4 we use specialized per-entity tables (NOT a generic polymorphic
 * status_history). Each helper is type-safe against its target table.
 *
 * Re-exports the shared `statusHistoryColumns` shape from the schema package
 * so callers don't need to reach across packages.
 */

import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { salesOrderStatusHistory } from "@avantej-core/db/schema/tenant/sales-order-status-history";
import { paymentStatusHistory } from "@avantej-core/db/schema/tenant/payment-status-history";
import { packageInstanceStatusHistory } from "@avantej-core/db/schema/tenant/package-instance-status-history";
import { appointmentStatusHistory } from "@avantej-core/db/schema/tenant/appointment-status-history";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

export { statusHistoryColumns } from "@avantej-core/db/schema/tenant/_status-history-columns";

type TenantDb = NeonDatabase<typeof tenantSchema>;
// Drizzle transaction context — shape is structurally compatible with TenantDb
// for `.insert(...).values(...)` calls used here.
// biome-ignore lint/suspicious/noExplicitAny: tx type is internal to Drizzle
type TxOrDb = TenantDb | any;

export type StatusHistoryEntry = {
	fromStatus: string | null;
	toStatus: string;
	changedBy: string;
	reason?: string | null;
	notes?: string | null;
};

/** Append a sales_order_status_history row in the supplied tx/connection. */
export async function appendSalesOrderStatusHistory(
	tx: TxOrDb,
	salesOrderId: string,
	entry: StatusHistoryEntry,
): Promise<void> {
	await tx.insert(salesOrderStatusHistory).values({
		salesOrderId,
		fromStatus: entry.fromStatus,
		toStatus: entry.toStatus,
		changedBy: entry.changedBy,
		reason: entry.reason ?? null,
		notes: entry.notes ?? null,
	});
}

/** Append a payment_status_history row in the supplied tx/connection. */
export async function appendPaymentStatusHistory(
	tx: TxOrDb,
	paymentId: string,
	entry: StatusHistoryEntry,
): Promise<void> {
	await tx.insert(paymentStatusHistory).values({
		paymentId,
		fromStatus: entry.fromStatus,
		toStatus: entry.toStatus,
		changedBy: entry.changedBy,
		reason: entry.reason ?? null,
		notes: entry.notes ?? null,
	});
}

/** Append a package_instance_status_history row in the supplied tx/connection. */
export async function appendPackageInstanceStatusHistory(
	tx: TxOrDb,
	packageInstanceId: string,
	entry: StatusHistoryEntry,
): Promise<void> {
	await tx.insert(packageInstanceStatusHistory).values({
		packageInstanceId,
		fromStatus: entry.fromStatus,
		toStatus: entry.toStatus,
		changedBy: entry.changedBy,
		reason: entry.reason ?? null,
		notes: entry.notes ?? null,
	});
}

/** Append an appointment_status_history row in the supplied tx/connection. */
export async function appendAppointmentStatusHistory(
	tx: TxOrDb,
	appointmentId: string,
	entry: StatusHistoryEntry,
): Promise<void> {
	await tx.insert(appointmentStatusHistory).values({
		appointmentId,
		fromStatus: entry.fromStatus,
		toStatus: entry.toStatus,
		changedBy: entry.changedBy,
		reason: entry.reason ?? null,
		notes: entry.notes ?? null,
	});
}
