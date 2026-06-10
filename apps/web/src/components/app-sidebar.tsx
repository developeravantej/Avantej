"use client";

import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";
import {
	Activity,
	ArrowLeftRight,
	BadgeDollarSign,
	Bell,
	Briefcase,
	Building2,
	Calendar,
	CalendarRange,
	ChevronRight,
	ClipboardCheck,
	CreditCard,
	Database,
	FileChartColumnIncreasing,
	Grid3x3,
	Home,
	LayoutDashboard,
	LogOut,
	Map,
	Megaphone,
	MessageSquare,
	Package,
	PackageSearch,
	QrCode,
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
	User,
	UserPlus,
	Users,
	Warehouse,
	Webhook,
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
	testId?: string;
};

export type SidebarNavGroup = {
	label: string;
	items: SidebarNavItem[];
	collapsible?: boolean;
	defaultOpen?: boolean;
};

// ─── Navigation Structure ─────────────────────────────────────────────────────

const NAV_GROUPS: SidebarNavGroup[] = [
	// ─── Main ──────────────────────────────────────────────────────────────
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
				title: "Trainers",
				url: "/dashboard/trainers/view",
				icon: CalendarRange,
				permission: "user_management:read",
			},
			{
				title: "Services",
				url: "/dashboard/service/view",
				icon: PackageSearch,
			},
			{ title: "POS", url: "/dashboard/sales/create", icon: ShoppingCart },
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
		],
	},

	// ─── Finance ───────────────────────────────────────────────────────────
	{
		label: "Finance",
		items: [
			{
				title: "Sales & Payments",
				url: "/dashboard/sales/view",
				icon: BadgeDollarSign,
			},
			{
				title: "Commissions",
				url: "/dashboard/commissions/view",
				icon: TrendingUp,
			},
			{ title: "Tax Rates", url: "/dashboard/settings/tax-rates", icon: Tag },
			{ title: "Expenses", url: "/dashboard/expenses/view", icon: Receipt },
			// DU-005: guard Packages with its own permission (not service_management:read)
			{
				title: "Packages",
				url: "/dashboard/packages/view",
				icon: Package,
				permission: "package_management:read",
			},
			// CP-004: dedicated Payouts nav item — active check relies on query-string-aware isActive logic in NavGroup
			{
				title: "Payouts",
				url: "/dashboard/commissions/view?tab=payouts",
				icon: BadgeDollarSign,
				permission: "commission_payout:read",
			},
		],
	},

	// ─── Staff & Access (merged per legacy design) ─────────────────────────
	{
		label: "Staff & Access",
		items: [
			{ title: "Employees", url: "/dashboard/user/view", icon: Users },
			{
				title: "Attendance",
				url: "/dashboard/appointment/view",
				icon: ClipboardCheck,
				permission: "attendance_management:read",
			},
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
			{
				title: "Branches",
				url: "/dashboard/branch/view",
				icon: Store,
				permission: "hierarchy_management:read",
			},
			{
				title: "Onboarding QR",
				url: "/dashboard/onboarding/view",
				icon: QrCode,
				permission: "hierarchy_management:read",
			},
		],
	},

	// ─── Settings (new group, matching legacy design) ──────────────────────
	{
		label: "Settings",
		items: [
			{
				title: "Org Settings",
				url: "/dashboard/settings/organization",
				icon: Building2,
			},
			{
				title: "Google Calendar",
				url: "/dashboard/settings/google-calendar",
				icon: Calendar,
			},
			{
				title: "Notification Preferences",
				url: "/dashboard/settings/notifications",
				icon: Bell,
			},
			{ title: "GHL Integration", url: "/go-highlevel-integration", icon: Map },
			{
				title: "Audit Log",
				url: "/dashboard/audit/view",
				icon: ScrollText,
				permission: "audit_log:read",
			},
		],
	},

	// ─── Coming Soon (only true stubs remain) ──────────────────────────────
	{
		label: "Coming Soon",
		collapsible: true,
		defaultOpen: false,
		items: [
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
		],
	},
];

// ─── SidebarUserFooter ────────────────────────────────────────────────────────

function SidebarUserFooter() {
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const [loggingOut, setLoggingOut] = useState(false);

	// Better-Auth inferAdditionalFields adds firstName/lastName at runtime; the client type doesn't reflect it.
	const sessionUser = session?.user as typeof session &
		Record<string, unknown> extends null | undefined
		? undefined
		: { firstName?: string; lastName?: string; name?: string; email?: string };
	const displayName =
		`${sessionUser?.firstName || ""} ${sessionUser?.lastName || ""}`.trim() ||
		sessionUser?.name ||
		"Unknown";
	const email = sessionUser?.email ?? "";
	const initial = displayName.charAt(0).toUpperCase();

	const handleLogout = async () => {
		setLoggingOut(true);
		try {
			await authClient.signOut();
			// Clear cached org + hierarchy data so a subsequent login starts clean.
			localStorage.removeItem("user_organizations");
			localStorage.removeItem("current_organization_id");
			for (const key of Object.keys(localStorage)) {
				if (key.startsWith("org_") && key.endsWith("_hierarchy")) {
					localStorage.removeItem(key);
				}
			}
			toast.success("Logged out successfully");
			navigate({ to: "/login", search: {} });
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
					<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent font-semibold text-sidebar-foreground text-sm">
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
						<p className="text-xs leading-none text-brand-secondary-1">
							{email}
						</p>
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
					<Link
						to="/dashboard/settings/organization"
						className="flex items-center gap-2"
					>
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

function NavGroup({
	group,
	badges,
}: {
	group: SidebarNavGroup;
	badges?: Record<string, number>;
}) {
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
				// CP-004: handle items whose url contains a query string (e.g. ?tab=payouts)
				// pathname never contains "?", so we must split before comparing.
				const [itemPath, itemQs] = item.url.split("?");
				const isActive =
					item.url === "/dashboard"
						? pathname === "/dashboard"
						: itemQs
							? pathname.startsWith(itemPath) &&
								// TanStack Router's location.search is a typed object;
								// use window.location.search for the raw query string.
								new URLSearchParams(window.location.search).get("tab") ===
									new URLSearchParams(itemQs).get("tab")
							: pathname.startsWith(itemPath);
				const badge = badges?.[item.url];

				return (
					<SidebarMenuItem key={item.title}>
						<SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
							<Link to={item.url} data-testid={item.testId}>
								<item.icon className="size-4" />
								<span>{item.title}</span>
								{badge && badge > 0 ? (
									<span
										className={cn(
											"ml-auto rounded-full bg-amber-500/20 px-1.5 py-0 text-[10px] font-bold tabular-nums text-amber-300",
											"group-data-[collapsible=icon]:hidden",
										)}
									>
										{badge > 99 ? "99+" : badge}
									</span>
								) : null}
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
					className="flex w-full items-center justify-between px-2 py-1.5 text-left font-bold text-[10px] text-sidebar-foreground/55 uppercase tracking-widest hover:text-sidebar-foreground transition-colors group-data-[collapsible=icon]:hidden"
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
			<SidebarGroupLabel className="font-bold text-[10px] text-sidebar-foreground/55 uppercase tracking-widest group-data-[collapsible=icon]:hidden">
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
	const organizationId = userContext?.currentOrganizationId ?? null;
	// Whether the user belongs to any tenant org. Pure SaaS owners (platform
	// admins with no membership) get only the Platform Admin section.
	const hasOrg = (userContext?.organizations?.length ?? 0) > 0;

	// Branches in the current org (leaf hierarchy nodes typed "branch")
	const branchCount =
		currentOrg?.hierarchy.nodes.filter((n) => n.type === "branch").length ?? 0;

	// Org initials for the avatar tile (e.g. "Test Fitness Franchise" → "TF")
	const orgInitials = (() => {
		const name = currentOrg?.name?.trim();
		if (!name) return "??";
		const words = name.split(/\s+/).filter(Boolean);
		if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
		return (words[0][0] + words[words.length - 1][0]).toUpperCase();
	})();

	// Live pending-approvals count → chip on the Approvals nav item
	const pendingApprovalsQuery = useQuery({
		queryKey: [
			"packageInstances",
			"listPending",
			organizationId,
			"sidebarBadge",
		],
		queryFn: () =>
			client.packageInstances.listPending({
				organizationId: organizationId!,
				limit: 200,
			}),
		enabled: !!organizationId,
		staleTime: 60_000,
	});
	const pendingCount = pendingApprovalsQuery.data?.length ?? 0;

	// Badges keyed by nav-item URL — passed into NavGroup
	const badges: Record<string, number> = {
		"/dashboard/operations/approvals": pendingCount,
	};

	return (
		<Sidebar collapsible="icon" {...props}>
			{/* ── Header ── */}
			<SidebarHeader>
				<div className="flex items-center gap-2 px-2">
					<img
						alt="Logo"
						className="h-8 w-auto brightness-0 invert group-data-[collapsible=icon]:hidden"
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

				{/* Org switcher pill */}
				{currentOrg && (
					<button
						type="button"
						className={cn(
							"mx-2 mt-1 flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 text-left transition hover:bg-[#333]",
							"group-data-[collapsible=icon]:hidden",
						)}
					>
						<div className="flex size-6 shrink-0 items-center justify-center rounded bg-[#d6cdb1] text-[10px] font-bold text-black">
							{orgInitials}
						</div>
						<div className="min-w-0 flex-1">
							<div className="truncate text-xs font-semibold text-sidebar-foreground">
								{currentOrg.name}
							</div>
							<div className="truncate text-[10px] text-sidebar-foreground/55">
								{branchCount > 0
									? `${branchCount} branch${branchCount === 1 ? "" : "es"}`
									: currentOrg.role}
							</div>
						</div>
						<ChevronRight className="size-3 shrink-0 text-sidebar-foreground/55" />
					</button>
				)}

				{/* Power Search with ⌘K hint */}
				<div className="relative px-2 group-data-[collapsible=icon]:hidden">
					<Search className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-sidebar-foreground/60" />
					<input
						type="text"
						placeholder="Power search…"
						className={cn(
							"w-full rounded-xl border border-sidebar-border bg-sidebar-accent py-2 pr-10 pl-9 text-sm text-sidebar-foreground",
							"placeholder:text-sidebar-foreground/45",
							"focus:outline-none focus:ring-2 focus:ring-sidebar-ring/30",
							"transition-colors",
						)}
					/>
					<kbd className="pointer-events-none absolute top-1/2 right-5 -translate-y-1/2 rounded border border-sidebar-border bg-sidebar-accent px-1.5 py-0.5 font-mono text-[10px] text-sidebar-foreground/55">
						⌘K
					</kbd>
				</div>
			</SidebarHeader>

			{/* ── Content ── */}
			<SidebarContent className="overflow-y-auto [&::-webkit-scrollbar]:hidden">
				{hasOrg &&
					NAV_GROUPS.map((group) => (
						<NavGroup key={group.label} group={group} badges={badges} />
					))}
				{hasOrg && isStaffOrTrainer && (
					<SidebarGroup className="py-1">
						<SidebarGroupLabel className="font-bold text-[10px] text-sidebar-foreground/55 uppercase tracking-widest group-data-[collapsible=icon]:hidden">
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
						<SidebarGroupLabel className="font-bold text-[10px] text-sidebar-foreground/55 uppercase tracking-widest group-data-[collapsible=icon]:hidden">
							Platform Admin
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								<SidebarMenuItem>
									<SidebarMenuButton
										asChild
										isActive={
											pathname === "/dashboard/platform-admin/" ||
											pathname === "/dashboard/platform-admin"
										}
										tooltip="Mission Control"
									>
										<Link to={"/dashboard/platform-admin/" as string}>
											<LayoutDashboard className="size-4" />
											<span>Mission Control</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
								<SidebarMenuItem>
									<SidebarMenuButton
										asChild
										isActive={pathname.startsWith(
											"/dashboard/platform-admin/tenants",
										)}
										tooltip="Tenants"
									>
										<Link to={"/dashboard/platform-admin/tenants" as string}>
											<Building2 className="size-4" />
											<span>Tenants</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
								<SidebarMenuItem>
									<SidebarMenuButton
										asChild
										isActive={pathname.startsWith(
											"/dashboard/platform-admin/revenue",
										)}
										tooltip="Revenue"
									>
										<Link to={"/dashboard/platform-admin/revenue" as string}>
											<TrendingUp className="size-4" />
											<span>Revenue</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
								<SidebarMenuItem>
									<SidebarMenuButton
										asChild
										isActive={pathname.startsWith(
											"/dashboard/platform-admin/billing",
										)}
										tooltip="Billing"
									>
										<Link to={"/dashboard/platform-admin/billing" as string}>
											<Receipt className="size-4" />
											<span>Billing</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
								<SidebarMenuItem>
									<SidebarMenuButton
										asChild
										isActive={pathname.startsWith(
											"/dashboard/platform-admin/renewals",
										)}
										tooltip="Renewals"
									>
										<Link to={"/dashboard/platform-admin/renewals" as string}>
											<CalendarRange className="size-4" />
											<span>Renewals</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
								<SidebarMenuItem>
									<SidebarMenuButton
										asChild
										isActive={pathname.startsWith(
											"/dashboard/platform-admin/health",
										)}
										tooltip="Health"
									>
										<Link to={"/dashboard/platform-admin/health" as string}>
											<Activity className="size-4" />
											<span>Health</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
								<SidebarMenuItem>
									<SidebarMenuButton
										asChild
										isActive={pathname.startsWith(
											"/dashboard/platform-admin/comms",
										)}
										tooltip="Comms"
									>
										<Link to={"/dashboard/platform-admin/comms" as string}>
											<MessageSquare className="size-4" />
											<span>Comms</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
								<SidebarMenuItem>
									<SidebarMenuButton
										asChild
										isActive={pathname.startsWith(
											"/dashboard/platform-admin/payments",
										)}
										tooltip="Payments"
									>
										<Link to={"/dashboard/platform-admin/payments" as string}>
											<CreditCard className="size-4" />
											<span>Payments</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
								<SidebarMenuItem>
									<SidebarMenuButton
										asChild
										isActive={pathname.startsWith(
											"/dashboard/platform-admin/webhooks",
										)}
										tooltip="Webhooks"
									>
										<Link to={"/dashboard/platform-admin/webhooks" as string}>
											<Webhook className="size-4" />
											<span>Webhooks</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
								<SidebarMenuItem>
									<SidebarMenuButton
										asChild
										isActive={pathname.startsWith(
											"/dashboard/platform-admin/audit",
										)}
										tooltip="Audit log"
									>
										<Link to={"/dashboard/platform-admin/audit" as string}>
											<ScrollText className="size-4" />
											<span>Audit</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
								<SidebarMenuItem>
									<SidebarMenuButton
										asChild
										isActive={pathname.startsWith(
											"/dashboard/platform-admin/users",
										)}
										tooltip="Users"
									>
										<Link to={"/dashboard/platform-admin/users" as string}>
											<Users className="size-4" />
											<span>Users</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
								{role === "super_admin" && (
									<>
										<SidebarMenuItem>
											<SidebarMenuButton
												asChild
												isActive={pathname.startsWith(
													"/dashboard/platform-admin/migrations",
												)}
												tooltip="Migrations"
											>
												<Link
													to={"/dashboard/platform-admin/migrations" as string}
												>
													<Database className="size-4" />
													<span>Migrations</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
										<SidebarMenuItem>
											<SidebarMenuButton
												asChild
												isActive={pathname.startsWith(
													"/dashboard/platform-admin/admins",
												)}
												tooltip="Admins"
											>
												<Link to={"/dashboard/platform-admin/admins" as string}>
													<Shield className="size-4" />
													<span>Admins</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									</>
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
