-- 0095_payment_proofs (UAT §7)
-- Metadata + audit trail for offline payment-proof files. Bytes live in R2
-- (PROOFS_BUCKET, keyed by r2_key). Idempotent — safe to re-run on partially
-- migrated tenant branches.

CREATE TABLE IF NOT EXISTS "payment_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_instance_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"notes" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "payment_proofs"
		ADD CONSTRAINT "payment_proofs_package_instance_id_package_instances_id_fk"
		FOREIGN KEY ("package_instance_id") REFERENCES "package_instances"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "payment_proofs_package_instance_idx"
	ON "payment_proofs" ("package_instance_id");
CREATE INDEX IF NOT EXISTS "payment_proofs_uploaded_at_idx"
	ON "payment_proofs" ("uploaded_at");
