# Multi-Tenant Database Migration Scripts

This directory contains scripts for managing schema changes across all tenant databases in a multi-tenant SaaS platform.

## Overview

The `migrate-all-tenants.ts` script:
1. Reads all organizations from the control panel database
2. Decrypts each organization's tenant database connection string
3. Applies schema changes to each tenant database in parallel
4. Provides error handling and idempotent operations

## Usage

### List Available Migrations

```bash
bun run db:migrate-all-tenants --list
```

Output:
```
📋 Available Migrations:

  add-unique-branch-names
    Description: Add unique constraint for branch names
    SQL: CREATE UNIQUE INDEX "hierarchy_nodes_branch_name_unique"...

  migration-name
    Description: Your migration description
    ...
```

### Dry Run (Preview Changes)

Test the migration without applying changes:

```bash
bun run db:migrate-all-tenants --dry-run add-unique-branch-names
```

### Apply Migration to All Tenants

```bash
bun run db:migrate-all-tenants add-unique-branch-names
```

Example output:
```
🚀 Running migration: Add unique constraint for branch names
Migration: add-unique-branch-names

📦 Fetching organizations from control panel...
Found 5 organization(s)

Acme Corp... ✓ Migration applied successfully
Tech Startup... ✓ Migration applied successfully
Local Gym... ℹ Constraint already exists (skipped)
Beauty Salon... ✓ Migration applied successfully
Yoga Studio... ✓ Migration applied successfully

==================================================
Summary:
  ✓ Successful: 5
  ✗ Failed: 0
  Total: 5
==================================================
```

## Adding New Migrations

To add a new migration for future schema changes:

1. **Open** `migrate-all-tenants.ts`

2. **Add** your migration to the `MIGRATIONS` object:

```typescript
const MIGRATIONS: Record<string, { name: string; sql: string }> = {
  "add-unique-branch-names": {
    name: "Add unique constraint for branch names",
    sql: `ALTER TABLE "hierarchy_nodes" ADD CONSTRAINT "hierarchy_nodes_branch_name_unique" UNIQUE("name") WHERE "type" = 'branch';`,
  },

  // Add your new migration here:
  "add-column-to-services": {
    name: "Add duration_minutes column to services table",
    sql: `ALTER TABLE "services" ADD COLUMN "duration_minutes" integer;`,
  },

  // For multiple SQL statements, chain them with ";"
  "add-index-and-constraint": {
    name: "Add index on services and constraint",
    sql: `
      CREATE INDEX "idx_services_branch_id" ON "services"("branch_id");
      ALTER TABLE "services" ADD CONSTRAINT "services_name_unique" UNIQUE("name");
    `,
  },
};
```

3. **Test** with dry run:
```bash
bun run db:migrate-all-tenants --dry-run add-column-to-services
```

4. **Apply** to all tenants:
```bash
bun run db:migrate-all-tenants add-column-to-services
```

## Key Features

- ✅ **Idempotent**: Can be run multiple times safely (skips if constraint already exists)
- ✅ **Error Handling**: Continues if one tenant fails, reports summary
- ✅ **Dry Run**: Preview changes before applying
- ✅ **Connection String Decryption**: Automatically decrypts connection strings from control panel
- ✅ **Parallel Safe**: Each tenant gets its own connection pool

## Error Handling

The script handles common scenarios:

| Error | Behavior |
|-------|----------|
| Constraint already exists | Skips with `ℹ` info message |
| Connection fails | Reports error, continues to next tenant |
| Invalid SQL | Reports error for that tenant |
| Missing migration name | Shows available migrations and exits |

## Example: Applying the Branch Name Constraint

```bash
# 1. Preview what will happen
bun run db:migrate-all-tenants --dry-run add-unique-branch-names

# 2. Apply to all tenants
bun run db:migrate-all-tenants add-unique-branch-names

# 3. Verify success
bun db:studio  # Check individual tenant if needed
```

## Troubleshooting

**"DATABASE_URL environment variable not set"**
- Ensure your `.env` file has `DATABASE_URL` pointing to the control panel database

**"Migration not found: xyz"**
- Check the migration name with `--list`
- Verify you spelled it correctly

**"Failed to fetch organizations"**
- Verify control panel database connection is valid
- Check that the `organizations` table has the columns: `id`, `name`, `connection_string`, `neon_project_id`

**"Failed: relation already exists"**
- This means the schema change was already applied to that tenant
- Safe to ignore or re-run (will skip)

## Best Practices

1. **Always dry-run first**
   ```bash
   bun run db:migrate-all-tenants --dry-run your-migration
   ```

2. **Test on non-production tenant first**
   - If possible, test on a staging environment

3. **Document your migration**
   - Add a clear description in the `name` field
   - Include why the change is needed

4. **Keep migrations simple**
   - One logical change per migration
   - Easier to debug if something fails

5. **Monitor the output**
   - Watch for errors or skipped constraints
   - Note the summary for records

## Migration Examples

### Add a new column
```typescript
"add-status-to-appointments": {
  name: "Add status column to appointments",
  sql: `ALTER TABLE "appointments" ADD COLUMN "status" text DEFAULT 'scheduled';`,
},
```

### Create an index
```typescript
"add-index-appointments-branch": {
  name: "Add index on appointments for faster branch lookups",
  sql: `CREATE INDEX "idx_appointments_branch_id" ON "appointments"("branch_id");`,
},
```

### Multiple statements
```typescript
"update-members-table": {
  name: "Add and index member permission columns",
  sql: `
    ALTER TABLE "members" ADD COLUMN "permissions" jsonb DEFAULT '{}';
    CREATE INDEX "idx_members_permissions" ON "members" USING GIN ("permissions");
  `,
},
```
