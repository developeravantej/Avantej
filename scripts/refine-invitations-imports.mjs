#!/usr/bin/env node
/**
 * Trim duplicated imports in split invitations router modules (Plan D-S7 scaling).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "packages/api/src/routers/invitations");

const EXPORT_MARKERS = {
	"create.procedures.ts": "export const invitationsCreateProcedures",
	"manage.procedures.ts": "export const invitationsManageProcedures",
	"public.procedures.ts": "export const invitationsPublicProcedures",
};

const HEADERS = {
	"create.procedures.ts": `import { createInvitation } from "@avantej-core/services";
import { invitations } from "@avantej-core/db/schema/tenant/invitations";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { tryGetControlPanelDb } from "../../lib/context-helpers";

`,
	"manage.procedures.ts": `import { listInvitations, resendInvitation, revokeInvitation } from "@avantej-core/services";
import { invitations } from "@avantej-core/db/schema/tenant/invitations";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";

`,
	"public.procedures.ts": `import { user } from "@avantej-core/db/schema/auth";
import { invitations } from "@avantej-core/db/schema/tenant/invitations";
import { members } from "@avantej-core/db/schema/tenant/members";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import { getInvitationByToken, validateInvitation } from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure } from "../../index";
import { assertOrgContextMatch } from "../../guards";
import { tryGetControlPanelDb } from "../../lib/context-helpers";

`,
};

const CP_DB_BLOCK =
	/const controlPanelDb = context\.honoContext\?\.get\("controlPanelDb"\) as[\s\S]*?;\n/g;

for (const file of readdirSync(dir).filter((f) =>
	f.endsWith(".procedures.ts"),
)) {
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
	body = body.replace(
		CP_DB_BLOCK,
		"const controlPanelDb = tryGetControlPanelDb(context);\n\n",
	);
	const next = header + body;
	writeFileSync(path, next);
	console.log(`${file}: ${next.split(/\r?\n/).length} lines`);
}
