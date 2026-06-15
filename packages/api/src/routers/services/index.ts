/**
 * Services Router — split by domain (Plan D-S7).
 */
import { serviceAnalyticsProcedures } from "./analytics.procedures";
import { serviceCrudProcedures } from "./crud.procedures";
import { servicePricingProcedures } from "./pricing.procedures";

export const servicesRouter = {
	...serviceCrudProcedures,
	...servicePricingProcedures,
	...serviceAnalyticsProcedures,
};
