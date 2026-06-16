import {
	BadgeDollarSign,
	CalendarClock,
	CalendarRange,
	RefreshCw,
	ShoppingCart,
	Undo2,
	UserPlus,
	Users,
} from "lucide-react";
import type * as React from "react";

export type LaunchpadCardId =
	| "new-sale"
	| "new-customer"
	| "customers"
	| "renewals"
	| "installments"
	| "refunds"
	| "payouts"
	| "schedule";

export type LaunchpadCard = {
	id: LaunchpadCardId;
	label: string;
	sub: string;
	icon: React.ComponentType<{ className?: string }>;
	/** Permission required to see this card; omit for "always visible". */
	permission?: string;
};

/**
 * Daily-task cards rendered in the left rail of the Dashboard launchpad.
 * Order = priority for front-desk staff (sell first, then look things up).
 */
export const LAUNCHPAD_CARDS: LaunchpadCard[] = [
	{
		id: "new-sale",
		label: "New Sale",
		sub: "POS · package / service",
		icon: ShoppingCart,
		permission: "pos:create",
	},
	{
		id: "new-customer",
		label: "Create Customer",
		sub: "Register a member",
		icon: UserPlus,
		// Mirrors the server guard on customerProfiles.createUnclaimed.
		permission: "user_management:create",
	},
	{
		id: "customers",
		label: "View Customers",
		sub: "Search & manage",
		icon: Users,
		permission: "customer_management:read",
	},
	{
		id: "renewals",
		label: "Renewals / Expiring",
		sub: "Members expiring soon",
		icon: RefreshCw,
		// Mirrors MembershipsPage + packageInstances.listMemberships, which both
		// require service_management:read (the expiring-count badge uses the
		// reports:read-gated listExpiring — visible only with that permission).
		permission: "service_management:read",
	},
	{
		id: "installments",
		label: "Installments",
		sub: "Upcoming & status",
		icon: CalendarClock,
		// Mirrors the badge query + PackageInstallmentsPage + server listUpcoming,
		// which all require service_management:read (not package_management).
		permission: "service_management:read",
	},
	{
		id: "refunds",
		label: "Refunds & Cancellations",
		sub: "Review & process",
		icon: Undo2,
		// Refund list + approve/reject; the Cancellations view inside the panel
		// is separately gated on sales:read.
		permission: "refund_management:read",
	},
	{
		id: "payouts",
		label: "Commission Payout",
		sub: "Trainer earnings",
		icon: BadgeDollarSign,
		permission: "commission_payout:read",
	},
	{
		id: "schedule",
		label: "Trainer Schedule",
		sub: "Today's sessions",
		icon: CalendarRange,
		permission: "appointment_management:read",
	},
];
