CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  sales_order_id uuid REFERENCES sales_orders(id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES payments(id) ON DELETE RESTRICT,
  package_instance_id uuid REFERENCES package_instances(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL,
  tax_amount_cents integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  notes text,
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  processed_by text,
  processed_at timestamptz,
  refund_method text,
  refund_reference text,
  branch_id uuid REFERENCES hierarchy_nodes(id) ON DELETE RESTRICT,
  customer_id text NOT NULL,
  customer_name text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refunds_must_target_one CHECK (
    sales_order_id IS NOT NULL OR payment_id IS NOT NULL OR package_instance_id IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS refunds_number_idx ON refunds(refund_number);
CREATE INDEX IF NOT EXISTS refunds_status_idx ON refunds(status);
CREATE INDEX IF NOT EXISTS refunds_sales_order_idx ON refunds(sales_order_id);
CREATE INDEX IF NOT EXISTS refunds_payment_idx ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS refunds_package_instance_idx ON refunds(package_instance_id);
CREATE INDEX IF NOT EXISTS refunds_branch_idx ON refunds(branch_id);
CREATE INDEX IF NOT EXISTS refunds_customer_idx ON refunds(customer_id);
CREATE INDEX IF NOT EXISTS refunds_requested_at_idx ON refunds(requested_at DESC);
