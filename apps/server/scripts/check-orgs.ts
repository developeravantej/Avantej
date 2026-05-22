import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { user } from "@avantej-core/db/schema/auth";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle({ client: pool, schema: { ...controlPanelSchema, user } });

const rows = await db.select({
  email: user.email,
  orgId: controlPanelSchema.organizationMembers.organizationId,
  memberStatus: controlPanelSchema.organizationMembers.status,
  paymentStatus: controlPanelSchema.organizations.paymentStatus,
  orgName: controlPanelSchema.organizations.name,
}).from(controlPanelSchema.organizationMembers)
  .innerJoin(user, eq(controlPanelSchema.organizationMembers.userId, user.id))
  .innerJoin(controlPanelSchema.organizations, eq(controlPanelSchema.organizationMembers.organizationId, controlPanelSchema.organizations.id));

console.log(JSON.stringify(rows, null, 2));
await pool.end();
