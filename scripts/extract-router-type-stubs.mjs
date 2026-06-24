#!/usr/bin/env node
/**
 * Plan D.2.1 — extract server router type stubs from routers/index.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const indexPath = join(process.cwd(), "packages/api/src/routers/index.ts");
const outDir = join(process.cwd(), "packages/api/src/routers/_types");
const outPath = join(outDir, "server-router-types.ts");

const lines = readFileSync(indexPath, "utf-8").split(/\r?\n/);
const stubStart = 155; // line 156
const stubEnd = 2785; // line 2786
const stubs = lines.slice(stubStart, stubEnd + 1).join("\n");

const header = `/**
 * Server-only router type stubs for client inference (Plan D.2.1).
 * Implementations live in apps/server/src/routers/.
 */
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../../index";

`;

const exported = stubs
	.replace(
		/^const ((?:auth|serverInvitation|admin|tenantAdmin|serverCustomerProfiles|subscriptions|payments|stripeConnect|platformAdmin\w+|ghl)RouterType)/gm,
		"export const $1",
	)
	.replace(
		/^const (platformAdminTenants(?:Comms|Funnel|Lifecycle|Usage)Types)/gm,
		"export const $1",
	);

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, header + exported, "utf-8");

const importBlock = `import {
	authRouterType,
	serverInvitationRouterType,
	adminRouterType,
	tenantAdminRouterType,
	serverCustomerProfilesRouterType,
	subscriptionsRouterType,
	paymentsRouterType,
	stripeConnectRouterType,
	platformAdminPaymentsRouterType,
	platformAdminAuditRouterType,
	platformAdminTenantsRouterType,
	platformAdminTenantsCommsTypes,
	platformAdminTenantsFunnelTypes,
	platformAdminTenantsLifecycleTypes,
	platformAdminTenantsUsageTypes,
	platformAdminTenantsProvisionRouterType,
	platformAdminTenantsDeletionRouterType,
	platformAdminTenantsNotesRouterType,
	platformAdminTenantsMembersRouterType,
	platformAdminTenantsFeatureFlagsRouterType,
	platformAdminTenantsTagsRouterType,
	platformAdminTenantsSearchRouterType,
	platformAdminTenantsHealthRouterType,
	platformAdminTenantsBillingRouterType,
	platformAdminDashboardRouterType,
	platformAdminRevenueRouterType,
	platformAdminCommsRouterType,
	ghlRouterType,
	platformAdminCouponsRouterType,
	platformAdminBillingRouterType,
	platformAdminRenewalsRouterType,
	platformAdminHealthRouterType,
	platformAdminWebhooksRouterType,
	platformAdminMigrationsRouterType,
} from "./_types/server-router-types";
`;

const head = lines.slice(0, stubStart);
const tail = lines.slice(stubEnd + 1);
const newIndex = [
	...head.slice(0, 3),
	importBlock.trim(),
	...head.slice(3),
	...tail,
].join("\n");

// remove unused z import from index if only used in stubs
const cleanedIndex = newIndex.replace(/import \{ z \} from "zod";\n/, "");

writeFileSync(indexPath, cleanedIndex, "utf-8");
console.log(
	`Wrote ${outPath} (${(header + exported).split("\n").length} lines)`,
);
console.log(`Updated ${indexPath} (${cleanedIndex.split("\n").length} lines)`);
