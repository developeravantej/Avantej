"""
Build 0010_snapshot.json from 0009_snapshot.json by applying the schema
consolidation transformations.

Run from repo root:
    python zplan/12-04_14-00_schema-consolidation-finalization/_tools/build_0010_snapshot.py

Why hand-built: drizzle-kit generate requires an interactive TTY to resolve
rename prompts (column package_assignment_id -> package_instance_id, table drops
vs renames, etc.) The automation harness has no TTY. Rather than block on this,
we apply the transformations directly to the snapshot JSON. The result is
identical to what drizzle-kit would produce with "drop, no rename" answers for
the 5 dropped tables and "yes, rename" for the appointment_clients column.
"""

import copy
import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
META = ROOT / "packages" / "db" / "src" / "migrations" / "meta"
SRC = META / "0009_snapshot.json"
DST = META / "0010_snapshot.json"

with SRC.open("r", encoding="utf-8") as f:
    snap = json.load(f)

new = copy.deepcopy(snap)
new["prevId"] = new["id"]
new["id"] = str(uuid.uuid4())

tables = new["tables"]

# 1. Drop 5 legacy tables -------------------------------------------------
for t in [
    "public.packages",
    "public.package_assignments",
    "public.cancelled_sales",
    "public.service_rules",
    "public.service_commission_config",
]:
    tables.pop(t, None)

# 2. services: add session_count, expirable, expiry_days, expiry_date -----
svc = tables["public.services"]
svc["columns"]["session_count"] = {
    "name": "session_count",
    "type": "integer",
    "primaryKey": False,
    "notNull": False,
}
svc["columns"]["expirable"] = {
    "name": "expirable",
    "type": "boolean",
    "primaryKey": False,
    "notNull": True,
    "default": False,
}
svc["columns"]["expiry_days"] = {
    "name": "expiry_days",
    "type": "integer",
    "primaryKey": False,
    "notNull": False,
}
svc["columns"]["expiry_date"] = {
    "name": "expiry_date",
    "type": "timestamp",
    "primaryKey": False,
    "notNull": False,
}
svc["indexes"]["services_expiry_days_idx"] = {
    "name": "services_expiry_days_idx",
    "columns": [
        {
            "expression": "expiry_days",
            "isExpression": False,
            "asc": True,
            "nulls": "last",
        }
    ],
    "isUnique": False,
    "concurrently": False,
    "method": "btree",
    "with": {},
}

# 3. sales_orders: cancellation columns + unique + indexes ----------------
so = tables["public.sales_orders"]
so["columns"]["cancellation_number"] = {
    "name": "cancellation_number",
    "type": "text",
    "primaryKey": False,
    "notNull": False,
}
so["columns"]["cancellation_date"] = {
    "name": "cancellation_date",
    "type": "timestamp",
    "primaryKey": False,
    "notNull": False,
}
so["columns"]["cancellation_reason"] = {
    "name": "cancellation_reason",
    "type": "text",
    "primaryKey": False,
    "notNull": False,
}
so["columns"]["cancelled_by"] = {
    "name": "cancelled_by",
    "type": "text",
    "primaryKey": False,
    "notNull": False,
}
so["columns"]["cancelled_amount"] = {
    "name": "cancelled_amount",
    "type": "integer",
    "primaryKey": False,
    "notNull": False,
}
so["uniqueConstraints"]["sales_orders_cancellation_number_unique"] = {
    "name": "sales_orders_cancellation_number_unique",
    "nullsNotDistinct": False,
    "columns": ["cancellation_number"],
}
so["indexes"]["sales_orders_cancellation_number_idx"] = {
    "name": "sales_orders_cancellation_number_idx",
    "columns": [
        {
            "expression": "cancellation_number",
            "isExpression": False,
            "asc": True,
            "nulls": "last",
        }
    ],
    "isUnique": False,
    "concurrently": False,
    "method": "btree",
    "with": {},
}
so["indexes"]["sales_orders_cancellation_date_idx"] = {
    "name": "sales_orders_cancellation_date_idx",
    "columns": [
        {
            "expression": "cancellation_date",
            "isExpression": False,
            "asc": True,
            "nulls": "last",
        }
    ],
    "isUnique": False,
    "concurrently": False,
    "method": "btree",
    "with": {},
}

# 4. package_instances: drop package_id, add service_id NOT NULL + FK -----
pi = tables["public.package_instances"]
del pi["columns"]["package_id"]
pi["columns"]["service_id"] = {
    "name": "service_id",
    "type": "uuid",
    "primaryKey": False,
    "notNull": True,
}
pi["indexes"].pop("package_instances_package_idx", None)
pi["foreignKeys"].pop("package_instances_package_id_packages_id_fk", None)
pi["indexes"]["package_instances_service_idx"] = {
    "name": "package_instances_service_idx",
    "columns": [
        {
            "expression": "service_id",
            "isExpression": False,
            "asc": True,
            "nulls": "last",
        }
    ],
    "isUnique": False,
    "concurrently": False,
    "method": "btree",
    "with": {},
}
pi["foreignKeys"]["package_instances_service_id_services_id_fk"] = {
    "name": "package_instances_service_id_services_id_fk",
    "tableFrom": "package_instances",
    "tableTo": "services",
    "schemaTo": "public",
    "columnsFrom": ["service_id"],
    "columnsTo": ["id"],
    "onDelete": "restrict",
    "onUpdate": "no action",
}

# 5. appointment_clients: rename package_assignment_id -> package_instance_id
ac = tables["public.appointment_clients"]
ac["columns"].pop("package_assignment_id", None)
ac["columns"]["package_instance_id"] = {
    "name": "package_instance_id",
    "type": "uuid",
    "primaryKey": False,
    "notNull": False,
}
ac["indexes"].pop("appointment_clients_package_idx", None)
ac["indexes"]["appointment_clients_package_instance_idx"] = {
    "name": "appointment_clients_package_instance_idx",
    "columns": [
        {
            "expression": "package_instance_id",
            "isExpression": False,
            "asc": True,
            "nulls": "last",
        }
    ],
    "isUnique": False,
    "concurrently": False,
    "method": "btree",
    "with": {},
}
ac["foreignKeys"].pop(
    "appointment_clients_package_assignment_id_package_assignments_id_fk", None
)
ac["foreignKeys"][
    "appointment_clients_package_instance_id_package_instances_id_fk"
] = {
    "name": "appointment_clients_package_instance_id_package_instances_id_fk",
    "tableFrom": "appointment_clients",
    "tableTo": "package_instances",
    "schemaTo": "public",
    "columnsFrom": ["package_instance_id"],
    "columnsTo": ["id"],
    "onDelete": "set null",
    "onUpdate": "no action",
}

# Write + validate --------------------------------------------------------
with DST.open("w", encoding="utf-8", newline="\n") as f:
    json.dump(new, f, indent=2)
    f.write("\n")

with DST.open("r", encoding="utf-8") as f:
    json.load(f)

print(f"Wrote {DST}")
print(f"  tables: {len(new['tables'])} (was {len(snap['tables'])})")
print(f"  new id: {new['id']}")
print(f"  prevId matches 0009: {new['prevId'] == snap['id']}")

dropped_tables_gone = all(
    t not in new["tables"]
    for t in [
        "public.packages",
        "public.package_assignments",
        "public.cancelled_sales",
        "public.service_rules",
        "public.service_commission_config",
    ]
)
print(f"  5 dropped tables removed: {dropped_tables_gone}")

svc_new = new["tables"]["public.services"]["columns"]
print(
    f"  services new columns present: "
    f"session_count={bool(svc_new.get('session_count'))}, "
    f"expirable={bool(svc_new.get('expirable'))}, "
    f"expiry_days={bool(svc_new.get('expiry_days'))}, "
    f"expiry_date={bool(svc_new.get('expiry_date'))}"
)

so_new = new["tables"]["public.sales_orders"]["columns"]
print(
    f"  sales_orders new columns present: "
    f"cancellation_number={bool(so_new.get('cancellation_number'))}, "
    f"cancelled_amount={bool(so_new.get('cancelled_amount'))}"
)

pi_new = new["tables"]["public.package_instances"]["columns"]
print(
    f"  package_instances: service_id={bool(pi_new.get('service_id'))}, "
    f"package_id={bool(pi_new.get('package_id'))} (expect False)"
)

ac_new = new["tables"]["public.appointment_clients"]["columns"]
print(
    f"  appointment_clients: package_instance_id={bool(ac_new.get('package_instance_id'))}, "
    f"package_assignment_id={bool(ac_new.get('package_assignment_id'))} (expect False)"
)
