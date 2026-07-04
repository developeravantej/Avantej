import { createLazyFileRoute } from "@tanstack/react-router";
import { DataExportPage } from "@/components/pages/settings/export/DataExportPage";

export const Route = createLazyFileRoute(
	"/_authenticated/dashboard/_layout/settings/export",
)({ component: DataExportPage });
