CREATE TABLE "member_category_buffer_overrides" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "member_id" uuid NOT NULL,
    "category_id" uuid NOT NULL,
    "buffer_time_minutes" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "mcbo_member_category_unique" UNIQUE("member_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "member_category_buffer_overrides" ADD CONSTRAINT "mcbo_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_category_buffer_overrides" ADD CONSTRAINT "mcbo_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "mcbo_member_idx" ON "member_category_buffer_overrides" USING btree ("member_id");
--> statement-breakpoint
CREATE INDEX "mcbo_category_idx" ON "member_category_buffer_overrides" USING btree ("category_id");
--> statement-breakpoint
ALTER TABLE "service_members" DROP COLUMN IF EXISTS "buffer_time_minutes";
