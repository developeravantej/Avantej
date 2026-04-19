"use client";

import { Link, useLocation } from "@tanstack/react-router";
import {
	BadgeCheck,
	BadgeDollarSign,
	Bell,
	BookUser,
	Briefcase,
	Building2,
	Calendar,
	ChevronDown,
	ChevronRight,
	ClipboardCheck,
	Cog,
	CreditCard,
	DollarSign,
	DoorOpen,
	Eye,
	FileChartColumnIncreasing,
	Home,
	LogOut,
	Mail,
	Map,
	Megaphone,
	Package,
	PackageSearch,
	Percent,
	Plus,
	Receipt,
	ScrollText,
	Search,
	Settings,
	Shield,
	ShoppingCart,
	Store,
	Tag,
	TrendingUp,
	Undo2,
	User,
	UserPlus,
	Users,
	Wallet,
	Warehouse,
} from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarRail,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useUserContext } from "@/hooks/useUserContext";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SidebarNavItem = {
	title: string;
	url: string;
	icon: React.ComponentType<{ className?: string }>;
	permission?: string;
	items?: Array<{
		title: string;
		url: string;
		icon: React.ComponentType<{ className?: string }>;
		permission?: string;
	}>;
};

export type SidebarNavGroup = {
	label: string;
	items: SidebarNavItem[];
};

// ─── Navigation Structure ─────────────────────────────────────────────────────

const NAV_GROUPS: SidebarNavGroup[] = [
	{
		label: "Main",
		items: [
			{ title: "Home", url: "/dashboard", icon: Home },
			{
				title: "Trainers",
				url: "/dashboard/trainers/view",
				icon: Users,
				permission: "user_management:read",
			},
		],
	},
	{
		label: "Business",
		items: [
			{
				title: "Branches",
				url: "/dashboard/branch/view",
				icon: Store,
				items: [
					{ title: "View Branches", url: "/dashboard/branch/view", icon: Eye },
					{
						title: "Create Branch",
						url: "/dashboard/branch/create",
						icon: Plus,
						permission: "hierarchy_management:create",
					},
				],
			},
			{
				title: "Services",
				url: "/dashboard/service/view",
				icon: PackageSearch,
				items: [
					{
						title: "Service Categories",
						url: "/dashboard/service-category/view",
						icon: Tag,
					},
					{
						title: "View Services",
						url: "/dashboard/service/view",
						icon: PackageSearch,
					},
				],
			},
			{
				title: "Appointments",
				url: "/dashboard/appointment/view",
				icon: Calendar,
				items: [
					{
						title: "Appointments",
						url: "/dashboard/appointment/view",
						icon: Calendar,
						permission: "appointment_management:read",
					},
					{
						title: "Class Slots",
						url: "/dashboard/appointment/class-slots/view",
						icon: Calendar,
						permission: "appointment_management:read",
					},
					{
						title: "Rooms",
						url: "/dashboard/rooms/view",
						icon: DoorOpen,
						permission: "appointment_management:read",
					},
					{
						title: "Package Instances",
						url: "/dashboard/packages/instances/view",
						icon: Package,
						permission: "service_management:read",
					},
					{
						title: "Installments",
						url: "/dashboard/packages/installments/view",
						icon: CreditCard,
						permission: "service_management:read",
					},
					{
						title: "Memberships",
						url: "/dashboard/memberships/view",
						icon: BadgeCheck,
						permission: "service_management:read",
					},
				],
			},
			{
				title: "Customers",
				url: "/dashboard/customers/view",
				icon: BookUser,
				items: [
					{
						title: "Registered",
						url: "/dashboard/customers/view",
						icon: Users,
						permission: "customer_management:read",
					},
					{
						title: "Walk-in Customers",
						url: "/dashboard/customers/walk-in/view",
						icon: BookUser,
						permission: "walk_in_customer_management:read",
					},
				],
			},
		],
	},
	{
		label: "Sales & Inventory",
		items: [
			{
				title: "Sales",
				url: "/dashboard/sales/view",
				icon: BadgeDollarSign,
				items: [
					{
						title: "Sales",
						url: "/dashboard/sales/view",
						icon: BadgeDollarSign,
					},
					{
						title: "Payment",
						url: "/dashboard/payment/view",
						icon: DollarSign,
					},
					{
						title: "Cancelled Sales",
						url: "/dashboard/cancelled-sales/view",
						icon: BadgeDollarSign,
					},
					{
						title: "Promotions",
						url: "/dashboard/promotions/view",
						icon: Percent,
					},
					{
						title: "Purchase Orders",
						url: "/dashboard/purchase-orders/view",
						icon: ShoppingCart,
					},
				],
			},
			{
				title: "Inventory",
				url: "/dashboard/inventory-options",
				icon: Warehouse,
				items: [
					{ title: "Products", url: "/dashboard/products/view", icon: Package },
					{
						title: "Inventory Options",
						url: "/dashboard/inventory-options",
						icon: Warehouse,
					},
					{ title: "Brands", url: "/dashboard/brands/view", icon: Tag },
					{ title: "Categories", url: "/dashboard/categories/view", icon: Tag },
					{ title: "Suppliers", url: "/dashboard/suppliers/view", icon: Store },
					{
						title: "Unit of Measure",
						url: "/dashboard/uom/view",
						icon: Package,
					},
					{
						title: "UoM Conversions",
						url: "/dashboard/uom-conversions/view",
						icon: Package,
					},
					{
						title: "Stock Requests",
						url: "/dashboard/stock-requests/view",
						icon: ShoppingCart,
					},
					{
						title: "Transfer Orders",
						url: "/dashboard/transfer-orders/view",
						icon: ShoppingCart,
					},
				],
			},
		],
	},
	{
		label: "Finance",
		items: [
			{
				title: "Finance",
				url: "/dashboard/expenses/view",
				icon: Wallet,
				items: [
					{ title: "Expenses", url: "/dashboard/expenses/view", icon: Receipt },
					{
						title: "Payouts",
						url: "/dashboard/payouts/view",
						icon: DollarSign,
					},
					{
						title: "Refunds",
						url: "/dashboard/refunds/view",
						icon: Undo2,
						permission: "refund_management:read",
					},
					{
						title: "Commissions",
						url: "/dashboard/commissions/view",
						icon: TrendingUp,
						permission: "commission_management:read",
					},
				],
			},
		],
	},
	{
		label: "Operations",
		items: [
			{
				title: "Attendance",
				url: "/dashboard/attendance/view",
				icon: ClipboardCheck,
				permission: "attendance_management:read",
			},
			{
				title: "Audit Log",
				url: "/dashboard/audit/view",
				icon: ScrollText,
				permission: "audit_log:read",
			},
		],
	},
	{
		label: "People",
		items: [
			{
				title: "Access Control",
				url: "/dashboard/access-control/user-assignment",
				icon: Shield,
				items: [
					{
						title: "Role Management",
						url: "/dashboard/access-control/roles",
						icon: Shield,
						permission: "role_management:read",
					},
					{
						title: "Permissions",
						url: "/dashboard/access-control/permissions",
						icon: Settings,
						permission: "role_management:read",
					},
					{
						title: "User Assignment",
						url: "/dashboard/access-control/user-assignment",
						icon: UserPlus,
						permission: "user_management:read",
					},
					{
						title: "Invitations",
						url: "/dashboard/access-control/invitations",
						icon: Mail,
						permission: "user_management:read",
					},
				],
			},
			{
				title: "User",
				url: "/dashboard/user/view",
				icon: Users,
				items: [
					{ title: "User Roles", url: "/dashboard/role/view", icon: Shield },
					{
						title: "Employees Listing",
						url: "/dashboard/user/view",
						icon: Users,
					},
				],
			},
			{
				title: "Communications",
				url: "/dashboard/announcements/view",
				icon: Megaphone,
				items: [
					{
						title: "Announcements",
						url: "/dashboard/announcements/view",
						icon: Megaphone,
					},
					{
						title: "Notifications",
						url: "/dashboard/notifications/view",
						icon: Bell,
					},
				],
			},
		],
	},
	{
		label: "Settings",
		items: [
			{
				title: "Config",
				url: "/dashboard/settings/tax-rates",
				icon: Cog,
				items: [
					{
						title: "Tax Rates",
						url: "/dashboard/settings/tax-rates",
						icon: Tag,
					},
					{
						title: "Installment Plans",
						url: "/dashboard/settings/installment-plans",
						icon: CreditCard,
					},
					{
						title: "Google Calendar",
						url: "/dashboard/settings/google-calendar",
						icon: Calendar,
					},
				],
			},
			{
				title: "Reports",
				url: "/dashboard/sales/view",
				icon: FileChartColumnIncreasing,
			},
			{ title: "GHL Integration", url: "/go-highlevel-integration", icon: Map },
		],
	},
];

// ─── SidebarUserFooter ────────────────────────────────────────────────────────

function SidebarUserFooter() {
	const { data: session } = authClient.useSession();
	const { logout } = useAuth();
	const [loggingOut, setLoggingOut] = useState(false);

	const sessionUser = session?.user as any;
	const displayName =
		`${sessionUser?.firstName || ""} ${sessionUser?.lastName || ""}`.trim() ||
		sessionUser?.name ||
		"Unknown";
	const email = sessionUser?.email ?? "";
	const initial = displayName.charAt(0).toUpperCase();

	const handleLogout = async () => {
		setLoggingOut(true);
		try {
			await logout();
			toast.success("Logged out successfully");
		} catch {
			toast.error("Logout failed");
		} finally {
			setLoggingOut(false);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
				>
					{/* Avatar */}
					<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-secondary-2 font-semibold text-sm text-white">
						{initial}
					</span>

					{/* Name + email — hidden when collapsed */}
					<span className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
						<span className="truncate font-medium text-sm leading-tight">
							{displayName}
						</span>
						<span className="truncate text-sidebar-foreground/60 text-xs leading-tight">
							{email}
						</span>
					</span>

					<ChevronRight className="size-4 shrink-0 text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden" />
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent side="top" align="start" className="w-56">
				<DropdownMenuItem asChild>
					<Link to="/dashboard" className="flex items-center gap-2">
						<User className="size-4" />
						<span>Profile</span>
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link
						to="/dashboard/settings/tax-rates"
						className="flex items-center gap-2"
					>
						<Settings className="size-4" />
						<span>Settings</span>
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={handleLogout}
					disabled={loggingOut}
					className="flex items-center gap-2 text-destructive focus:text-destructive"
				>
					<LogOut className="size-4" />
					<span>{loggingOut ? "Logging out..." : "Logout"}</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// ─── NavGroup ─────────────────────────────────────────────────────────────────

function NavGroup({ group }: { group: SidebarNavGroup }) {
	const location = useLocation();
	const pathname = location.pathname;
	const { hasPermission } = useUserContext();

	// Filter top-level items and their sub-items based on permissions
	const visibleItems = group.items
		.filter((item) => {
			if (!item.permission) return true;
			return hasPermission(item.permission);
		})
		.map((item) => {
			if (!item.items || item.items.length === 0) return item;
			const visibleSubItems = item.items.filter((sub) => {
				if (!sub.permission) return true;
				return hasPermission(sub.permission);
			});
			// If all sub-items are permission-gated and none are visible, hide the parent
			if (visibleSubItems.length === 0 && item.items.length > 0) return null;
			return { ...item, items: visibleSubItems };
		})
		.filter((item): item is SidebarNavItem => item !== null);

	if (visibleItems.length === 0) return null;

	return (
		<SidebarGroup className="py-1">
			<SidebarGroupLabel className="font-bold text-[10px] text-brand-secondary-1 uppercase tracking-widest group-data-[collapsible=icon]:hidden">
				{group.label}
			</SidebarGroupLabel>

			<SidebarGroupContent>
				<SidebarMenu>
					{visibleItems.map((item) => {
						if (item.items && item.items.length > 0) {
							// Collapsible group item
							const isGroupActive = item.items.some((sub) =>
								pathname.startsWith(sub.url),
							);

							return (
								<CollapsibleNavItem
									key={item.title}
									item={item}
									isGroupActive={isGroupActive}
									pathname={pathname}
								/>
							);
						}

						const isActive =
							item.url === "/dashboard"
								? pathname === "/dashboard"
								: pathname.startsWith(item.url);

						return (
							<SidebarMenuItem key={item.title}>
								<SidebarMenuButton
									asChild
									isActive={isActive}
									tooltip={item.title}
								>
									<Link to={item.url}>
										<item.icon className="size-4" />
										<span>{item.title}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						);
					})}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

// ─── CollapsibleNavItem ───────────────────────────────────────────────────────

function CollapsibleNavItem({
	item,
	isGroupActive,
	pathname,
}: {
	item: SidebarNavItem;
	isGroupActive: boolean;
	pathname: string;
}) {
	const [open, setOpen] = useState(isGroupActive);

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="group/collapsible"
		>
			<SidebarMenuItem>
				<CollapsibleTrigger asChild>
					<SidebarMenuButton isActive={isGroupActive} tooltip={item.title}>
						<item.icon className="size-4" />
						<span>{item.title}</span>
						<ChevronDown
							className={cn(
								"ml-auto size-4 shrink-0 transition-transform duration-200",
								open && "rotate-180",
							)}
						/>
					</SidebarMenuButton>
				</CollapsibleTrigger>

				<CollapsibleContent>
					<SidebarMenuSub>
						{item.items?.map((sub) => {
							const isActive = pathname.startsWith(sub.url);
							return (
								<SidebarMenuSubItem key={sub.title}>
									<SidebarMenuSubButton asChild isActive={isActive}>
										<Link to={sub.url}>
											<sub.icon className="size-4" />
											<span>{sub.title}</span>
										</Link>
									</SidebarMenuSubButton>
								</SidebarMenuSubItem>
							);
						})}
					</SidebarMenuSub>
				</CollapsibleContent>
			</SidebarMenuItem>
		</Collapsible>
	);
}

// ─── AppSidebar ───────────────────────────────────────────────────────────────

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const { data: session } = authClient.useSession();
	const { data: userContext, hasRole } = useUserContext(!!session?.user);
	const isStaffOrTrainer = hasRole(["trainer", "staff"]);
	const location = useLocation();
	const pathname = location.pathname;

	const currentOrg = userContext?.organizations.find(
		(o) => o.id === userContext.currentOrganizationId,
	);

	return (
		<Sidebar collapsible="icon" {...props}>
			{/* ── Header ── */}
			<SidebarHeader>
				<div className="flex items-center gap-2 px-2">
					<img
						alt="Logo"
						className="h-8 w-auto group-data-[collapsible=icon]:hidden"
						src="/logo_only.png"
					/>
					<div className="flex flex-col leading-none group-data-[collapsible=icon]:hidden">
						<span className="font-bold font-heading text-2xl leading-none">
							avantej
						</span>
						<span className="-mt-1 font-bold font-heading text-2xl leading-none">
							core
						</span>
					</div>
					<div className="ml-auto" />
					<SidebarTrigger className="pr-2" />
				</div>

				{/* Current organization */}
				{currentOrg && (
					<div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:hidden">
						<Building2 className="size-4 shrink-0 text-brand-secondary-1" />
						<span className="truncate text-brand-secondary-1 text-sm">
							{currentOrg.name}
						</span>
					</div>
				)}

				{/* Search bar */}
				<div className="relative px-2 group-data-[collapsible=icon]:hidden">
					<Search className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-brand-secondary-1" />
					<input
						type="text"
						placeholder="Power Search..."
						className={cn(
							"w-full rounded-xl border border-brand-secondary-3 bg-card py-2 pr-3 pl-9 text-sm",
							"placeholder:text-brand-secondary-1",
							"focus:outline-none focus:ring-2 focus:ring-brand-primary-1/20",
							"transition-colors",
						)}
					/>
				</div>
			</SidebarHeader>

			{/* ── Content ── */}
			<SidebarContent className="overflow-y-auto [&::-webkit-scrollbar]:hidden">
				{NAV_GROUPS.map((group) => (
					<NavGroup key={group.label} group={group} />
				))}
				{isStaffOrTrainer && (
					<SidebarGroup className="py-1">
						<SidebarGroupLabel className="font-bold text-[10px] text-brand-secondary-1 uppercase tracking-widest group-data-[collapsible=icon]:hidden">
							My Work
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								<SidebarMenuItem>
									<SidebarMenuButton
										asChild
										isActive={pathname.startsWith("/dashboard/my-services")}
										tooltip="My Services"
									>
										<Link to="/dashboard/my-services/view">
											<Briefcase className="size-4" />
											<span>My Services</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}
			</SidebarContent>

			{/* ── Footer ── */}
			<SidebarFooter>{session?.user && <SidebarUserFooter />}</SidebarFooter>

			<SidebarRail />
		</Sidebar>
	);
}
