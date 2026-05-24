#!/usr/bin/env node
/**
 * Trim duplicated imports in split hierarchy router modules (Plan D-S7 scaling).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "packages/api/src/routers/hierarchy");

const EXPORT_MARKERS = {
	"read.procedures.ts": "export const hierarchyReadProcedures",
	"create.procedures.ts": "export const hierarchyCreateProcedures",
	"update.procedures.ts": "export const hierarchyUpdateProcedures",
	"delete.procedures.ts": "export const hierarchyDeleteProcedures",
	"move.procedures.ts": "export const hierarchyMoveProcedures",
	"members.procedures.ts": "export const hierarchyMembersProcedures",
};

const HEADERS = {
	"read.procedures.ts": `import { getDescendantNodeIds, listNodesWithStats } from "@avantej-core/services";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { eq, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";

`,
	"create.procedures.ts": `import {
	type CreateHierarchyNodeParams,
	createHierarchyNode,
	getDescendantNodeIds,
	validateHierarchyRules,
	validateParentAccess,
} from "@avantej-core/services";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { organizationBranches } from "@avantej-core/db/schema/control-panel/organization-branches";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { tryGetControlPanelDb } from "../../lib/context-helpers";
import type { ControlPanelDb } from "../../lib/context-helpers";

`,
	"update.procedures.ts": `import {
	type UpdateHierarchyNodeParams,
	getDescendantNodeIds,
	updateHierarchyNode,
} from "@avantej-core/services";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { organizationBranches } from "@avantej-core/db/schema/control-panel/organization-branches";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { tryGetControlPanelDb } from "../../lib/context-helpers";
import type { ControlPanelDb } from "../../lib/context-helpers";

`,
	"delete.procedures.ts": `import {
	type DeleteHierarchyNodeOptions,
	deleteHierarchyNode,
	getDescendantNodeIds,
} from "@avantej-core/services";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { organizationBranches } from "@avantej-core/db/schema/control-panel/organization-branches";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { tryGetControlPanelDb } from "../../lib/context-helpers";
import type { ControlPanelDb } from "../../lib/context-helpers";

`,
	"move.procedures.ts": `import { getDescendantNodeIds, moveHierarchyNode } from "@avantej-core/services";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { tryGetControlPanelDb } from "../../lib/context-helpers";

`,
	"members.procedures.ts": `import {
	getDescendantNodeIds,
	getMembersByHierarchyScope,
	updateMemberHierarchyScope,
	bulkUpdateMemberHierarchyScope,
	getAllOrganizationMembersWithUserDetails,
} from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";

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
	let body = src.slice(exportIdx);
	body = body.replace(/\bgetControlPanelDb\b/g, "tryGetControlPanelDb");
	body = body.replace(
		/ReturnType<typeof tryGetControlPanelDb>/g,
		"ControlPanelDb",
	);
	body = body.replace(
		/NeonDatabase<typeof controlPanelSchema>/g,
		"ControlPanelDb",
	);
	const next = header + body;
	writeFileSync(path, next);
	console.log(`${file}: ${next.split(/\r?\n/).length} lines`);
}
