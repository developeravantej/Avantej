/**
 * WS7 — the export dataset catalogue. Each spec runs a branch-scoped query and
 * projects the useful columns as CSV cells. Money stays in the source unit the
 * column already uses (cents) — the codec emits String(n); the header names the
 * unit. Cross-DB customer names are intentionally NOT enriched here (keeps the
 * export a single tenant-DB pass); ids/snapshots are exported as-is.
 */

import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { checkIns } from "@avantej-core/db/schema/tenant/check-ins";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { expenses } from "@avantej-core/db/schema/tenant/expenses";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { members } from "@avantej-core/db/schema/tenant/members";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import { refunds } from "@avantej-core/db/schema/tenant/refunds";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { services } from "@avantej-core/db/schema/tenant/services";
import { walkInCustomers } from "@avantej-core/db/schema/tenant/walk-in-customers";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { DatasetSpec, TenantDb } from "./types";

/**
 * Hard row cap per dataset. Prevents a large tenant from materializing an
 * unbounded scan into memory (Worker 128MB limit). The engine fetches CAP+1,
 * detects truncation, and surfaces it — no silent cap. Mirrors WS2 reports.
 */
export const EXPORT_MAX_ROWS = 50_000;
const FETCH_LIMIT = EXPORT_MAX_ROWS + 1;

/** inArray filter, or undefined when unscoped (admin/org-wide). */
function branchFilter(
	col: Parameters<typeof inArray>[0],
	branchIds: string[] | null,
) {
	return branchIds ? inArray(col, branchIds) : undefined;
}

// ---------------------------------------------------------------------------
// Direct branch_id datasets
// ---------------------------------------------------------------------------

const salesOrdersDataset: DatasetSpec = {
	entity: "sales_orders",
	label: "Sales orders",
	description: "One row per sales order (POS + standalone).",
	headers: [
		"Order #",
		"Date",
		"Customer",
		"Type",
		"Status",
		"Total (pre-tax cents)",
		"Refund Status",
		"Refunded (cents)",
		"Complimentary",
		"Branch",
		"Created At",
	],
	async rows(tenantDb, branchIds) {
		const rows = await tenantDb
			.select()
			.from(salesOrders)
			.where(branchFilter(salesOrders.branchId, branchIds))
			.limit(FETCH_LIMIT);
		return rows.map((r) => [
			r.salesOrderNumber,
			r.date,
			r.customerName,
			r.customerType,
			r.status,
			r.totalAmount,
			r.refundStatus,
			r.refundedAmountCents,
			r.isComplimentary,
			r.branchId,
			r.createdAt,
		]);
	},
};

const appointmentsDataset: DatasetSpec = {
	entity: "appointments",
	label: "Appointments",
	description: "One row per appointment (all statuses).",
	headers: [
		"Booking #",
		"Start",
		"End",
		"Type",
		"Status",
		"Service",
		"Trainer",
		"Customer",
		"Session Total (cents)",
		"Currency",
		"Branch",
		"Created At",
	],
	async rows(tenantDb, branchIds) {
		const rows = await tenantDb
			.select()
			.from(appointments)
			.where(branchFilter(appointments.branchId, branchIds))
			.limit(FETCH_LIMIT);
		return rows.map((r) => [
			r.bookingNumber,
			r.startTime,
			r.endTime,
			r.type,
			r.status,
			r.serviceId,
			r.trainerId,
			r.customerName,
			r.sessionTotal,
			r.currency,
			r.branchId,
			r.createdAt,
		]);
	},
};

const expensesDataset: DatasetSpec = {
	entity: "expenses",
	label: "Expenses",
	description: "One row per expense.",
	headers: [
		"Date",
		"Category",
		"Description",
		"Amount (cents)",
		"Currency",
		"Status",
		"Submitted By",
		"Approved By",
		"Branch",
		"Created At",
	],
	async rows(tenantDb, branchIds) {
		const rows = await tenantDb
			.select()
			.from(expenses)
			.where(branchFilter(expenses.branchId, branchIds))
			.limit(FETCH_LIMIT);
		return rows.map((r) => [
			r.expenseDate,
			r.category,
			r.description,
			r.amount,
			r.currency,
			r.status,
			r.submittedBy,
			r.approvedBy,
			r.branchId,
			r.createdAt,
		]);
	},
};

const walkInCustomersDataset: DatasetSpec = {
	entity: "walk_in_customers",
	label: "Walk-in customers",
	description: "One row per walk-in customer.",
	headers: [
		"Name",
		"Email",
		"Phone",
		"Gender",
		"Converted At",
		"Active",
		"Branch",
		"Created At",
	],
	async rows(tenantDb, branchIds) {
		const rows = await tenantDb
			.select()
			.from(walkInCustomers)
			.where(branchFilter(walkInCustomers.branchId, branchIds))
			.limit(FETCH_LIMIT);
		return rows.map((r) => [
			r.name,
			r.email,
			r.phone,
			r.gender,
			r.convertedAt,
			r.isActive,
			r.branchId,
			r.createdAt,
		]);
	},
};

const servicesDataset: DatasetSpec = {
	entity: "services",
	label: "Services catalogue",
	description:
		"One row per service. Org-wide services (no branch) are included when unscoped.",
	headers: [
		"Name",
		"Type",
		"Duration",
		"Price (cents)",
		"Taxable",
		"Sessions",
		"Expirable",
		"Expiry Days",
		"Active",
		"Branch",
		"Created At",
	],
	async rows(tenantDb, branchIds) {
		// services.branchId is nullable (org-wide). When scoped, org-wide services
		// (null branch) are shown too — they are part of every branch's catalogue.
		const scope = branchIds
			? or(
					inArray(services.branchId, branchIds),
					sql`${services.branchId} IS NULL`,
				)
			: undefined;
		const rows = await tenantDb
			.select()
			.from(services)
			.where(scope)
			.limit(FETCH_LIMIT);
		return rows.map((r) => [
			r.name,
			r.type,
			r.duration,
			r.price,
			r.taxable,
			r.sessionCount,
			r.expirable,
			r.expiryDays,
			r.isActive,
			r.branchId,
			r.createdAt,
		]);
	},
};

const refundsDataset: DatasetSpec = {
	entity: "refunds",
	label: "Refunds",
	description: "One row per refund.",
	headers: [
		"Refund #",
		"Status",
		"Amount (cents)",
		"Tax (cents)",
		"Method",
		"Reason",
		"Customer",
		"Requested At",
		"Processed At",
		"Branch",
	],
	async rows(tenantDb, branchIds) {
		const rows = await tenantDb
			.select()
			.from(refunds)
			.where(branchFilter(refunds.branchId, branchIds))
			.limit(FETCH_LIMIT);
		return rows.map((r) => [
			r.refundNumber,
			r.status,
			r.amountCents,
			r.taxAmountCents,
			r.refundMethod,
			r.reason,
			r.customerName,
			r.requestedAt,
			r.processedAt,
			r.branchId,
		]);
	},
};

const checkInsDataset: DatasetSpec = {
	entity: "check_ins",
	label: "Check-ins",
	description: "One row per check-in.",
	headers: [
		"Checked In At",
		"Client Type",
		"Client",
		"Source",
		"Outcome",
		"Credits Consumed",
		"Checked In By",
		"Branch",
	],
	async rows(tenantDb, branchIds) {
		const rows = await tenantDb
			.select()
			.from(checkIns)
			.where(branchFilter(checkIns.branchId, branchIds))
			.limit(FETCH_LIMIT);
		return rows.map((r) => [
			r.checkedInAt,
			r.clientType,
			r.clientDisplayName,
			r.source,
			r.outcome,
			r.creditsConsumed,
			r.checkedInBy,
			r.branchId,
		]);
	},
};

// ---------------------------------------------------------------------------
// Member-scoped datasets (members.hierarchy_scope_id = home node)
// ---------------------------------------------------------------------------

const membersDataset: DatasetSpec = {
	entity: "members",
	label: "Members (staff & clients)",
	description: "One row per org member. Scoped by the member's home branch.",
	headers: [
		"User ID",
		"Role",
		"Status",
		"Home Node",
		"Joined At",
		"Trainer Tier",
		"Deleted At",
	],
	async rows(tenantDb, branchIds) {
		const rows = await tenantDb
			.select()
			.from(members)
			.where(branchFilter(members.hierarchyScopeId, branchIds))
			.limit(FETCH_LIMIT);
		return rows.map((r) => [
			r.userId,
			r.role,
			r.status,
			r.hierarchyScopeId,
			r.joinedAt,
			r.trainerTierId,
			r.deletedAt,
		]);
	},
};

const customerProfilesDataset: DatasetSpec = {
	entity: "customer_profiles",
	label: "Customer profiles",
	description:
		"One row per (non-deleted) customer profile, scoped by their member home branch.",
	headers: [
		"User ID",
		"Phone",
		"Gender",
		"Credit Points",
		"Primary Staff",
		"Unclaimed",
		"Created At",
	],
	async rows(tenantDb, branchIds) {
		const m = alias(members, "cp_member");
		const scope = branchIds
			? and(
					eq(customerProfiles.isDeleted, false),
					inArray(m.hierarchyScopeId, branchIds),
				)
			: eq(customerProfiles.isDeleted, false);
		const rows = await tenantDb
			.select({ p: customerProfiles })
			.from(customerProfiles)
			.leftJoin(m, eq(m.userId, customerProfiles.userId))
			.where(scope)
			.limit(FETCH_LIMIT);
		return rows.map(({ p }) => [
			p.userId,
			p.phone,
			p.gender,
			p.creditPoints,
			p.primaryStaffMemberId,
			p.isUnclaimed,
			p.createdAt,
		]);
	},
};

// ---------------------------------------------------------------------------
// Indirect-branch datasets (join to the branch-bearing parent)
// ---------------------------------------------------------------------------

const invoicesDataset: DatasetSpec = {
	entity: "invoices",
	label: "Invoices",
	description:
		"One row per invoice, scoped via the linked sales order's branch.",
	headers: [
		"Invoice #",
		"Date",
		"Due Date",
		"Customer",
		"Total (cents)",
		"Amount Paid (cents)",
		"Status",
		"Payment Mode",
		"Branch",
	],
	async rows(tenantDb, branchIds) {
		const so = alias(salesOrders, "inv_so");
		const base = tenantDb
			.select({ i: invoices, branchId: so.branchId })
			.from(invoices)
			.leftJoin(so, eq(invoices.salesOrderId, so.id));
		// Scoped: only invoices whose sales order is in scope (orphan invoices
		// have no branch → hidden, fail closed).
		const rows = await (branchIds
			? base.where(inArray(so.branchId, branchIds))
			: base
		).limit(FETCH_LIMIT);
		return rows.map(({ i, branchId }) => [
			i.invoiceNumber,
			i.date,
			i.dueDate,
			i.customerName,
			i.totalAmount,
			i.amountPaid,
			i.status,
			i.paymentMode,
			branchId,
		]);
	},
};

const installmentsDataset: DatasetSpec = {
	entity: "installments",
	label: "Installments",
	description:
		"One row per installment. Exports the installment amount (not full package price).",
	headers: [
		"Package Instance",
		"Installment #",
		"Amount (cents)",
		"Tax (cents)",
		"Amount Paid (cents)",
		"Status",
		"Due Date",
		"Paid At",
		"Method",
		"Branch",
	],
	async rows(tenantDb, branchIds) {
		const pi = alias(packageInstances, "ins_pi");
		const soDirect = alias(salesOrders, "ins_so");
		const soPkg = alias(salesOrders, "ins_so2");
		const branchExpr = sql<
			string | null
		>`coalesce(${soDirect.branchId}, ${soPkg.branchId})`;
		const base = tenantDb
			.select({ i: installments, branchId: branchExpr })
			.from(installments)
			.leftJoin(pi, eq(installments.packageInstanceId, pi.id))
			.leftJoin(soDirect, eq(installments.salesOrderId, soDirect.id))
			.leftJoin(soPkg, eq(pi.salesOrderId, soPkg.id));
		const rows = await (branchIds
			? base.where(inArray(branchExpr, branchIds))
			: base
		).limit(FETCH_LIMIT);
		return rows.map(({ i, branchId }) => [
			i.packageInstanceId,
			i.installmentNumber,
			i.amount,
			i.taxAmount,
			i.amountPaid,
			i.status,
			i.dueDate,
			i.paidAt,
			i.paymentMethod,
			branchId,
		]);
	},
};

const packageInstancesDataset: DatasetSpec = {
	entity: "package_instances",
	label: "Packages sold",
	description:
		"One row per package instance, scoped via its sales order's branch.",
	headers: [
		"Purchase #",
		"Service",
		"Customer",
		"Source",
		"Total (cents)",
		"Payment Status",
		"Credits Total",
		"Credits Remaining",
		"Starts At",
		"Expires At",
		"Status",
		"Branch",
	],
	async rows(tenantDb, branchIds) {
		const so = alias(salesOrders, "pkg_so");
		const base = tenantDb
			.select({ p: packageInstances, branchId: so.branchId })
			.from(packageInstances)
			.leftJoin(so, eq(packageInstances.salesOrderId, so.id));
		const rows = await (branchIds
			? base.where(inArray(so.branchId, branchIds))
			: base
		).limit(FETCH_LIMIT);
		return rows.map(({ p, branchId }) => [
			p.purchaseNumber,
			p.serviceId,
			p.customerName,
			p.source,
			p.totalPrice,
			p.paymentStatus,
			p.creditsTotal,
			p.creditsRemaining,
			p.startsAt,
			p.expiresAt,
			p.status,
			branchId,
		]);
	},
};

const paymentsDataset: DatasetSpec = {
	entity: "payments",
	label: "Payments",
	description:
		"One succeeded/recorded payment per row, scoped via invoice/appointment/package branch.",
	headers: [
		"Payment #",
		"Amount (cents)",
		"Tax (cents)",
		"Total (cents)",
		"Currency",
		"Method",
		"Status",
		"Created At",
		"Branch",
	],
	async rows(tenantDb, branchIds) {
		const inv = alias(invoices, "pay_inv");
		const so1 = alias(salesOrders, "pay_so1");
		const ap = alias(appointments, "pay_ap");
		const pi = alias(packageInstances, "pay_pi");
		const so2 = alias(salesOrders, "pay_so2");
		const branchAgg = sql<
			string | null
		>`min(coalesce(${so1.branchId}, ${ap.branchId}, ${so2.branchId}))`;
		const base = tenantDb
			.select({
				paymentNumber: payments.paymentNumber,
				amount: payments.amount,
				taxAmount: payments.taxAmount,
				totalAmount: payments.totalAmount,
				currency: payments.currency,
				paymentMethod: payments.paymentMethod,
				status: payments.status,
				createdAt: payments.createdAt,
				branchId: branchAgg,
			})
			.from(payments)
			.leftJoin(inv, eq(inv.paymentId, payments.id))
			.leftJoin(so1, eq(inv.salesOrderId, so1.id))
			.leftJoin(ap, eq(payments.appointmentId, ap.id))
			.leftJoin(pi, eq(pi.paymentId, payments.id))
			.leftJoin(so2, eq(pi.salesOrderId, so2.id))
			.groupBy(payments.id);
		const rows = await (branchIds
			? base.having(inArray(branchAgg, branchIds))
			: base
		).limit(FETCH_LIMIT);
		return rows.map((r) => [
			r.paymentNumber,
			r.amount,
			r.taxAmount,
			r.totalAmount,
			r.currency,
			r.paymentMethod,
			r.status,
			r.createdAt,
			r.branchId,
		]);
	},
};

const commissionSplitsDataset: DatasetSpec = {
	entity: "commission_splits",
	label: "Commission splits",
	description:
		"One commission split per row, scoped via its appointment/sales-order branch.",
	headers: [
		"Staff",
		"Amount (cents)",
		"Currency",
		"Status",
		"Role",
		"Split Type",
		"Earned At",
		"Paid At",
		"Branch",
	],
	async rows(tenantDb, branchIds) {
		const ap = alias(appointments, "cs_ap");
		const so = alias(salesOrders, "cs_so");
		const branchExpr = sql<
			string | null
		>`coalesce(${ap.branchId}, ${so.branchId})`;
		const base = tenantDb
			.select({ c: commissionSplits, branchId: branchExpr })
			.from(commissionSplits)
			.leftJoin(ap, eq(ap.id, commissionSplits.appointmentId))
			.leftJoin(so, eq(so.id, commissionSplits.salesOrderId));
		const rows = await (branchIds
			? base.where(inArray(branchExpr, branchIds))
			: base
		).limit(FETCH_LIMIT);
		return rows.map(({ c, branchId }) => [
			c.staffId,
			c.calculatedAmount,
			c.currency,
			c.status,
			c.roleType,
			c.splitType,
			c.earnedAt,
			c.paidAt,
			branchId,
		]);
	},
};

export const EXPORT_DATASETS: Record<string, DatasetSpec> = {
	sales_orders: salesOrdersDataset,
	payments: paymentsDataset,
	invoices: invoicesDataset,
	package_instances: packageInstancesDataset,
	installments: installmentsDataset,
	commission_splits: commissionSplitsDataset,
	appointments: appointmentsDataset,
	members: membersDataset,
	customer_profiles: customerProfilesDataset,
	walk_in_customers: walkInCustomersDataset,
	services: servicesDataset,
	expenses: expensesDataset,
	refunds: refundsDataset,
	check_ins: checkInsDataset,
};

export type { TenantDb };
