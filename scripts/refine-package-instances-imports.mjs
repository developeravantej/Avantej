#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "packages/api/src/routers/package-instances");

const headers = {
	"client.procedures.ts": `import { listPackageInstancesForClient, getPackageInstanceById } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user } from "@avantej-core/db/schema/auth";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";
import { sourceSchema, statusSchema } from "./schemas";

`,
	"create.procedures.ts": `import { createPackageInstance, createInstallmentSchedule } from "@avantej-core/services";
import { getSetting } from "@avantej-core/services/organization-settings.service";
import { notifyStaffOfPendingPackage } from "@avantej-core/services/notification.service";
import { installmentPlans } from "@avantej-core/db/schema/tenant/installment-plans";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import {
	sourceSchema,
	paymentStatusSchema,
	statusSchema,
	PACKAGE_APPROVAL_REQUIRED_KEY,
} from "./schemas";

`,
	"lists.procedures.ts": `import { listMemberships, listAssignedToMember } from "@avantej-core/services/package-instance.service";
import { listExpiringMemberships } from "@avantej-core/services/memberships.service";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { user } from "@avantej-core/db/schema/auth";
import { desc, and, eq, inArray } from "drizzle-orm";
import { parseCursor, encodeCursor } from "../../lib/cursor";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";
import { sourceSchema, statusSchema } from "./schemas";

`,
	"pending.procedures.ts": `import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { and, eq, inArray, desc } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";

`,
	"lifecycle.procedures.ts": `import {
	cancelPackageInstance,
	freezePackageInstance,
	unfreezePackageInstance,
	extendPackageInstance,
} from "@avantej-core/services";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";

`,
	"history.procedures.ts": `import { getPackageInstanceStatusHistory } from "@avantej-core/services";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { inArray } from "drizzle-orm";
import { parseCursor, encodeCursor } from "../../lib/cursor";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { assertOrgContextMatch } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";

`,
	"assign.procedures.ts": `import { writeAudit } from "@avantej-core/services/audit-log.service";
import { appendPackageInstanceStatusHistory } from "@avantej-core/services/status-history.helper";
import {
	notifyCustomerPackageAssigned,
	clearPendingReviewNotifications,
} from "@avantej-core/services/notification.service";
import { packageInstanceStaff } from "@avantej-core/db/schema/tenant/package-instance-staff";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { assertOrgContextMatch } from "../../guards";
import type { TenantTx } from "./types";

`,
	"approve.procedures.ts": `import { writeAudit } from "@avantej-core/services/audit-log.service";
import { appendPackageInstanceStatusHistory } from "@avantej-core/services/status-history.helper";
import {
	notifyCustomerPackageAssigned,
	notifyCustomerPackageRejected,
	clearPendingReviewNotifications,
} from "@avantej-core/services/notification.service";
import { packageInstanceStaff } from "@avantej-core/db/schema/tenant/package-instance-staff";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import type { TenantTx } from "./types";

`,
	"bulk-reject.procedures.ts": `import { writeAudit } from "@avantej-core/services/audit-log.service";
import { appendPackageInstanceStatusHistory } from "@avantej-core/services/status-history.helper";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { eq, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import type { TenantTx } from "./types";

`,
};

for (const file of readdirSync(dir).filter((f) =>
	f.endsWith(".procedures.ts"),
)) {
	const path = join(dir, file);
	const src = readFileSync(path, "utf-8");
	const exportIdx = src.indexOf("export const packageInstances");
	if (exportIdx < 0) {
		console.error(`Skip ${file}: no export`);
		continue;
	}
	const header = headers[file];
	if (!header) {
		console.error(`Missing header map for ${file}`);
		process.exit(1);
	}
	const next = header + src.slice(exportIdx);
	writeFileSync(path, next);
	console.log(`${file}: ${next.split(/\r?\n/).length} lines`);
}
