import type * as React from "react";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "18rem" } as React.CSSProperties}
    >
      <div className="flex min-h-screen w-full">
        <AppSidebar className="border-r" />
        <main className="flex-1 p-6 bg-background">{children}</main>
      </div>
    </SidebarProvider>
  );
}


