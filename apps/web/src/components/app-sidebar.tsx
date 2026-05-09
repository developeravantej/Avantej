"use client";

import { Link, useLocation } from "@tanstack/react-router";
import {
	ArrowLeftRight,
	BadgeDollarSign,
	Bell,
	Briefcase,
	Building2,
	Calendar,
	CalendarRange,
	ChevronRight,
	ClipboardCheck,
	ClipboardList,
	CreditCard,
	DollarSign,
	FileChartColumnIncreasing,
	Grid3x3,
	Home,
	LogOut,
	Map,
	Megaphone,
	Package,
	PackageSearch,
	Receipt,
	Ruler,
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
	Warehouse,
} from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
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
	SidebarRail,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformAdminRole } from "@/hooks/usePlatformAdminRole";
import { useUserContext } from "@/hooks/useUserContext";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SidebarNavItem = {
	title: string;
	url: string;
	icon: React.ComponentType<{ className?: string }>;
	permission?: string;
};

export type SidebarNavGroup = {
	label: string;
	items: SidebarNavItem[];
	collapsible?: boolean;
	defaultOpen?: boolean;
};

// ─── Navigation Structure ─────────────────────────────────────────────────────

const NAV_GROUPS: SidebarNavGroup[] = [
	{
		label: "Main",
		items: [
			{ title: "Home", url: "/dashboard", icon: Home },
			{
				title: "Approvals",
				url: "/dashboard/operations/approvals",
				icon: ClipboardCheck,
			},
			{
				title: "Customers",
				url: "/dashboard/customers/v2/view",
				icon: Users,
				permission: "customer_management:read",
			},
			{
				title: "Appointments",
				url: "/dashboard/appointment/view",
				icon: Calendar,
				permission: "appointment_management:read",
			},
			{
				title: "Class Slots",
				url: "/dashboard/appointment/class-slots/view",
				icon: Grid3x3,
				permission: "appointment_management:read",
			},
			{
				title: "Trainer Availability",
				url: "/dashboard/trainers/availability",
				icon: CalendarRange,
			},
			{
				title: "Services",
				url: "/dashboard/service/view",
				icon: PackageSearch,
			},
			{ title: "POS", url: "/dashboard/sales/create", icon: ShoppingCart },
		],
	},
	{
		label: "Finance",
		items: [
			{ title: "Sales & Payments", url: "/dashboard/sales/view", icon: BadgeDollarSign },
			{ title: "Payouts", url: "/dashboard/payouts/view", icon: DollarSign },
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
			},
			{ title: "Tax Rates", url: "/dashboard/settings/tax-rates", icon: Tag },
			{
				title: "Installment Plans",
				url: "/dashboard/settings/installment-plans",
				icon: CreditCard,
			},
		],
	},
	{
		label: "Staff",
		items: [
			{
				title: "Trainers",
				url: "/dashboard/trainers/view",
				icon: Users,
				permission: "user_management:read",
			},
			{ title: "Employees", url: "/dashboard/user/view", icon: Users },
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
		label: "Access",
		items: [
			{
				title: "Roles",
				url: "/dashboard/access-control/roles",
				icon: Shield,
				permission: "role_management:read",
			},
			{
				title: "Staff Access",
				url: "/dashboard/access-control/user-assignment",
				icon: UserPlus,
				permission: "user_management:read",
			},
			{ title: "Branches", url: "/dashboard/branch/view", icon: Store },
			{
				title: "Google Calendar",
				url: "/dashboard/settings/google-calendar",
				icon: Calendar,
			},
		],
	},
	{
		label: "Coming Soon",
		collapsible: true,
		defaultOpen: false,
		items: [
			{
				title: "All Memberships",
				url: "/dashboard/memberships/view",
				icon: CreditCard,
				permission: "service_management:read",
			},
			{
				title: "Reports",
				url: "/dashboard/reports/view",
				icon: FileChartColumnIncreasing,
				permission: "reports:read",
			},
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
			{
				title: "Notification Preferences",
				url: "/dashboard/settings/notifications",
				icon: Bell,
			},
			{
				title: "Organization",
				url: "/dashboard/settings/organization",
				icon: Building2,
			},
			{ title: "GHL Integration", url: "/go-highlevel-integration", icon: Map },
			{ title: "Products", url: "/dashboard/products/view", icon: Package },
			{
				title: "Purchase Orders",
				url: "/dashboard/purchase-orders/view",
				icon: ClipboardList,
			},
			{
				title: "Inventory Options",
				url: "/dashboard/inventory-options",
				icon: Warehouse,
			},
			{ title: "Units of Measure", url: "/dashboard/uom/view", icon: Ruler },
			{
				title: "Stock Movement",
				url: "/dashboard/stock-requests/view",
				icon: ArrowLeftRight,
			},
			{ title: "Expenses", url: "/dashboard/expenses/view", icon: Receipt },
		],
	},
];

// ─── SidebarUserFooter ────────────────────────────────────────────────────────

function SidebarUserFooter() {
	const { data: session } = authClient.useSession();
	const { logout } = useAuth();
	const [loggingOut, setLoggingOut] = useState(false);

	// Better-Auth inferAdditionalFields adds firstName/lastName at runtime; the client type doesn't reflect it.
	const sessionUser = session?.user as (typeof session & Record<string, unknown> extends null | undefined ? undefined : { firstName?: string; lastName?: string; name?: string; email?: string });
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
					<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-secondary-2 font-semibold text-sm text-white">
						{initial}
					</span>

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

			<DropdownMenuContent side="top" align="start" className="w-56 rounded-xl">
				<DropdownMenuLabel className="font-normal">
					<div className="flex flex-col space-y-1">
						<p className="text-sm font-medium leading-none">{displayName}</p>
						<p className="text-xs leading-none text-brand-secondary-1">{email}</p>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/customers" className="flex items-center gap-2">
						<User className="size-4" />
						<span>Personal Details</span>
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link to="/dashboard/settings/organization" className="flex items-center gap-2">
						<Settings className="size-4" />
						<span>Settings</span>
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem className="flex items-center gap-2 cursor-pointer">
					<span>Help</span>
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
	const [isOpen, setIsOpen] = useState(group.defaultOpen ?? true);

	const visibleItems = group.items.filter((item) => {
		if (!item.permission) return true;
		return hasPermission(item.permission);
	});

	if (visibleItems.length === 0) return null;

	const renderItems = () => (
		<SidebarMenu>
			{visibleItems.map((item) => {
				const isActive =
					item.url === "/dashboard"
						? pathname === "/dashboard"
						: pathname.startsWith(item.url);

				return (
					<SidebarMenuItem key={item.title}>
						<SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
							<Link to={item.url}>
								<item.icon className="size-4" />
								<span>{item.title}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				);
			})}
		</SidebarMenu>
	);

	if (group.collapsible) {
		return (
			<SidebarGroup className="py-1">
				<button
					type="button"
					onClick={() => setIsOpen((v) => !v)}
					className="flex w-full items-center justify-between px-2 py-1.5 text-left font-bold text-[10px] text-brand-secondary-1 uppercase tracking-widest hover:text-foreground transition-colors group-data-[collapsible=icon]:hidden"
				>
					<span>{group.label}</span>
					<ChevronRight
						className={cn(
							"size-3 shrink-0 transition-transform",
							isOpen && "rotate-90",
						)}
					/>
				</button>
				{isOpen && <SidebarGroupContent>{renderItems()}</SidebarGroupContent>}
			</SidebarGroup>
		);
	}

	return (
		<SidebarGroup className="py-1">
			<SidebarGroupLabel className="font-bold text-[10px] text-brand-secondary-1 uppercase tracking-widest group-data-[collapsible=icon]:hidden">
				{group.label}
			</SidebarGroupLabel>

			<SidebarGroupContent>{renderItems()}</SidebarGroupContent>
		</SidebarGroup>
	);
}

// ─── AppSidebar ───────────────────────────────────────────────────────────────

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const { data: session } = authClient.useSession();
	const { data: userContext, hasRole } = useUserContext(!!session?.user);
	const isStaffOrTrainer = hasRole(["trainer", "staff"]);
	const { isPlatformAdmin, role } = usePlatformAdminRole();
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

				{currentOrg && (
					<div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:hidden">
						<Building2 className="size-4 shrink-0 text-brand-secondary-1" />
						<span className="truncate text-brand-secondary-1 text-sm">
							{currentOrg.name}
						</span>
					</div>
				)}

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
				{isPlatformAdmin && (
					<SidebarGroup className="py-1">
						<SidebarGroupLabel className="font-bold text-[10px] text-brand-secondary-1 uppercase tracking-widest group-data-[collapsible=icon]:hidden">
							Platform Admin
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								<SidebarMenuItem>
									<SidebarMenuButton
										asChild
										isActive={pathname.startsWith("/dashboard/platform-admin/users")}
										tooltip="Users"
									>
										<Link to={"/dashboard/platform-admin/users" as string}>
											<Users className="size-4" />
											<span>Users</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
								{role === "super_admin" && (
									<SidebarMenuItem>
										<SidebarMenuButton
											asChild
											isActive={pathname.startsWith("/dashboard/platform-admin/admins")}
											tooltip="Admins"
										>
											<Link to={"/dashboard/platform-admin/admins" as string}>
												<Shield className="size-4" />
												<span>Admins</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								)}
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
