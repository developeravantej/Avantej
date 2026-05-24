#!/usr/bin/env node
/**
 * Trim duplicated imports in split members router modules (Plan D-S7 scaling).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "packages/api/src/routers/members");

const HEADERS = {
	"list.procedures.ts": `import { getDescendantNodeIds } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { user } from "@avantej-core/db/schema/auth";
import { desc, eq, and, inArray, asc, isNull, type SQL } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";

`,
	"read.procedures.ts": `import { getMembersNewToday, getDescendantNodeIds } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user } from "@avantej-core/db/schema/auth";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch, resolveAccessibleNodeIds } from "../../guards";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";

`,
	"create.procedures.ts": `import { createMember, getDescendantNodeIds, validateParentAccess } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user } from "@avantej-core/db/schema/auth";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { DispatchStaffSyncFn, GhlSyncResult } from "./shared";

`,
	"role.procedures.ts": `import { getDescendantNodeIds } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import { writeAudit } from "@avantej-core/services/audit-log.service";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { DispatchStaffSyncFn, GhlSyncResult } from "./shared";

`,
	"scope.procedures.ts": `import { getDescendantNodeIds, validateParentAccess } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { writeAudit } from "@avantej-core/services/audit-log.service";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { DispatchStaffSyncFn, GhlSyncResult } from "./shared";

`,
	"status.procedures.ts": `import { getDescendantNodeIds } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import { writeAudit } from "@avantej-core/services/audit-log.service";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";

`,
	"archive.procedures.ts": `import { getDescendantNodeIds } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { deactivateMember } from "@avantej-core/services/member.service";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { DispatchStaffSyncFn, GhlSyncResult } from "./shared";

`,
	"removal.procedures.ts": `import { getDescendantNodeIds } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";

`,
	"sync.procedures.ts": `import { z } from "zod";
import { tenantProcedure } from "../../index";
import { assertOrgContextMatch } from "../../guards";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { DispatchStaffSyncFn, GhlSyncResult } from "./shared";

`,
};

for (const file of readdirSync(dir).filter((f) => f.endsWith(".procedures.ts"))) {
	const header = HEADERS[file];
	if (!header) {
		console.error(`Missing header for ${file}`);
		process.exit(1);
	}
	const path = join(dir, file);
	const src = readFileSync(path, "utf-8");
	const exportIdx = src.indexOf("export const members");
	if (exportIdx < 0) {
		console.error(`${file}: export marker not found`);
		process.exit(1);
	}
	let body = src.slice(exportIdx);
	// Replace inline DispatchStaffSyncFn type blocks with shared import usage.
	body = body.replace(
		/\s*type DispatchStaffSyncFn = \(args: \{[\s\S]*?\}\) => Promise<GhlSyncResult>;\n\n/g,
		"\n",
	);
	const next = header + body;
	writeFileSync(path, next);
	console.log(`${file}: ${next.split(/\r?\n/).length} lines`);
}
