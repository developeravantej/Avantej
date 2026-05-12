import * as React from "react";
import { Bell, ChevronRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogoutButton } from "./buttons/logout-button";
import { useLocation, Link } from "@tanstack/react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface AppTopbarProps {
	title: string;
	user?: {
		name: string;
		firstName?: string;
		lastName?: string;
		email: string;
		avatar: string;
	};
}

/** Segments to skip entirely when building breadcrumbs. */
const SKIP_SEGMENTS = new Set(["_layout", "dashboard", ""]);

/**
 * Build breadcrumb items from a URL pathname.
 *
 * e.g. /dashboard/_layout/customers/view
 *   → [{ title: "Customers", href: "/dashboard/_layout/customers" },
 *      { title: "View" }]
 *
 * The leading "Dashboard" crumb is always rendered separately, so we only
 * return the segments that come after the dashboard prefix.
 */
function buildBreadcrumbs(
	pathname: string,
): Array<{ title: string; href?: string }> {
	const segments = pathname.split("/").filter((s) => !SKIP_SEGMENTS.has(s));

	return segments.map((segment, index) => {
		// Build the href by reconstructing the path up to and including this
		// segment (preserving the full original path prefix).
		const upTo = pathname
			.split("/")
			.filter((s) => s !== "")
			.reduce<{ found: number; parts: string[] }>(
				(acc, part) => {
					if (acc.found >= segments.length) return acc;
					acc.parts.push(part);
					if (!SKIP_SEGMENTS.has(part)) acc.found++;
					if (acc.found === index + 1) return acc;
					return acc;
				},
				{ found: 0, parts: [] },
			);

		const href = `/${upTo.parts.join("/")}`;
		const title = segment
			.split("-")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");

		// Last segment has no href (rendered as BreadcrumbPage)
		return index === segments.length - 1 ? { title } : { title, href };
	});
}

export function AppTopbar({
	user,
	title: _title,
	...props
}: AppTopbarProps & React.HTMLAttributes<HTMLDivElement>) {
	const { pathname } = useLocation();
	const breadcrumbs = buildBreadcrumbs(pathname);

	return (
		<div className="border-b border-brand-secondary-3 w-full" {...props}>
			<div className="flex h-16 items-center px-4 justify-between w-full">
				<Breadcrumb className="pl-5">
					<BreadcrumbList>
						{breadcrumbs.length > 0 ? (
							<React.Fragment>
								<BreadcrumbItem>
									<BreadcrumbLink asChild>
										<Link to="/dashboard">Dashboard</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
							</React.Fragment>
						) : (
							<BreadcrumbItem>
								<BreadcrumbPage>Dashboard</BreadcrumbPage>
							</BreadcrumbItem>
						)}
						{breadcrumbs.map((crumb, index) => (
							<React.Fragment key={`${crumb.href ?? "page"}-${crumb.title}`}>
								<BreadcrumbItem>
									{index === breadcrumbs.length - 1 ? (
										<BreadcrumbPage>{crumb.title}</BreadcrumbPage>
									) : (
										<BreadcrumbLink asChild>
											<Link to={crumb.href ?? "#"}>{crumb.title}</Link>
										</BreadcrumbLink>
									)}
								</BreadcrumbItem>
								{index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
							</React.Fragment>
						))}
					</BreadcrumbList>
				</Breadcrumb>

				<div className="flex items-center gap-4">
					<Link
						to="/dashboard/notifications/view"
						className="hover:bg-brand-secondary-3 rounded-full p-1.5 transition-colors"
					>
						<Bell className="size-5" />
					</Link>

					{user && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" className="group relative rounded-full">
									<Avatar className="size-8">
										<AvatarImage src={user.avatar} alt={user.name} />
										<AvatarFallback>
											<User className="size-4" />
										</AvatarFallback>
									</Avatar>
									<span className="mr-1">{user.name}</span>
									<ChevronRight className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								className="w-56 rounded-xl"
								align="end"
								forceMount
							>
								<DropdownMenuLabel className="font-normal">
									<div className="flex flex-col space-y-1">
										<p className="text-sm font-medium leading-none">
											{user.name}
										</p>
										<p className="text-xs leading-none text-brand-secondary-1">
											{user.email}
										</p>
									</div>
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuItem>Personal Details</DropdownMenuItem>
								<DropdownMenuItem>Settings</DropdownMenuItem>
								<DropdownMenuItem>Help</DropdownMenuItem>
								<DropdownMenuItem>
									<LogoutButton className="p-0" variant="ghost" />
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			</div>
		</div>
	);
}
