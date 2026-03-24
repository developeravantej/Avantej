import * as React from "react";
import {
  Bell,
  ChevronRight,
  ChevronsDownIcon,
  ChevronsRight,
  ChevronsUp,
  ChevronsUpDown,
  Plus,
  User,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { useRouterState, Link } from "@tanstack/react-router";
import { SIDEBAR_DATA, type SidebarMenuItem } from "./app-sidebar";
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

type BreadcrumbItem = {
  title: string;
  url?: string;
};

function getBreadcrumbs(
  sidebarMenuItems: SidebarMenuItem[],
  pathname: string
): BreadcrumbItem[] {
  let crumbs: BreadcrumbItem[] = [];
  sidebarMenuItems.forEach((item) => {
    if (item.url === pathname) {
      crumbs = [{ title: item.title, url: item.url }];
    }
    if (item.items) {
      crumbs = getBreadcrumbs(item.items, pathname);
      if (crumbs.length > 0) {
        crumbs = [{ title: item.title, url: item.url }, ...crumbs];
      }
    }
  });
  return crumbs;
}

export function AppTopbar({
  user,
  title,
  ...props
}: AppTopbarProps & React.HTMLAttributes<HTMLDivElement>) {
  const { location } = useRouterState({
    select: (s) => ({ location: s.location }),
  });
  const pathname = location.pathname;
  const breadcrumbItems = getBreadcrumbs(SIDEBAR_DATA.navMain, pathname);

  return (
    <div className="border-b w-full" {...props}>
      <div className="flex h-16 items-center px-4 justify-between w-full">
        <Breadcrumb className="pl-5">
          <BreadcrumbList>
            {breadcrumbItems.length > 0 ? (
              <React.Fragment>
                <BreadcrumbLink asChild>
                  <Link to={"/dashboard"}>Dashboard</Link>
                </BreadcrumbLink>
                <BreadcrumbSeparator />
              </React.Fragment>
            ) : (
              <BreadcrumbPage>Dashboard</BreadcrumbPage>
            )}
            {breadcrumbItems.map((crumb, index) => (
              <React.Fragment key={index}>
                <BreadcrumbItem>
                  {index === breadcrumbItems.length - 1 ? (
                    <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={crumb.url || "#"} disabled={crumb.url === "#"}>
                        {crumb.title}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {index < breadcrumbItems.length - 1 && <BreadcrumbSeparator />}
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-4">
          <Plus className="h-6 w-6 cursor-pointer" />
          <Bell className="h-6 w-6 cursor-pointer" />
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="group relative rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="mr-1">{user.name}</span>
                  <ChevronRight className=" h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user.name}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
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





