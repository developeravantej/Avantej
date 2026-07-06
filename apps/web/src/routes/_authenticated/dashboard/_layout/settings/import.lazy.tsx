import { createLazyFileRoute } from "@tanstack/react-router";
import { DataImportPage } from "@/components/pages/settings/import/DataImportPage";

export const Route = createLazyFileRoute(
	"/_authenticated/dashboard/_layout/settings/import",
)({ component: DataImportPage });
