ALTER TABLE "expenses" ALTER COLUMN "currency" SET DEFAULT 'myr';--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "allow_credit_overdraft" boolean DEFAULT false NOT NULL;