import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard/_layout")({
  component: DashboardLayout,
});

function DashboardLayout() {
  return <Outlet />;
}

