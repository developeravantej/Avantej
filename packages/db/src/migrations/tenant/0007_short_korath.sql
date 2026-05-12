CREATE TYPE "public"."purchase_order_status" AS ENUM('draft', 'approved', 'ordered', 'partially_received', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."promotion_type" AS ENUM('percentage', 'fixed_amount', 'free_item', 'buy_x_get_y');--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"ordered_qty" integer NOT NULL,
	"received_qty" integer DEFAULT 0 NOT NULL,
	"unit_cost" integer NOT NULL,
	"total_cost" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_number" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"status" "purchase_order_status" DEFAULT 'draft' NOT NULL,
	"order_date" timestamp with time zone NOT NULL,
	"expected_delivery_date" timestamp with time zone,
	"received_at" timestamp with time zone,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"customer_id" text NOT NULL,
	"sales_order_id" text NOT NULL,
	"discount_amount" integer NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "promotion_type" NOT NULL,
	"value" integer NOT NULL,
	"minimum_order_amount" integer DEFAULT 0 NOT NULL,
	"maximum_discount" integer,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"per_customer_limit" integer DEFAULT 1,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"branch_id" uuid,
	"applicable_product_ids" jsonb,
	"applicable_service_ids" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "walk_in_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"branch_id" uuid,
	"date_of_birth" timestamp with time zone,
	"gender" text,
	"address" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"medical_notes" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"rate_in_basis_points" integer NOT NULL,
	"category" text DEFAULT 'SST' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_items" ADD COLUMN "promotion_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "customer_type" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_usages" ADD CONSTRAINT "promotion_usages_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_in_customers" ADD CONSTRAINT "walk_in_customers_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "po_items_po_id_idx" ON "purchase_order_items" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "po_items_product_idx" ON "purchase_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "po_number_idx" ON "purchase_orders" USING btree ("purchase_order_number");--> statement-breakpoint
CREATE INDEX "po_supplier_idx" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "po_branch_idx" ON "purchase_orders" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "po_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "po_order_date_idx" ON "purchase_orders" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX "po_created_by_idx" ON "purchase_orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "po_supplier_status_idx" ON "purchase_orders" USING btree ("supplier_id","status");--> statement-breakpoint
CREATE INDEX "promo_usages_promo_idx" ON "promotion_usages" USING btree ("promotion_id");--> statement-breakpoint
CREATE INDEX "promo_usages_customer_idx" ON "promotion_usages" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "promo_usages_order_idx" ON "promotion_usages" USING btree ("sales_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_usages_unique_customer_order" ON "promotion_usages" USING btree ("promotion_id","customer_id","sales_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promotions_code_idx" ON "promotions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "promotions_active_idx" ON "promotions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "promotions_valid_dates_idx" ON "promotions" USING btree ("valid_from","valid_until");--> statement-breakpoint
CREATE INDEX "promotions_branch_idx" ON "promotions" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "promotions_type_idx" ON "promotions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "walk_in_customers_name_idx" ON "walk_in_customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "walk_in_customers_phone_idx" ON "walk_in_customers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "walk_in_customers_email_idx" ON "walk_in_customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "walk_in_customers_branch_idx" ON "walk_in_customers" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "walk_in_customers_active_idx" ON "walk_in_customers" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_code_idx" ON "tax_rates" USING btree ("code");--> statement-breakpoint
CREATE INDEX "tax_rates_active_idx" ON "tax_rates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "tax_rates_default_idx" ON "tax_rates" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "tax_rates_category_idx" ON "tax_rates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "payment_items_promotion_idx" ON "payment_items" USING btree ("promotion_id");--> statement-breakpoint
CREATE INDEX "sales_orders_customer_type_idx" ON "sales_orders" USING btree ("customer_type");