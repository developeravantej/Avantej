import { createLazyFileRoute } from "@tanstack/react-router";
import { TaxRatesPage } from "@/components/pages/settings/tax-rates/TaxRatesPage";

export const Route = createLazyFileRoute(
	"/_authenticated/dashboard/_layout/settings/tax-rates",
)({ component: TaxRatesPage });
