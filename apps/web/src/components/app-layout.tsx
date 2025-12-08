import type * as React from "react";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const { user } = useAuth();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar className="border-r" />
        <div className="flex-1 w-full">
          <AppTopbar
            title={title}
            user={
              user
                ? {
                    name: user.full_name || user.email || "User",
                    email: user.email || "",
                    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      user.full_name || user.email || "User"
                    )}&background=random`,
                  }
                : undefined
            }
          />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}


