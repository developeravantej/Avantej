#!/usr/bin/env node
/**
 * Trim duplicated imports in split refunds router modules (Plan D-S7 scaling).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "packages/api/src/routers/refunds");

const EXPORT_MARKERS = {
	"read.procedures.ts": "export const refundsReadProcedures",
	"lifecycle.procedures.ts": "export const refundsLifecycleProcedures",
	"bulk.procedures.ts": "export const refundsBulkProcedures",
};

const HEADERS = {
	"read.procedures.ts": `import { getRefundById, listRefunds } from "@avantej-core/services/refunds.service";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";

`,
	"lifecycle.procedures.ts": `import {
	approveRefund,
	processRefund,
	rejectRefund,
	requestRefund,
} from "@avantej-core/services/refunds.service";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../../guards";

`,
	"bulk.procedures.ts": `import { bulkApproveRefunds, createPartialRefund } from "@avantej-core/services/refunds.service";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../../guards";

`,
};

for (const file of readdirSync(dir).filter((f) => f.endsWith(".procedures.ts"))) {
	const header = HEADERS[file];
	const exportMarker = EXPORT_MARKERS[file];
	if (!header || !exportMarker) {
		console.error(`Missing config for ${file}`);
		process.exit(1);
	}
	const path = join(dir, file);
	const src = readFileSync(path, "utf-8");
	const exportIdx = src.indexOf(exportMarker);
	if (exportIdx < 0) {
		console.error(`${file}: export marker not found`);
		process.exit(1);
	}
	const body = src.slice(exportIdx);
	writeFileSync(path, header + body);
	console.log(`${file}: ${(header + body).split(/\r?\n/).length} lines`);
}
