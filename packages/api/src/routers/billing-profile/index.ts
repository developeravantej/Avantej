/**
 * Billing-profile router — folder module from the start (400-LOC CI gate).
 * Singleton tenant billing identity for branded print documents.
 */

import { billingProfileProcedures } from "./profile.procedures";

export const billingProfileRouter = {
	...billingProfileProcedures,
};
