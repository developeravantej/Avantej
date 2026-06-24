// packages/db/src/schema/tenant/payment-proofs.ts

/**
 * Tenant Payment Proofs Schema (UAT §7)
 *
 * Records uploaded proof-of-payment files (bank-transfer receipts, cash slips)
 * for offline package payments. The file bytes live in R2 (binding PROOFS_BUCKET,
 * keyed by `r2Key`); this table is the queryable metadata + audit trail that the
 * admin Approvals flow reads before confirming payment and activating the package.
 */

import {
	pgTable,
	uuid,
	text,
	integer,
	timestamp,
	index,
} from "drizzle-orm/pg-core";

import { packageInstances } from "./package-instances";

export const paymentProofs = pgTable(
	"payment_proofs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		packageInstanceId: uuid("package_instance_id")
			.notNull()
			.references(() => packageInstances.id, { onDelete: "cascade" }),

		// R2 object key (path within the PROOFS_BUCKET). The bucket name is a
		// deployment concern (wrangler binding), so only the key is persisted.
		r2Key: text("r2_key").notNull(),
		fileName: text("file_name").notNull(),
		contentType: text("content_type").notNull(),
		byteSize: integer("byte_size").notNull(),

		// members.userId of the staff member who uploaded the proof (cross-DB id, no FK).
		uploadedBy: text("uploaded_by").notNull(),
		notes: text("notes"),

		uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
	},
	(table) => ({
		packageInstanceIdIdx: index("payment_proofs_package_instance_idx").on(
			table.packageInstanceId,
		),
		uploadedAtIdx: index("payment_proofs_uploaded_at_idx").on(table.uploadedAt),
	}),
);
