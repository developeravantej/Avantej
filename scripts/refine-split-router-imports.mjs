#!/usr/bin/env node
/**
 * Replace duplicated preamble in inline-export split-router modules.
 * NOTE: Does NOT apply to const-alias routers like commission-splits lifecycle.
 *
 * Usage: node scripts/refine-split-router-imports.mjs <routerFolderName>
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const routerName = process.argv[2];
if (!routerName) {
	console.error("Usage: refine-split-router-imports.mjs <router>");
	process.exit(1);
}

const dir = join(process.cwd(), "packages/api/src/routers", routerName);
if (!existsSync(dir)) {
	console.error(`Missing ${dir}`);
	process.exit(1);
}

/** Per-file import preambles (export line must follow immediately). */
const HEADERS = {
	appointments: {
		"crud.procedures.ts": `import {
	createAppointment,
	updateAppointment,
	syncAppointmentToGoogleCalendar,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardInputBranchForContext,
} from "../../guards";
import { eq } from "drizzle-orm";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { mapPgError } from "../../lib/orpc-error-mapper";
import { appointmentTypeSchema, statusSchema } from "./schemas";

`,
		"list.procedures.ts": `import {
	listAppointmentsForUser,
	getAppointmentById,
	getAppointmentStatusHistory,
	listAppointmentsWithRecurrence,
	isVirtualId,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardInputBranchForContext,
	resolveAccessibleNodeIds,
} from "../../guards";
import { eq, inArray, or, and, gte } from "drizzle-orm";
import { parseCursor, encodeCursor } from "../../lib/cursor";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { memberProfiles } from "@avantej-core/db/schema/tenant/member-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { appointmentStaff } from "@avantej-core/db/schema/tenant/appointment-staff";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { recurrenceRules } from "@avantej-core/db/schema/tenant/recurrence-rules";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "../../lib/context-helpers";
import { statusSchema } from "./schemas";

`,
		"recurrence.procedures.ts": `import {
	listAppointmentsWithRecurrence,
	isVirtualId,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardInputBranchForContext,
} from "../../guards";
import { eq, and, gte, ne } from "drizzle-orm";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { recurrenceRules } from "@avantej-core/db/schema/tenant/recurrence-rules";
import { statusSchema } from "./schemas";
import type { TenantTx } from "./types";

`,
		"series-cancel.procedures.ts": `import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { eq, and, gte, ne } from "drizzle-orm";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { recurrenceRules } from "@avantej-core/db/schema/tenant/recurrence-rules";
import type { TenantTx } from "./types";

`,
	},
};

/** Routers using const-alias exports must be trimmed manually — not via this script. */
delete HEADERS["commission-splits"];

const headers = HEADERS[routerName];
if (!headers) {
	console.error(`No header map for router "${routerName}"`);
	process.exit(1);
}

const exportPrefix =
	routerName === "appointments"
		? "export const appointments"
		: routerName === "commission-splits"
			? "export const commissionSplits"
			: `export const ${routerName}`;

for (const file of readdirSync(dir).filter((f) =>
	f.endsWith(".procedures.ts"),
)) {
	const header = headers[file];
	if (!header) {
		console.warn(`Skip ${file} (no header map)`);
		continue;
	}
	const path = join(dir, file);
	const src = readFileSync(path, "utf-8");
	const exportIdx = src.indexOf(exportPrefix);
	if (exportIdx < 0) {
		console.error(`${file}: missing export marker`);
		process.exit(1);
	}
	const next = header + src.slice(exportIdx);
	writeFileSync(path, next);
	console.log(`${file}: ${next.split(/\r?\n/).length} lines`);
}
