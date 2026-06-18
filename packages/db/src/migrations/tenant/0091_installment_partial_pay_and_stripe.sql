ALTER TABLE installments ADD COLUMN IF NOT EXISTS amount_paid integer NOT NULL DEFAULT 0;
ALTER TABLE installments ADD COLUMN IF NOT EXISTS commission_amount integer NOT NULL DEFAULT 0;
ALTER TABLE installments ADD COLUMN IF NOT EXISTS commission_distributed boolean NOT NULL DEFAULT false;
ALTER TABLE installments ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE installments ADD COLUMN IF NOT EXISTS stripe_payment_link_id text;
ALTER TABLE package_instances ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE package_instances ADD COLUMN IF NOT EXISTS default_payment_method_id text;
ALTER TABLE package_instances ADD COLUMN IF NOT EXISTS auto_charge_enabled boolean NOT NULL DEFAULT false;
