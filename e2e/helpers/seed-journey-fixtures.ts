/**
 * Journey fixtures — idempotently resolve the tenant state the journey suite needs.
 *
 * Reuses the oRPC pickers/creators in seed-data.ts. Picks existing entities and
 * creates the cheap ones (product) if missing, so journeys don't `test.skip()` on
 * an under-seeded tenant (which would produce no video for the review page).
 */

import type { Page } from "@playwright/test";
import {
	TEST_ORG_ID,
	pickFirstActiveClient,
	pickFirstActiveTrainer,
	pickFirstService,
	pickFirstProduct,
	ensureFirstProduct,
	pickFirstBranchId,
	pickFirstInstallmentPlan,
	type ClientInfo,
	type TrainerInfo,
	type ServiceInfo,
	type ProductInfo,
	type InstallmentPlanInfo,
} from "./seed-data";

export interface JourneyFixtures {
	orgId: string;
	client: ClientInfo | null;
	trainer: TrainerInfo | null;
	service: ServiceInfo | null;
	packageService: ServiceInfo | null;
	product: ProductInfo | null;
	branchId: string;
	installmentPlan: InstallmentPlanInfo | null;
}

export async function ensureJourneyFixtures(page: Page): Promise<JourneyFixtures> {
	const [client, trainer, service, packageService] = await Promise.all([
		pickFirstActiveClient(page),
		pickFirstActiveTrainer(page),
		pickFirstService(page),
		pickFirstService(page, { isPackage: true, hasSessions: true }),
	]);
	const product = (await pickFirstProduct(page)) ?? (await ensureFirstProduct(page));
	const branchId = await pickFirstBranchId(page);
	const installmentPlan = await pickFirstInstallmentPlan(page);
	return { orgId: TEST_ORG_ID, client, trainer, service, packageService, product, branchId, installmentPlan };
}

/** Branch scope to use for a customer's POS sale / appointment. */
export function branchForClient(fx: JourneyFixtures): string {
	return fx.client?.hierarchyScopeId ?? fx.branchId;
}
